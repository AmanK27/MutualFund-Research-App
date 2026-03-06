/**
 * normalizer.js — Anti-Corruption Layer / Adapter Pattern
 *
 * PROBLEM: Our UI and algorithmic components (advisor, charts, etc.) consume raw,
 * unstable JSON directly from mfapi.in, Kuvera, and Groww. When these APIs omit
 * or rename fields, the consuming code breaks unpredictably.
 *
 * SOLUTION: Every raw API response is passed through one of the adapter functions
 * below, which map chaotic external JSON → our strict internal StandardFundObject.
 * Consumers only ever deal with the internal schema — API changes are isolated here.
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * StandardFundObject — Internal Contract
 * ─────────────────────────────────────────────────────────────────────────────────
 *
 * {
 *   identifiers: {
 *     schemeCode: string,      // mfapi.in numeric code as string
 *     isin:       string|null, // ISIN if available
 *     slug:       string|null  // URL slug (Groww/Kuvera)
 *   },
 *   meta: {
 *     cleanName:  string,      // Formatted, human-readable fund name
 *     fundHouse:  string|null, // AMC / Fund House
 *     category:   string|null, // Scheme category (e.g. "Mid Cap Fund")
 *     planType:   string,      // 'DIRECT' | 'REGULAR' | 'UNKNOWN'
 *     optionType: string       // 'GROWTH'  | 'IDCW'   | 'UNKNOWN'
 *   },
 *   nav: {
 *     current: number|null,              // Latest NAV value
 *     date:    string|null,              // Latest NAV date (DD-MM-YYYY)
 *     history: [{ date: Date, nav: number }]  // Parsed, sorted chronologically
 *   },
 *   details: {
 *     aum:          number|null, // Assets Under Management (₹ Cr)
 *     expenseRatio: number|null, // Total Expense Ratio (%)
 *     exitLoad:     string|null  // Exit load text description
 *   },
 *   risk: {
 *     volatility: number|null,
 *     sharpe:     number|null,
 *     sortino:    number|null,
 *     alpha:      number|null,
 *     beta:       number|null
 *   },
 *   portfolio: {
 *     equityPct:   number|null,
 *     debtPct:     number|null,
 *     cashPct:     number|null,
 *     topHoldings: [{ name: string, weight: number }]
 *   },
 *   returns: {
 *     '1Y': number|null,  // 1-year CAGR (decimal, e.g. 0.28 = 28%)
 *     '3Y': number|null,  // 3-year CAGR
 *     '5Y': number|null   // 5-year CAGR
 *   }
 * }
 */

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Returns `value` if truthy and not NaN, otherwise `null`.
 * @param {*} value
 * @returns {number|null}
 */
function safeNum(value) {
    const n = parseFloat(value);
    return (!isNaN(n) && n !== null && value !== '' && value !== undefined) ? n : null;
}

/**
 * Returns `value` if it's a non-empty string, otherwise `null`.
 * @param {*} value
 * @returns {string|null}
 */
function safeStr(value) {
    return (typeof value === 'string' && value.trim().length > 0) ? value.trim() : null;
}

/**
 * Derives 'DIRECT' | 'REGULAR' | 'UNKNOWN' from a fund scheme name string.
 * Used only as a last-resort fallback when no explicit API field is available.
 * @param {string} name
 * @returns {'DIRECT'|'REGULAR'|'UNKNOWN'}
 */
function inferPlanType(name) {
    if (!name) return 'UNKNOWN';
    const n = name.toUpperCase();
    if (n.includes('DIRECT')) return 'DIRECT';
    if (n.includes('REGULAR')) return 'REGULAR';
    return 'UNKNOWN';
}

/**
 * Derives 'GROWTH' | 'IDCW' | 'UNKNOWN' from a fund scheme name string.
 * Used only as a last-resort fallback when no explicit API field is available.
 * @param {string} name
 * @returns {'GROWTH'|'IDCW'|'UNKNOWN'}
 */
function inferOptionType(name) {
    if (!name) return 'UNKNOWN';
    const n = name.toUpperCase();
    if (n.includes('IDCW') || n.includes('DIVIDEND')) return 'IDCW';
    if (n.includes('GROWTH')) return 'GROWTH';
    return 'UNKNOWN';
}

// ──────────────────────────────────────────────────────────────────────────────
// Step 2 — API-Specific Adapters (added in Step 2 of implementation)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Adapter for mfapi.in fund detail response.
 * Extracts identifiers, raw meta, and NAV history.
 *
 * @param {Object} rawJson - Raw JSON from https://api.mfapi.in/mf/{code}
 * @returns {Partial<StandardFundObject>}
 */
function normalizeAmfi(rawJson) {
    if (!rawJson) return {};

    const meta = rawJson.meta || {};
    const schemeName = safeStr(meta.scheme_name) || '';

    // Parse NAV history into sorted Date objects
    const history = Array.isArray(rawJson.data)
        ? rawJson.data.map(d => {
            const parts = (d.date || '').split('-');
            return {
                date: parts.length === 3
                    ? new Date(+parts[2], +parts[1] - 1, +parts[0])
                    : new Date(d.date),
                nav: parseFloat(d.nav)
            };
        }).sort((a, b) => a.date - b.date)
        : [];

    const latestEntry = history.length > 0 ? history[history.length - 1] : null;

    return {
        identifiers: {
            schemeCode: safeStr(String(meta.scheme_code || '')),
            isin: safeStr(meta.isin_div_payout_isin_growth) || safeStr(meta.isin_div_reinvestment),
            slug: null
        },
        meta: {
            cleanName: schemeName,
            fundHouse: safeStr(meta.fund_house),
            category: safeStr(meta.scheme_category),
            planType: inferPlanType(schemeName),   // inferred fallback; overridden by Kuvera
            optionType: inferOptionType(schemeName)  // inferred fallback; overridden by Kuvera
        },
        nav: {
            current: latestEntry ? safeNum(latestEntry.nav) : null,
            date: latestEntry ? latestEntry.date.toLocaleDateString('en-GB') : null,
            history
        }
    };
}

/**
 * Adapter for Kuvera fund detail API response.
 * This is the AUTHORITATIVE source for planType and optionType — do NOT override these
 * with inferred values from names.
 *
 * @param {Object} rawJson - Raw JSON from https://api.kuvera.in/mf/api/v4/fund_schemes/{code}.json
 * @returns {Partial<StandardFundObject>}
 */
function normalizeKuvera(rawJson) {
    if (!rawJson) return {};

    // Kuvera returns either an array or a root object
    const root = Array.isArray(rawJson) ? rawJson[0] : rawJson;
    if (!root) return {};

    const fund = root.fund || root;
    const alloc = root.asset_allocation || fund.asset_allocation || null;

    // Map Kuvera plan_type/option_type to our strict internal values
    const rawPlan = safeStr(root.plan_type || fund.plan_type);
    const rawOption = safeStr(root.option_type || fund.option_type);

    let planType = 'UNKNOWN';
    let optionType = 'UNKNOWN';

    if (rawPlan) {
        const p = rawPlan.toUpperCase();
        if (p === 'DIRECT' || p.includes('DIRECT')) planType = 'DIRECT';
        else if (p === 'REGULAR' || p.includes('REGULAR')) planType = 'REGULAR';
    }

    if (rawOption) {
        const o = rawOption.toUpperCase();
        if (o === 'GROWTH' || o.includes('GROWTH')) optionType = 'GROWTH';
        else if (o.includes('IDCW') || o.includes('DIVIDEND')) optionType = 'IDCW';
    }

    return {
        meta: {
            category: safeStr(fund.category) || safeStr(root.scheme_category),
            planType,   // authoritative — always from explicit API field
            optionType  // authoritative — always from explicit API field
        },
        portfolio: {
            equityPct: alloc ? safeNum(alloc.equity) : null,
            debtPct: alloc ? safeNum(alloc.debt) : null,
            cashPct: alloc ? (safeNum(alloc.cash) ?? safeNum(alloc.others)) : null
        }
    };
}

/**
 * Adapter for Groww fund detail API response.
 * Extracts AUM, expense ratio, exit load, and risk statistics.
 *
 * @param {Object} rawJson - Raw JSON from Groww scheme detail endpoint
 * @returns {Partial<StandardFundObject>}
 */
function normalizeGroww(rawJson) {
    if (!rawJson) return {};

    const riskStats = rawJson.risk_stats || {};
    const holdings = Array.isArray(rawJson.holdings) ? rawJson.holdings : [];

    return {
        details: {
            aum: safeNum(rawJson.aum),
            expenseRatio: safeNum(rawJson.expense_ratio),
            exitLoad: safeStr(rawJson.exit_load_text) || safeStr(rawJson.exit_load)
        },
        risk: {
            volatility: safeNum(riskStats.std_dev || rawJson.std_dev),
            sharpe: safeNum(riskStats.sharpe || rawJson.sharpe_ratio),
            sortino: safeNum(riskStats.sortino || rawJson.sortino_ratio),
            alpha: safeNum(riskStats.alpha || rawJson.alpha),
            beta: safeNum(riskStats.beta || rawJson.beta)
        },
        portfolio: {
            topHoldings: holdings.map(h => ({
                name: safeStr(h.holding_name || h.name) || 'Unknown',
                weight: safeNum(h.corpus_per || h.weight || h.percentage) || 0
            }))
        }
    };
}

// ──────────────────────────────────────────────────────────────────────────────
// Step 3 — Master Merger (added in Step 3 of implementation)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Merges the three normalizer outputs into a single, complete StandardFundObject.
 *
 * Merge priority (highest wins):
 *   planType:   Kuvera explicit field > AMFI name inference > 'UNKNOWN'
 *   optionType: Kuvera explicit field > AMFI name inference > 'UNKNOWN'
 *   All other fields layered: AMFI base → Groww details → Kuvera meta/portfolio
 *
 * @param {Object} amfiRaw   - Raw response from mfapi.in
 * @param {Object} kuveraRaw - Raw response from Kuvera (may be null)
 * @param {Object} growwRaw  - Raw response from Groww  (may be null)
 * @param {Object} extras    - Optional overrides (e.g. { details: { aum } } from GitHub CSV)
 * @returns {StandardFundObject}
 */
function createStandardFund(amfiRaw, kuveraRaw = null, growwRaw = null, extras = {}) {
    const amfi = normalizeAmfi(amfiRaw);
    const kuvera = normalizeKuvera(kuveraRaw);
    const groww = normalizeGroww(growwRaw);

    // Determine authoritative planType / optionType:
    // Prefer Kuvera explicit values; fall back to AMFI name inference as last resort.
    const planType = (kuvera.meta?.planType && kuvera.meta.planType !== 'UNKNOWN')
        ? kuvera.meta.planType
        : (amfi.meta?.planType || 'UNKNOWN');

    const optionType = (kuvera.meta?.optionType && kuvera.meta.optionType !== 'UNKNOWN')
        ? kuvera.meta.optionType
        : (amfi.meta?.optionType || 'UNKNOWN');

    // Merge portfolio fields (Groww topHoldings + Kuvera allocation + GitHub AUM)
    const portfolio = {
        equityPct: kuvera.portfolio?.equityPct ?? null,
        debtPct: kuvera.portfolio?.debtPct ?? null,
        cashPct: kuvera.portfolio?.cashPct ?? null,
        topHoldings: groww.portfolio?.topHoldings ?? []
    };

    // Merge details (Groww expenseRatio/exitLoad wins; extras.details.aum from GitHub CSV)
    const details = {
        aum: extras.details?.aum ?? groww.details?.aum ?? null,
        expenseRatio: extras.details?.expenseRatio ?? groww.details?.expenseRatio ?? null,
        exitLoad: groww.details?.exitLoad ?? null
    };

    return {
        identifiers: amfi.identifiers || { schemeCode: null, isin: null, slug: null },
        meta: {
            cleanName: amfi.meta?.cleanName || '',
            fundHouse: amfi.meta?.fundHouse || null,
            category: kuvera.meta?.category || amfi.meta?.category || null,
            planType,
            optionType
        },
        nav: amfi.nav || { current: null, date: null, history: [] },
        details,
        risk: groww.risk || { volatility: null, sharpe: null, sortino: null, alpha: null, beta: null },
        portfolio,
        returns: { '1Y': null, '3Y': null, '5Y': null }
    };
}

// Export for use in api.js (browser global pattern — no ES modules)
window.Normalizer = { normalizeAmfi, normalizeKuvera, normalizeGroww, createStandardFund };
