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
        const ONE_DAY_MS = 24 * 60 * 60 * 1000;
        const cached = await MFDB.getMetadata('amfi_categories');

        if (cached && (Date.now() - (cached.timestamp || 0)) < ONE_DAY_MS) {
            console.log('[Cache Hit] AMFI Categories loaded from IndexedDB');
            window.LIVE_FUNDS = cached.liveFunds;
            window.activeSchemeCodesSet = new Set(cached.activeCodes);
            return;
        }

        console.log('[Cache Miss] Fetching AMFI Categories from amfiindia.com...');
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

        // Persist to Cache
        await MFDB.setMetadata('amfi_categories', {
            liveFunds: window.LIVE_FUNDS,
            activeCodes: Array.from(window.activeSchemeCodesSet)
        });
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
window.SCHEME_CATEGORY_TO_LIVE_FUNDS = {
    // Equity
    'Equity Scheme - Large Cap Fund': 'Large Cap',
    'Equity Scheme - Mid Cap Fund': 'Mid Cap',
    'Equity Scheme - Small Cap Fund': 'Small Cap',
    'Equity Scheme - Flexi Cap Fund': 'Flexi Cap',
    'Equity Scheme - Large & Mid Cap Fund': 'Large & Mid Cap', // distinct SEBI category — not Large Cap
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
 * Strips plan/option suffix keywords from a scheme name to isolate the base fund name.
 * Strips ONLY structured suffixes that appear AFTER a dash delimiter, so commercial
 * names like "Nippon India Growth Fund" keep their "Growth" intact.
 *
 * e.g. "ICICI Prudential MidCap Fund - Direct Plan - Growth"  → "ICICI Prudential MidCap Fund"
 *      "Nippon India Growth Mid Cap FundPlan - Regular - IDCW" → "Nippon India Growth Mid Cap FundPlan"
 */
function extractBaseName(schemeName) {
    if (!schemeName) return '';
    const stripped = schemeName
        .replace(/\s*[-–—]\s*(direct|regular|growth|idcw|dividend|bonus|plan|option|payout|reinvestment|annual|monthly|quarterly|i|ii|iii|iv)[\s\S]*/gi, '')
        .trim();
    return stripped || schemeName;
}

/**
 * Step A: The Peer Assembler (Strict Category & Name Regex Filtering)
 * Filters window.allMfFunds for Direct Growth equivalents of the target category.
 */
function buildStrictPeerGroup(targetSubCategory) {
    if (!window.allMfFunds || !targetSubCategory) return [];

    console.log(`[Peer Assembler] Building raw pool for strict category: "${targetSubCategory}"`);

    // Normalizer equivalent - ensure we match cleanly
    const safeTargetCat = (window.Normalizer ? window.Normalizer.formatSubCategory(targetSubCategory) : targetSubCategory).toLowerCase().trim();

    return window.allMfFunds.filter(f => {
        if (!f.schemeName) return false;
        const n = f.schemeName.toLowerCase();

        // 1. Strict Category Match (No guessing from names)
        // Note: window.allMfFunds (mfapi.in root list) unfortunately does NOT contain scheme_category
        // We will do a loose name gather here, but STRICTLY enforce category in Step B when we fetch the JSON
        // For the raw pool, we cast a wider net based on the target category keyword
        const keywordSearch = safeTargetCat.replace(/equity scheme\s*-?\s*/ig, '')
            .replace(/hybrid scheme\s*-?\s*/ig, '')
            .replace(/debt scheme\s*-?\s*/ig, '')
            .replace(/other scheme\s*-?\s*/ig, '')
            .replace(/fund/ig, '')
            .trim()
            .replace(/\s+/g, ''); // "mid cap" -> "midcap"

        const nNoSpaces = n.replace(/\s+/g, '');
        if (!nNoSpaces.includes(keywordSearch)) return false;

        // 2. Strict Structural Exclusion
        if (n.includes('regular') || n.includes('idcw') || n.includes('dividend') ||
            n.includes('payout') || n.includes('bonus') || n.includes('etf')) {
            return false;
        }

        // 3. Mathematical Variant Inclusion
        // A fund passes if it explicitly says Direct AND Growth
        const hasDirect = /\bdirect\b/.test(n);
        const hasGrowth = /\bgrowth\b/.test(n);

        if (hasDirect && hasGrowth) return true;

        // Fallback: If it says Direct but omits Growth, or vice versa, and passed exclusions,
        // it might be a clean named fund (e.g. "Motilal Oswal Midcap Direct"). Let it through.
        if (hasDirect || hasGrowth) return true;

        // If it lacks both identifiers entirely but passed exclusions, it's safer to discard it to avoid 
        // polluting the top ranks with regular plans that omit the word "Regular".
        return false;

    });
}

/**
 * Step B & C: The Metric Engine & Scoring Algorithm
 * Fetches NAV/Meta for the raw pool, strictly verifies JSON category, computes vectors, and assigns percentiles.
 */
async function processAndRankPeers(rawPool, currentSchemeCode, targetSubCategory) {
    console.log(`[Metric Engine] Processing ${rawPool.length} candidates for ${targetSubCategory}...`);
    const validPeers = [];
    const safeTargetCat = (window.Normalizer ? window.Normalizer.formatSubCategory(targetSubCategory) : targetSubCategory).toLowerCase().trim();

    // Limit concurrency to prevent browser network tab crashes
    const BATCH_SIZE = 10;
    for (let i = 0; i < rawPool.length; i += BATCH_SIZE) {
        const batch = rawPool.slice(i, i + BATCH_SIZE);
        const promises = batch.map(async (peer) => {
            try {
                const res = await fetch(`https://api.mfapi.in/mf/${peer.schemeCode}`);
                if (!res.ok) return null;
                const json = await res.json();

                if (!json.data || json.data.length < 252) return null; // Need at least 1 year of data

                // STRICT JSON Category Verification
                const peerCat = json.meta?.scheme_category || "";
                const safePeerCat = (window.Normalizer ? window.Normalizer.formatSubCategory(peerCat) : peerCat).toLowerCase().trim();

                if (safePeerCat !== safeTargetCat) {
                    return null; // Mathematically discarded — wrong category
                }

                // Parse NAV History
                const navHistory = json.data.map(d => {
                    const parts = d.date.split('-');
                    return { date: new Date(+parts[2], +parts[1] - 1, +parts[0]), nav: parseFloat(d.nav) };
                }).sort((a, b) => a.date - b.date);

                // Compute Vectors
                const cagr1y = getCAGR(navHistory, 1) || 0;
                const cagr3y = getCAGR(navHistory, 3) || cagr1y; // Fallback to 1Y if < 3Y old
                const cagr5y = getCAGR(navHistory, 5) || cagr3y;
                const vol = calcVolatility(navHistory) || 1; // Avoid divide by zero
                const sharpe = calcSharpe(cagr3y, vol) || 0;

                if (cagr1y <= 0) return null;

                return {
                    schemeCode: String(peer.schemeCode),
                    schemeName: formatFundName(peer.schemeName),
                    planType: 'DIRECT',
                    optionType: 'GROWTH',
                    fromAmfiSearch: false,
                    cagr1y,
                    cagr3y,
                    cagr5y,
                    vol,
                    sharpe,
                    navCount: navHistory.length
                };
            } catch (e) {
                return null;
            }
        });

        const results = await Promise.all(promises);
        results.forEach(r => { if (r) validPeers.push(r); });
    }

    if (validPeers.length === 0) return [];

    // Scoring Algorithm (Weighted Composite)
    // Find min/max for normalization
    let maxSharpe = -Infinity;
    validPeers.forEach(p => { if (p.sharpe > maxSharpe) maxSharpe = p.sharpe; });

    validPeers.forEach(p => {
        // Normalize metrics (0 to 1) 
        // We use absolute percentage for CAGR for simplicity since they are inherently normalized ratios
        const score1Y = Math.max(0, p.cagr1y);
        const score3Y = Math.max(0, p.cagr3y);
        const score5Y = Math.max(0, p.cagr5y);
        const scoreRisk = maxSharpe > 0 ? Math.max(0, p.sharpe / maxSharpe) : 0;

        // Target Weights: 40% (3Y/5Y), 30% (1Y), 30% (Risk Adj)
        const longTermScore = (score3Y * 0.6) + (score5Y * 0.4);
        p.compositeScore = (longTermScore * 0.40) + (score1Y * 0.30) + (scoreRisk * 0.30) * 0.50; // scaled risk modifier
    });

    // Sort descending by composite score
    validPeers.sort((a, b) => b.compositeScore - a.compositeScore);

    // Assign physical ranks
    validPeers.forEach((p, index) => {
        p.rank = index + 1;
    });

    return validPeers;
}

/**
 * Step D: The Orchestrator
 * Replaces the old text-based 1Y CAGR ranking pipeline.
 */
async function getPeerRanking(categoryString, currentSchemeCode, targetSubCategory = null) {
    const categoryToSearch = targetSubCategory || categoryString;
    if (!categoryToSearch || !window.allMfFunds) return [];

    try {
        // Step A: Assemble raw candidate pool
        const rawPool = buildStrictPeerGroup(categoryToSearch);

        // Ensure current scheme is in the pool to calculate its true rank
        if (currentSchemeCode && !rawPool.some(f => String(f.schemeCode) === String(currentSchemeCode))) {
            const self = window.allMfFunds.find(f => String(f.schemeCode) === String(currentSchemeCode));
            if (self) rawPool.push(self);
        }

        // Limit the pool to prevent browser freeze (take top 80 randomly via search logic)
        const poolSlice = rawPool.slice(0, 80);

        // Step B & C: Fetch, verify, calculate, and rank
        const finalRankings = await processAndRankPeers(poolSlice, currentSchemeCode, categoryToSearch);

        console.log(`[Orchestrator] Peer ranking complete. Ranked ${finalRankings.length} verified peers for "${categoryToSearch}"`);
        return finalRankings;

    } catch (e) {
        console.error('[Orchestrator] Critical failure in peer ranking. Failsafe activated.', e);
        return [];
    }
}

/**
 * Smart Category Peers Fetcher — IndexedDB Cache-First.
 * 
 * Wraps `getPeerRanking` with a daily IndexedDB cache layer.
 * Both the Advisor and the Fund Dashboard sidebar call this function.
 * Data is fetched from MFAPI once per day per category, then served
 * from disk on every subsequent call — regardless of user navigation path.
 *
 * @param {string} categoryName - The AMFI category string (e.g., "Equity Scheme - Mid Cap Fund")
 * @param {string} [currentSchemeCode] - Optional: current fund's code to ensure it's included in ranking
 * @returns {Promise<Array>} Array of { schemeCode, schemeName, cagr1y } sorted desc by cagr1y
 */
async function fetchCategoryPeers(categoryName, currentSchemeCode = null, targetSubCategory = null) {
    if (!categoryName) return [];

    const cacheKey = categoryName.trim();

    // ── 1. Serve from IndexedDB cache if fresh (< 24 hours old) ───────────────
    try {
        const cached = await MFDB.getPeers(cacheKey);
        if (cached && cached.length > 0) {
            // Check staleness via the 'updated_at' timestamp stored alongside peers
            // MFDB.getPeers returns the raw peers array; we need to check updated_at via a direct lookup
            const db = await MFDB.init();
            const record = await new Promise((res, rej) => {
                const tx = db.transaction(['category_peers'], 'readonly');
                const req = tx.objectStore('category_peers').get(String(cacheKey));
                req.onsuccess = () => res(req.result);
                req.onerror = () => rej(req.error);
            });
            const ageMs = record ? (Date.now() - (record.updated_at || 0)) : Infinity;
            const ONE_DAY_MS = 24 * 60 * 60 * 1000;
            if (ageMs < ONE_DAY_MS) {
                console.log(`[Cache Hit] fetchCategoryPeers: "${categoryName}" (${cached.length} peers, ${Math.round(ageMs / 60000)}min old)`);
                return cached;
            }
        }
    } catch (_) { /* cache read failure is non-fatal; fall through to network */ }

    // ── 2. Network fetch via getPeerRanking ────────────────────────────────────
    console.log(`[Cache Miss] fetchCategoryPeers fetching "${categoryName}" from network...`);
    const peers = await getPeerRanking(categoryName, currentSchemeCode, targetSubCategory);

    // ── 3. Persist fresh results to IndexedDB ─────────────────────────────────
    if (peers && peers.length > 0) {
        try {
            await MFDB.setPeers(cacheKey, peers);
        } catch (_) { /* cache write failure is non-fatal */ }
    }

    return peers || [];
}

/* ═══════════════════════════════════════════════════════════════════
   API Waterfall: Platform ID Resolvers & Deep Data Fetchers
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Helper to fetch and parse AMFI CSV data from InertExpert2911 Github.
 * Extracts the latest Average_AUM_Cr.
 */
window.aumCache = new Map();

/**
 * Helper to ensure AUM cache is populated from memory, IndexedDB, or Network.
 */
async function ensureAumCache() {
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;

    // 1. Memory Check
    if (window.aumCache && window.aumCache.size > 0) return true;

    try {
        // 2. IndexedDB Check
        const cached = await MFDB.getMetadata('aum_csv_cache');
        if (cached && (Date.now() - (cached.timestamp || 0)) < ONE_DAY_MS && cached.entries) {
            console.log(`[Cache Hit] AUM Cache loaded from IndexedDB (${cached.entries.length} funds)`);
            window.aumCache = new Map(cached.entries);
            return true;
        }

        // 3. Network Fetch
        console.log('[Cache Miss] Fetching AUM Data from GitHub...');
        const url = 'https://raw.githubusercontent.com/InertExpert2911/Mutual_Fund_Data/main/mutual_fund_data.csv';
        const res = await fetch(url);
        if (!res.ok) return false;
        const csvText = await res.text();

        const lines = csvText.split('\n');
        const newCache = new Map();

        // Skipping header, parsing all lines
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            const cols = line.split(',');
            if (cols.length >= 10) {
                const code = cols[0].trim();
                const aum = parseFloat(cols[9]);
                if (!isNaN(aum)) {
                    newCache.set(code, `${aum.toFixed(2)} Cr`);
                }
            }
        }

        window.aumCache = newCache;
        console.log(`AUM Cache built: ${window.aumCache.size} funds`);

        // 4. Update IndexedDB
        await MFDB.setMetadata('aum_csv_cache', {
            entries: Array.from(window.aumCache.entries())
        });

        return true;
    } catch (e) {
        console.warn('ensureAumCache failed:', e);
        return false;
    }
}

/**
 * Fetch AUM from the cached dataset.
 */
async function fetchAUMFromGithub(schemeCode) {
    if (!schemeCode) return null;
    const ok = await ensureAumCache();
    if (!ok) return null;
    return window.aumCache.get(String(schemeCode)) || null;
}




/**
 * Master Aggregator: Fetches core NAV data and concurrently resolves/fetches deep metrics
 * from external sources. Merges all into a rigid standardized schema.
 */
async function aggregateFundDetails(schemeCode, cleanFundName) {
    if (!schemeCode) return null;

    // 1. Fetch remote API

    // 2. Cache Miss — Execute standard fetch sequence
    console.log(`[Cache Miss] Fetching ${schemeCode} from remote APIs...`);

    let amfiRaw = null;
    try {
        amfiRaw = await fetchFundData(schemeCode);
    } catch (e) {
        console.error("Master Aggregator failed at base NAV fetch:", e);
        return null;
    }

    // Extras object — collects data from sources outside the three main adapters
    const extras = { details: {} };

    const searchName = cleanFundName || (amfiRaw?.meta?.scheme_name ?? '');

    // ── Fetch AUM from GitHub CSV dataset ────────────────────────────────────
    const aumValue = await fetchAUMFromGithub(schemeCode);
    if (aumValue) extras.details.aum = aumValue;

    // ── Fetch Expense Ratio from TER tracker CSV (name-matched) ──────────────
    try {
        const terUrl = 'https://raw.githubusercontent.com/captn3m0/india-mutual-fund-ter-tracker/master/data.csv';
        const terRes = await fetch(terUrl);
        if (terRes.ok) {
            const csvText = await terRes.text();
            const lines = csvText.split('\n');
            let normalizedTarget = searchName.toLowerCase().replace(/[^a-z0-9]/g, '');
            normalizedTarget = normalizedTarget.replace('fund', '').replace('direct', '').replace('growth', '').replace('plan', '');

            for (let i = 1; i < lines.length; i++) {
                const line = lines[i];
                const cols = line.split(',');
                if (cols.length > 10) {
                    const rowName = cols[0].toLowerCase().replace(/[^a-z0-9]/g, '');
                    if (rowName.includes(normalizedTarget) && rowName.includes("direct")) {
                        const directTer = parseFloat(cols[10]);
                        if (!isNaN(directTer)) {
                            extras.details.expenseRatio = directTer;
                            break;
                        }
                    }
                }
            }
        }
    } catch (e) {
        console.warn("Expense Ratio fetch failed:", e);
    }

    // ── Fetch Asset Allocation + Category from Kuvera ────────────────────────
    let kuveraRaw = null;
    try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 3000);
        const kvRes = await fetch(
            `https://api.kuvera.in/mf/api/v4/fund_schemes/${schemeCode}.json`,
            { signal: ctrl.signal }
        );
        clearTimeout(timer);
        if (kvRes.ok) kuveraRaw = await kvRes.json();
    } catch (_) { /* Kuvera errors are not fatal */ }

    // ── Build StandardFundObject via normalizer ───────────────────────────────
    const fund = Normalizer.createStandardFund(amfiRaw, kuveraRaw, null, extras);

    // ── Backward-compatibility aliases ───────────────────────────────────────
    // These allow legacy code (app.js compare, portfolio view) to keep working
    // without requiring an immediate update of every consumer.
    // New code should always use the StandardFundObject keys directly.
    fund.data = fund.nav.history;           // legacy: fund.data[]
    fund.meta.scheme_name = fund.meta.cleanName;             // compare renderCompareTable
    fund.portfolio.equity_percentage = fund.portfolio.equityPct;  // portfolio view
    fund.portfolio.debt_percentage = fund.portfolio.debtPct;
    fund.portfolio.cash_percentage = fund.portfolio.cashPct;
    fund.portfolio.expense_ratio = fund.details.expenseRatio;
    fund.portfolio.aum = fund.details.aum;
    fund.portfolio.exit_load = fund.details.exitLoad;
    fund.portfolio.holdings = fund.portfolio.topHoldings;
    fund.schemeCode = String(schemeCode);
    fund.name = fund.meta.cleanName; // legacy alias for search/split logic

    return fund;
}
