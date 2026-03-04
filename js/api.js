/* ═══════════════════════════════════════════════════════════════════
   api.js — All network fetch logic
   Depends on: utils.js (sanitizeForGroww, prepareNavData)
   Uses globals: window.allMfFunds, window.LIVE_FUNDS, window.activeSchemeCodesSet
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Fetch the global master list of all MF scheme codes from mfapi.in
 */
async function fetchGlobalFundList() {
    if (window.allMfFunds && window.allMfFunds.length > 0) return; // already loaded
    try {
        const res = await fetch('https://api.mfapi.in/mf');
        if (!res.ok) return;
        window.allMfFunds = await res.json();
        console.log(`Global fund list loaded: ${window.allMfFunds.length} funds`);
    } catch (e) {
        console.warn('Could not fetch global fund list:', e);
    }
}

/**
 * Fetch NAV history + metadata for a fund from mfapi.in
 */
async function fetchFundData(schemeCode) {
    let resp;
    try {
        resp = await fetch(`https://api.mfapi.in/mf/${schemeCode}`);
    } catch (netErr) {
        throw new Error('Network error — if you opened this via file://, please use a local HTTP server to avoid CORS issues.');
    }
    if (!resp.ok) throw new Error(`API returned HTTP ${resp.status}`);
    const json = await resp.json();

    if (!json.data || json.data.length === 0 || !json.meta || !json.meta.scheme_name) {
        throw new Error('Invalid scheme code or no data available for this fund.');
    }

    return json; // { meta, data, status }
}

/**
 * Fetch and parse the AMFI NAVAll.txt to build window.LIVE_FUNDS
 * (the authoritative category → fund list mapping)
 */
async function fetchLiveAmfiCategories() {
    try {
        const proxyUrl = 'https://corsproxy.io/?url=' + encodeURIComponent('https://www.amfiindia.com/spages/NAVAll.txt');
        const res = await fetch(proxyUrl);
        if (!res.ok) throw new Error("AMFI fetch failed");
        const text = await res.text();

        const lines = text.split('\n');
        let currentCategory = null;

        window.activeSchemeCodesSet = window.activeSchemeCodesSet || new Set();
        const _cutoff = new Date();
        _cutoff.setDate(_cutoff.getDate() - 7);
        _cutoff.setHours(0, 0, 0, 0);
        const _monthMap = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };

        const categoryMapping = {
            'Conservative Hybrid Fund': 'Conservative Hybrid',
            'Balanced Advantage Fund': 'Balanced Advantage',
            'Dynamic Asset Allocation/Balanced Advantage': 'Balanced Advantage',
            'Dynamic Asset Allocation or Balanced Advantage': 'Balanced Advantage',
            'Aggressive Hybrid Fund': 'Aggressive Hybrid',
            'Arbitrage Fund': 'Arbitrage',
            'Large Cap Fund': 'Large Cap',
            'Mid Cap Fund': 'Mid Cap',
            'Small Cap Fund': 'Small Cap',
            'Flexi Cap Fund': 'Flexi Cap',
            'ELSS': 'ELSS',
            'Liquid Fund': 'Liquid',
            'Money Market Fund': 'Money Market',
            'Corporate Bond Fund': 'Corporate Bond',
            'Gilt Fund': 'Gilt',
            'Index Funds': 'Index Funds',
            'Exchange Traded Fund': 'ETFs'
        };

        const categoryRegex = /^Open Ended Schemes\s*\((.*-\s*([^)]+))\)/i;

        Object.values(categoryMapping).forEach(uiName => {
            window.LIVE_FUNDS[uiName] = [];
        });

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            if (!line.includes(';')) {
                const match = line.match(categoryRegex);
                if (match && match[2]) {
                    let rawCat = match[2].trim();
                    if (rawCat.includes("ELSS")) rawCat = "ELSS";
                    if (!categoryMapping[rawCat] && rawCat.toLowerCase().includes('balanced advantage')) {
                        rawCat = 'Dynamic Asset Allocation/Balanced Advantage';
                    }
                    if (!categoryMapping[rawCat] && rawCat.toUpperCase().includes('ETF')) {
                        rawCat = 'Exchange Traded Fund';
                    }
                    currentCategory = categoryMapping[rawCat] || null;
                }
            } else {
                const parts = line.split(';');
                if (parts.length >= 6) {
                    const code = parts[0].trim();
                    const name = parts[3].trim();
                    const navStr = parts[4].trim();
                    const dateStr = parts[5].trim();

                    if (dateStr) {
                        const dp = dateStr.split('-');
                        if (dp.length === 3) {
                            const navDate = new Date(_monthMap[dp[1]] !== undefined
                                ? Date.UTC(+dp[2], _monthMap[dp[1]], +dp[0])
                                : NaN);
                            if (!isNaN(navDate) && navDate >= _cutoff) {
                                window.activeSchemeCodesSet.add(code);
                            }
                        }
                    }

                    if (currentCategory && parts.length >= 5) {
                        const nameUpper = name.toUpperCase();
                        const isEtf = currentCategory === 'ETFs';
                        const passesFilter = isEtf
                            ? !window.LIVE_FUNDS['ETFs'].some(f => f.code === code)
                            : (nameUpper.includes('DIRECT') && nameUpper.includes('GROWTH'));

                        if (passesFilter) {
                            window.LIVE_FUNDS[currentCategory].push({
                                code: code,
                                name: name,
                                nav: parseFloat(navStr) || 0,
                                cagr1: null, cagr3: null, vol: null, sharpe: null, aum: null
                            });
                        }
                    }
                }
            }
        }

        console.log('AMFI Live Categories Built Successfully');
    } catch (e) {
        console.error('fetchLiveAmfiCategories failed:', e);
        throw e;
    }
}

/**
 * Helper: perform a single Groww search query and return matching Scheme results
 */
async function performGrowwSearch(query) {
    const searchUrl = 'https://groww.in/v1/api/search/v3/query/global/st_p_query?page=0&query=' + encodeURIComponent(query);
    const proxySearchUrl = 'https://api.allorigins.win/get?url=' + encodeURIComponent(searchUrl);
    const res = await fetch(proxySearchUrl);
    if (!res.ok) return [];
    const wrapperJson = await res.json();
    if (!wrapperJson.contents) return [];
    const json = JSON.parse(wrapperJson.contents);
    return (json.data && json.data.content) ? json.data.content.filter(x => x.entity_type === 'Scheme') : [];
}

/**
 * Fetch advanced fund data (AUM, expense ratio, exit load, holdings)
 * from Groww via allorigins.win proxy.
 * Returns null on failure.
 */
async function fetchAdvancedFundData(schemeName) {
    try {
        const cleanName = sanitizeForGroww(schemeName);

        // 1. Search Groww for the fund
        let contentArr = await performGrowwSearch(cleanName);

        // Retry with simplified query if no results
        if (!contentArr || contentArr.length === 0) {
            const simplifiedName = cleanName.replace(/\s*fund\s*/gi, '').replace(/\s*mf\s*/gi, '');
            if (simplifiedName !== cleanName) {
                contentArr = await performGrowwSearch(simplifiedName);
            }
        }

        if (!contentArr || contentArr.length === 0) return null;

        // Prefer Direct Plan search_id
        let selectedScheme = contentArr.find(x => x.search_id && x.search_id.toLowerCase().includes('direct'));
        if (!selectedScheme) selectedScheme = contentArr[0];

        const searchId = selectedScheme.search_id;
        if (!searchId) return null;

        // 2. Fetch Scheme Details
        const detailUrl = 'https://groww.in/v1/api/data/mf/web/v2/scheme/search/' + searchId;
        const proxyDetailUrl = 'https://api.allorigins.win/get?url=' + encodeURIComponent(detailUrl);

        const detailRes = await fetch(proxyDetailUrl);
        if (!detailRes.ok) return null;

        const detailWrapper = await detailRes.json();
        if (!detailWrapper.contents) return null;
        const detailJson = JSON.parse(detailWrapper.contents);

        // 3. Validate Direct plan
        if (detailJson.plan_type !== 'Direct') {
            console.warn(`Fetched scheme for "${schemeName}" is not a Direct plan (${detailJson.plan_type}). Skipping.`);
            return null;
        }

        return {
            aum: detailJson.aum,
            expenseRatio: detailJson.expense_ratio,
            exitLoad: detailJson.exit_load,
            holdings: detailJson.holdings || [],
            assetAllocation: detailJson.asset_allocation || [],
            riskStats: detailJson.risk_stats || {},
            ratingDistribution: detailJson.rating_distribution || [],
            minInvestment: detailJson.min_investment,
            minAdditionalInvestment: detailJson.min_additional_investment,
            minSipInvestment: detailJson.min_sip_investment,
            minWithdrawal: detailJson.min_withdrawal,
            fundHouse: detailJson.fund_house,
            schemeType: detailJson.scheme_type,
            riskGrade: detailJson.risk_grade,
            returnGrade: detailJson.return_grade,
            details: detailJson // Keep full object for any extra fields
        };
    } catch (err) {
        console.warn('Advanced fetch failed:', err);
        return null;
    }
}

// Maps mfapi.in scheme_category strings → LIVE_FUNDS subcategory key
// (authoritative AMFI-parsed category buckets)
const SCHEME_CATEGORY_TO_LIVE_FUNDS = {
    // Equity
    'Equity Scheme - Large Cap Fund': 'Large Cap',
    'Equity Scheme - Mid Cap Fund': 'Mid Cap',
    'Equity Scheme - Small Cap Fund': 'Small Cap',
    'Equity Scheme - Flexi Cap Fund': 'Flexi Cap',
    'Equity Scheme - Large & Mid Cap Fund': 'Large Cap',
    'Equity Scheme - Multi Cap Fund': 'Flexi Cap',
    'Equity Scheme - ELSS': 'ELSS',
    'Equity Scheme - Focused Fund': 'Flexi Cap',
    'Equity Scheme - Dividend Yield Fund': 'Flexi Cap',
    'Equity Scheme - Value Fund': 'Flexi Cap',
    'Equity Scheme - Contra Fund': 'Flexi Cap',
    'Equity Scheme - Sectoral/Thematic': 'Flexi Cap',
    // Hybrid
    'Hybrid Scheme - Aggressive Hybrid Fund': 'Aggressive Hybrid',
    'Hybrid Scheme - Balanced Advantage': 'Balanced Advantage',
    'Hybrid Scheme - Dynamic Asset Allocation': 'Balanced Advantage',
    'Hybrid Scheme - Conservative Hybrid Fund': 'Conservative Hybrid',
    'Hybrid Scheme - Arbitrage Fund': 'Arbitrage',
    // Debt
    'Debt Scheme - Liquid Fund': 'Liquid',
    'Debt Scheme - Money Market Fund': 'Money Market',
    'Debt Scheme - Corporate Bond Fund': 'Corporate Bond',
    'Debt Scheme - Gilt Fund': 'Gilt',
    // Passives
    'Other Scheme - Index Funds': 'Index Funds',
    'Other Scheme - ETFs': 'ETFs',
    'Other Scheme - FOF (Overseas)': 'Index Funds',
};

/**
 * Fetch peer fund rankings for a given AMFI category.
 * Returns array of { schemeCode, schemeName, cagr1y } sorted desc.
 */
async function getPeerRanking(categoryString, currentSchemeCode) {
    if (!window.allMfFunds || !categoryString) return [];

    const liveFundsKey = SCHEME_CATEGORY_TO_LIVE_FUNDS[categoryString.trim()] || null;
    const liveFundsList = liveFundsKey && window.LIVE_FUNDS && window.LIVE_FUNDS[liveFundsKey]
        ? window.LIVE_FUNDS[liveFundsKey]
        : [];

    let peers = [];
    if (liveFundsList.length > 1) {
        const liveFundsCodeSet = new Set(liveFundsList.map(f => String(f.code)));
        peers = window.allMfFunds.filter(f => liveFundsCodeSet.has(String(f.schemeCode)));
    }

    if (peers.length < 2) {
        const keyword = categoryString
            .replace(/Equity Scheme\s*-?\s*/ig, '')
            .replace(/Hybrid Scheme\s*-?\s*/ig, '')
            .replace(/Debt Scheme\s*-?\s*/ig, '')
            .replace(/Other Scheme\s*-?\s*/ig, '')
            .replace(/Open Ended Schemes/ig, '')
            .replace(/Fund/ig, '')
            .trim();

        if (keyword) {
            peers = window.allMfFunds.filter(f => {
                if (!f.schemeName) return false;
                const nameUpper = f.schemeName.toUpperCase();
                return nameUpper.includes(keyword.toUpperCase()) &&
                    nameUpper.includes('DIRECT') &&
                    nameUpper.includes('GROWTH');
            });
        }
    }

    const hasCurrent = peers.find(p => String(p.schemeCode) === String(currentSchemeCode));
    if (!hasCurrent) {
        const currentFromMaster = window.allMfFunds.find(p => String(p.schemeCode) === String(currentSchemeCode));
        if (currentFromMaster) peers.push(currentFromMaster);
    }

    peers = peers.slice(0, 20);

    const fetchPromises = peers.map(async (peer) => {
        try {
            const res = await fetch(`https://api.mfapi.in/mf/${peer.schemeCode}`);
            if (!res.ok) return null;
            const data = await res.json();
            if (!data || !data.data || data.data.length === 0) return null;

            const navHistory = data.data.map(d => {
                const parts = d.date.split('-');
                return { date: new Date(parts[2], parts[1] - 1, parts[0]), nav: parseFloat(d.nav) };
            }).sort((a, b) => a.date - b.date);

            const cagr1y = getCAGR(navHistory, 1);
            return { schemeCode: String(peer.schemeCode), schemeName: formatFundName(peer.schemeName), cagr1y };
        } catch (err) {
            console.error("Peer fetch failed for", peer.schemeCode, err);
            return null;
        }
    });

    const results = await Promise.all(fetchPromises);
    const validRankings = results.filter(r => r !== null && r.cagr1y !== null);
    validRankings.sort((a, b) => b.cagr1y - a.cagr1y);
    return validRankings;
}

/* ═══════════════════════════════════════════════════════════════════
   API Waterfall: Platform ID Resolvers & Deep Data Fetchers
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Hits Kuvera's search API via proxy to resolve a clean fund name to an ISIN.
 * Defaults to the top matching result.
 */
async function resolveKuveraName(cleanFundName) {
    try {
        const query = encodeURIComponent(cleanFundName);
        const proxyUrl = `https://corsproxy.io/?url=${encodeURIComponent('https://api.kuvera.in/api/v3/funds/search.json?q=' + query)}`;

        const res = await fetch(proxyUrl);
        if (!res.ok) return null;

        const data = await res.json();
        if (data && data.length > 0 && data[0].isin) {
            return data[0].isin;
        }
        return null;
    } catch (e) {
        console.warn(`Kuvera ISIN resolution failed for ${cleanFundName}:`, e);
        return null;
    }
}

/**
 * Standardizes a mutual fund name into the Groww slug format.
 * (e.g., "Axis Midcap Fund Direct Growth" -> "axis-midcap-fund-direct-growth")
 */
async function resolveGrowwSlug(cleanFundName) {
    if (!cleanFundName) return null;

    // Groww's slug builder typically lowers case, replaces spaces/special chars with hyphens, 
    // and collapses multiple hyphens.
    const slug = cleanFundName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

    return slug;
}

/**
 * Fetches deep metrics from Kuvera using ISIN.
 */
async function fetchKuveraDetails(isin) {
    if (!isin) return null;
    try {
        const proxyUrl = `https://corsproxy.io/?url=${encodeURIComponent('https://api.kuvera.in/api/v3/funds/' + isin + '.json')}`;
        const res = await fetch(proxyUrl);
        if (!res.ok) return null;
        const data = await res.json();
        return data; // Extract holdings, sectors, volatility, sharpe, sortino, alpha, beta later
    } catch (e) {
        console.warn(`Kuvera detail fetch failed for ISIN ${isin}:`, e);
        return null;
    }
}

/**
 * Fetches deep metrics from Groww using Slug.
 */
async function fetchGrowwDetails(slug) {
    if (!slug) return null;
    try {
        const proxyUrl = `https://corsproxy.io/?url=${encodeURIComponent('https://groww.in/v1/api/data/mf/web/v3/scheme/search/' + slug)}`;
        const res = await fetch(proxyUrl);
        if (!res.ok) return null;
        const data = await res.json();
        return data; // Extract aum, expense_ratio, exit_load later
    } catch (e) {
        console.warn(`Groww detail fetch failed for slug ${slug}:`, e);
        return null;
    }
}

/**
 * Master Aggregator: Fetches core NAV data and concurrently resolves/fetches deep metrics
 * from Kuvera and Groww. Merges all into a rigid standardized schema.
 */
async function aggregateFundDetails(schemeCode, cleanFundName) {
    if (!schemeCode) return null;

    // Step A: Fetch base data
    let baseData = null;
    try {
        baseData = await fetchFundData(schemeCode);
    } catch (e) {
        console.error("Master Aggregator failed at base NAV fetch:", e);
        return null; // Fatal error, can't proceed without core data
    }

    // Fallback if name isn't provided (try to get from metadata)
    const searchName = cleanFundName || (baseData && baseData.meta ? baseData.meta.scheme_name : "");

    // Step B & C: Concurrently resolve IDs and fetch deep data
    const [kuveraData, growwData] = await Promise.all([
        resolveKuveraName(searchName).then(isin => fetchKuveraDetails(isin)),
        resolveGrowwSlug(searchName).then(slug => fetchGrowwDetails(slug))
    ]);

    // Standardized Schema Definition
    const fund = {
        meta: baseData.meta || {},
        data: baseData.data ? prepareNavData(baseData.data) : [],

        // Deep Metrics (Coalesced and strict null defaults)
        portfolio: {
            aum: null,
            expense_ratio: null,
            exit_load: null,
            holdings: [],
            sectors: [],
            equity_percentage: null,
            debt_percentage: null,
            cash_percentage: null
        },
        risk: {
            volatility: null,
            sharpe: null,
            sortino: null,
            alpha: null,
            beta: null
        }
    };

    // Step D: Map Kuvera Data
    if (kuveraData && kuveraData.length > 0) {
        const kFund = kuveraData[0];

        // Risk Ratios
        if (kFund.volatility !== undefined) fund.risk.volatility = kFund.volatility;
        if (kFund.sharpe !== undefined) fund.risk.sharpe = kFund.sharpe;
        if (kFund.sortino !== undefined) fund.risk.sortino = kFund.sortino;
        if (kFund.alpha !== undefined) fund.risk.alpha = kFund.alpha;
        if (kFund.beta !== undefined) fund.risk.beta = kFund.beta;

        // Portfolio Arrays
        if (kFund.portfolio) {
            fund.portfolio.holdings = kFund.portfolio || [];
        }
        if (kFund.sectors) {
            fund.portfolio.sectors = kFund.sectors || [];
        }

        // Asset Allocation (Kuvera often holds this in asset_allocations array or similar)
        if (kFund.asset_allocation) {
            fund.portfolio.equity_percentage = kFund.asset_allocation.equity || null;
            fund.portfolio.debt_percentage = kFund.asset_allocation.debt || null;
            fund.portfolio.cash_percentage = kFund.asset_allocation.cash || null;
        }
    }

    // Step D: Map Groww Data
    if (growwData && growwData.aum_details) {
        fund.portfolio.aum = growwData.aum_details.aum || null;
    }
    if (growwData && growwData.expense_ratio !== undefined) {
        fund.portfolio.expense_ratio = growwData.expense_ratio || null;
    }
    if (growwData && growwData.exit_load_text) {
        fund.portfolio.exit_load = growwData.exit_load_text || null;
    }

    // In case Groww proxy has asset allocation where Kuvera failed
    if (growwData && growwData.asset_allocation) {
        if (!fund.portfolio.equity_percentage && growwData.asset_allocation.equity) {
            fund.portfolio.equity_percentage = growwData.asset_allocation.equity;
        }
        if (!fund.portfolio.debt_percentage && growwData.asset_allocation.debt) {
            fund.portfolio.debt_percentage = growwData.asset_allocation.debt;
        }
    }

    return fund;
}
