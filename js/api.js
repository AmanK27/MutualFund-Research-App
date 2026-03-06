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
window.SCHEME_CATEGORY_TO_LIVE_FUNDS = {
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
 * Derive plan type from a fund scheme name string.
 * @param {string} name
 * @returns {'DIRECT'|'REGULAR'|'UNKNOWN'}
 */
function derivePlanType(name) {
    if (!name) return 'UNKNOWN';
    const n = name.toUpperCase();
    if (n.includes('DIRECT')) return 'DIRECT';
    if (n.includes('REGULAR')) return 'REGULAR';
    return 'UNKNOWN';
}

/**
 * Derive option type from a fund scheme name string.
 * @param {string} name
 * @returns {'GROWTH'|'IDCW'|'UNKNOWN'}
 */
function deriveOptionType(name) {
    if (!name) return 'UNKNOWN';
    const n = name.toUpperCase();
    if (n.includes('IDCW') || n.includes('DIVIDEND')) return 'IDCW';
    if (n.includes('GROWTH')) return 'GROWTH';
    return 'UNKNOWN';
}

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
 * Discovery & Verification — Given the raw name of a top-performing fund candidate,
 * searches mfapi.in for its official AMFI scheme listing and extracts the Direct Plan + Growth
 * variant's scheme code. Then fetches its NAV, computes 1Y CAGR, and enforces a strict
 * AMFI sub-category match to prevent cross-category recommendations.
 *
 * @param {string} rawSchemeName      - The candidate fund's schemeName (may be truncated)
 * @param {string} currentSchemeCode  - Exclude self from results
 * @param {string|null} targetSubCategory - AMFI scheme_category of the TARGET fund.
 *   If provided, ONLY a peer whose AMFI scheme_category === targetSubCategory is returned.
 *   A 'Large & Mid Cap' peer will be discarded when target is 'Mid Cap', etc.
 * @returns {Promise<Object|null>} Verified peer object or null if not found / wrong category
 */
async function findTrueBestPeer(rawSchemeName, currentSchemeCode, targetSubCategory = null) {
    const baseName = extractBaseName(rawSchemeName);
    if (!baseName) return null;

    console.log(`[Discovery] Searching AMFI for Direct Growth variant of: "${baseName}"`);

    try {
        const res = await fetch(`https://api.mfapi.in/mf/search?q=${encodeURIComponent(baseName)}`);
        if (!res.ok) return null;
        const results = await res.json();

        if (!results || results.length === 0) {
            console.warn(`[Discovery] No AMFI results for base name: "${baseName}"`);
            return null;
        }

        // AMFI-standardised: filter for Direct Plan + Growth (SEBI-mandated verbatim naming)
        const directGrowthMatch = results.find(r => {
            const n = r.schemeName.toUpperCase();
            return n.includes('DIRECT') && n.includes('GROWTH') && !n.includes('IDCW') && !n.includes('ETF');
        });

        if (!directGrowthMatch) {
            console.warn(`[Discovery] No Direct+Growth AMFI match for "${baseName}" from ${results.length} results`);
            return null;
        }

        const verifiedCode = String(directGrowthMatch.schemeCode);
        if (verifiedCode === String(currentSchemeCode)) return null; // skip self

        // ── Fetch full fund detail from mfapi.in to get scheme_category AND nav ──
        // We call this directly (rather than via getNavHistory) so we can read meta.scheme_category
        // in the same response without an extra round-trip.
        let navHistory = null;
        let peerSubCategory = null;

        try {
            const cached = await CacheManager.get(verifiedCode);
            if (CacheManager.isCacheValid(cached) && cached.data) {
                navHistory = cached.data;
                // subCategory may be stored on the cache object from a prior aggregateFundDetails call
                peerSubCategory = cached.meta?.subCategory || cached.meta?.scheme_category || null;
            }
        } catch (_) { /* cache miss is fine */ }

        // If not in cache (or no subCategory stored), fetch fresh from mfapi.in
        if (!navHistory || !peerSubCategory) {
            const fullRes = await fetch(`https://api.mfapi.in/mf/${verifiedCode}`);
            if (!fullRes.ok) return null;
            const fullJson = await fullRes.json();

            if (!fullJson.data || fullJson.data.length === 0) return null;

            peerSubCategory = fullJson.meta?.scheme_category || null;

            navHistory = fullJson.data.map(d => {
                const parts = d.date.split('-');
                return { date: new Date(+parts[2], +parts[1] - 1, +parts[0]), nav: parseFloat(d.nav) };
            }).sort((a, b) => a.date - b.date);

            // Cache nav data so getNavHistory / aggregateFundDetails benefit from this fetch
            try { await CacheManager.set(verifiedCode, { data: navHistory }); } catch (_) { }
        }

        // ── Strict AMFI sub-category enforcement ─────────────────────────────────
        if (targetSubCategory && peerSubCategory) {
            const cleanPeerCategory = window.Normalizer ? window.Normalizer.formatSubCategory(peerSubCategory) : peerSubCategory;
            if (cleanPeerCategory !== targetSubCategory) {
                console.warn(
                    `[Discovery] ❌ Category mismatch for "${directGrowthMatch.schemeName}":` +
                    ` peer is "${cleanPeerCategory}" but target requires "${targetSubCategory}" — discarded.`
                );
                return null; // caller will try the next candidate
            }
        }

        console.log(`[Discovery] ✅ AMFI-Verified (category match): "${directGrowthMatch.schemeName}" (${verifiedCode})`);

        const cagr1y = getCAGR(navHistory, 1);
        if (cagr1y === null || cagr1y <= 0) return null;

        return {
            schemeCode: verifiedCode,
            schemeName: formatFundName(directGrowthMatch.schemeName), // official AMFI name
            planType: 'DIRECT',
            optionType: 'GROWTH',
            subCategory: peerSubCategory, // AMFI-exact, used for strict category matching
            fromAmfiSearch: true,
            cagr1y
        };
    } catch (e) {
        console.warn(`[Discovery] AMFI search failed for "${baseName}":`, e);
        return null;
    }
}


/**
 * Cache-first NAV history fetcher for a single scheme code.
 * Returns sorted array of { date, nav } objects or null.
 * Uses the existing individual-fund IndexedDB cache to avoid duplicate API calls.
 * @param {string} schemeCode
 * @returns {Promise<Array|null>}
 */
async function getNavHistory(schemeCode) {
    try {
        const cached = await CacheManager.get(schemeCode);
        if (CacheManager.isCacheValid(cached) && cached.data) {
            return cached.data; // already sorted Date objects from prior fetch
        }
        const res = await fetch(`https://api.mfapi.in/mf/${schemeCode}`);
        if (!res.ok) return null;
        const json = await res.json();
        if (!json.data || json.data.length === 0) return null;
        const navHistory = json.data.map(d => {
            const parts = d.date.split('-');
            return { date: new Date(+parts[2], +parts[1] - 1, +parts[0]), nav: parseFloat(d.nav) };
        }).sort((a, b) => a.date - b.date);
        // Persist to individual fund cache (shared with the dashboard, so browsing a fund
        // pre-warms the advisor data for free)
        await CacheManager.set(schemeCode, { data: navHistory });
        return navHistory;
    } catch (e) {
        console.warn(`[getNavHistory] Failed for ${schemeCode}:`, e);
        return null;
    }
}

/**
 * Fetch peer fund rankings for a given AMFI category using Discovery & Verification.
 *
 * DISCOVERY: Builds a raw candidate pool from window.allMfFunds (keyword search),
 * excluding obvious traps (IDCW, Bonus, ETF). Fetches 1Y CAGR for each via cache-first
 * getNavHistory(). Sorts by CAGR to identify the top performers.
 *
 * VERIFICATION: Runs findTrueBestPeer() on the top raw candidates in order.
 * findTrueBestPeer() strips plan/option suffixes from the name, queries the official
 * mfapi.in/mf/search API, and extracts the Direct Plan + Growth scheme code.
 *
 * Returns an array sorted by CAGR with the AMFI-verified winner at position 0,
 * followed by Direct-Growth-filtered peers for sidebar display.
 *
 * @param {string} categoryString - mfapi.in scheme_category string
 * @param {string} currentSchemeCode - Current fund to exclude from results
 * @returns {Promise<Array>} { schemeCode, schemeName, planType, optionType, fromAmfiSearch, cagr1y }
 */
async function getPeerRanking(categoryString, currentSchemeCode, targetSubCategory = null) {
    if (!window.allMfFunds || !categoryString) return [];

    // Extract category keyword from mfapi scheme_category string
    const keyword = categoryString
        .replace(/Equity Scheme\s*-?\s*/ig, '')
        .replace(/Hybrid Scheme\s*-?\s*/ig, '')
        .replace(/Debt Scheme\s*-?\s*/ig, '')
        .replace(/Other Scheme\s*-?\s*/ig, '')
        .replace(/Open Ended Schemes/ig, '')
        .replace(/\bFund\b/ig, '')
        .trim();

    if (!keyword) return [];

    // Remove Spaces from keyword for matching ("Mid Cap" -> "MIDCAP")
    const keywordNoSpaces = keyword.toUpperCase().replace(/\s+/g, '');

    // ── Step 1: DISCOVERY ─────────────────────────────────────────────────────────────
    // Raw pool: all variants in the category from allMfFunds, excluding clear traps.
    // We intentionally include Regular/IDCW/etc. here because we want the top
    // performer BY RAW RETURN, then verify its Direct Growth counterpart.
    const rawPool = window.allMfFunds.filter(f => {
        if (!f.schemeName) return false;
        const n = f.schemeName.toUpperCase();
        // Spacing-agnostic match for "Midcap" vs "Mid Cap"
        if (!n.replace(/\s+/g, '').includes(keywordNoSpaces)) return false;
        // Exclude structural traps (dividend-adjusted returns are misleading)
        if (n.includes('BONUS') || n.includes('ETF') || n.includes('INDEX')) return false;
        return true;
    }).slice(0, 40); // reasonable cap to limit API pressure on first run

    console.log(`[getPeerRanking] Discovery pool: ${rawPool.length} raw funds for keyword "${keyword}"`);

    // Fetch CAGR for discovery pool (cache-first via getNavHistory)
    const rawWithCAGR = [];
    for (const peer of rawPool) {
        const code = String(peer.schemeCode);
        if (code === String(currentSchemeCode)) continue; // skip self
        try {
            const navHistory = await getNavHistory(code);
            if (!navHistory) continue;
            const cagr1y = getCAGR(navHistory, 1);
            if (cagr1y === null || cagr1y <= 0) continue;
            rawWithCAGR.push({ schemeCode: code, schemeName: peer.schemeName, cagr1y });
        } catch (e) { /* skip failed peers */ }
        await new Promise(r => setTimeout(r, 80));
    }

    rawWithCAGR.sort((a, b) => b.cagr1y - a.cagr1y);
    console.log(`[getPeerRanking] Discovery: top raw performer = "${rawWithCAGR[0]?.schemeName}" (+${(rawWithCAGR[0]?.cagr1y * 100)?.toFixed(2)}%)`);

    // ── Step 2–4: VERIFICATION (Discovery & Verification on top-N candidates) ────────
    // Try top 5 raw candidates in order until one yields a verified Direct Growth peer.
    // This handles edge cases where #1 raw is so niche/closed it has no Direct Growth variant.
    let verifiedWinner = null;
    for (const candidate of rawWithCAGR.slice(0, 5)) {
        verifiedWinner = await findTrueBestPeer(candidate.schemeName, currentSchemeCode, targetSubCategory);
        if (verifiedWinner) break;
    }

    if (verifiedWinner) {
        console.log(`[getPeerRanking] ✅ Verified Winner: "${verifiedWinner.schemeName}" (+${(verifiedWinner.cagr1y * 100).toFixed(2)}%)`);
    } else {
        console.warn('[getPeerRanking] Discovery & Verification failed for all top-5 candidates. Returning name-filtered Direct Growth peers as fallback.');
    }

    // ── Build final ranked list ───────────────────────────────────────────────────────
    // Take name-filtered Direct Growth peers from rawWithCAGR for the sidebar list.
    const directGrowthPeers = rawWithCAGR
        .filter(p => {
            const n = p.schemeName.toUpperCase();
            return n.includes('DIRECT') && n.includes('GROWTH') && !n.includes('IDCW');
        })
        .filter(p => !verifiedWinner || p.schemeCode !== verifiedWinner.schemeCode)
        .map(p => ({
            ...p,
            schemeName: formatFundName(p.schemeName),
            planType: 'DIRECT',
            optionType: 'GROWTH',
            fromAmfiSearch: false
        }));

    // Verified winner goes first; remaining Direct Growth peers fill the list
    const finalRankings = verifiedWinner
        ? [verifiedWinner, ...directGrowthPeers]
        : directGrowthPeers;

    return finalRankings;
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

    const cacheKey = 'peers_v3_' + categoryName.trim().replace(/\s+/g, '_').toLowerCase();

    // ── 1. Cache-First: Try IndexedDB ──────────────────────────────────────────
    // Skip cache when targetSubCategory is provided so the category-lock filter is always applied.
    // A cached result without category enforcement could serve wrong-category winners.
    if (!targetSubCategory) {
        try {
            const cached = await CacheManager.get(cacheKey);
            if (CacheManager.isCacheValid(cached) && cached.peers && cached.peers.length > 0) {
                console.log(`[Cache Hit] fetchCategoryPeers serving "${categoryName}" from IndexedDB (${cached.peers.length} funds)`);
                return cached.peers;
            }
        } catch (e) {
            console.warn('[fetchCategoryPeers] Cache retrieval failed, falling back to network:', e);
        }
    }

    // ── 2. Network Fallback: Full MFAPI Waterfall via getPeerRanking ───────────
    console.log(`[Cache Miss] fetchCategoryPeers fetching "${categoryName}" from network...`);
    const peers = await getPeerRanking(categoryName, currentSchemeCode, targetSubCategory);

    // ── 3. Store & Return ──────────────────────────────────────────────────────
    // Only cache when no targetSubCategory (general-purpose cache)
    if (!targetSubCategory && peers && peers.length > 0) {
        try {
            await CacheManager.set(cacheKey, { peers, lastFetchedAt: Date.now() });
            console.log(`[Cache Set] fetchCategoryPeers cached "${categoryName}" with ${peers.length} funds`);
        } catch (e) {
            console.warn('[fetchCategoryPeers] Cache set failed:', e);
        }
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
async function fetchAUMFromGithub(schemeCode) {
    if (!schemeCode) return null;
    try {
        const url = 'https://raw.githubusercontent.com/InertExpert2911/Mutual_Fund_Data/main/mutual_fund_data.csv';
        const res = await fetch(url);
        if (!res.ok) return null;
        const csvText = await res.text();

        // Simple manual CSV line search for the scheme code
        const lines = csvText.split('\n');
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            if (line.startsWith(`${schemeCode},`)) {
                // Format: Scheme_Code,Scheme_Name,AMC,Scheme_Type,Scheme_Category,Scheme_NAV_Name,Scheme_Min_Amt,NAV,Latest_NAV_Date,Average_AUM_Cr,...
                const cols = line.split(',');
                if (cols.length >= 10) {
                    const aum = parseFloat(cols[9]);
                    return isNaN(aum) ? null : `${aum.toFixed(2)} Cr`;
                }
            }
        }
        return null;
    } catch (e) {
        console.warn(`AUM Github fetch failed for ${schemeCode}:`, e);
        return null;
    }
}

/**
 * Helper to fetch and parse TER (Total Expense Ratio) CSV data from captn3m0 Github.
 * Matches on the ISIN since this dataset uses ISINs primarily, or string matching.
 */
async function fetchTERFromGithub(isin) {
    if (!isin) return null;
    try {
        const url = 'https://raw.githubusercontent.com/captn3m0/india-mutual-fund-ter-tracker/master/data.csv';
        const res = await fetch(url);
        if (!res.ok) return null;
        const csvText = await res.text();

        // Since we don't have ISIN from MFAPI by default, we will do a rough regex/string match 
        // against the scheme name if ISIN isn't passed, or look for the ISIN if we extract it.
        // For simplicity, we'll return null here if we can't reliably map it, but we can try string matching.
        return null; // Implementation pending precise string mapping
    } catch (e) {
        console.warn(`TER Github fetch failed:`, e);
        return null;
    }
}

/**
 * Master Aggregator: Fetches core NAV data and concurrently resolves/fetches deep metrics
 * from external sources. Merges all into a rigid standardized schema.
 * Now integrated with IndexedDB CacheManager for ultra-fast subsequent loads.
 */
async function aggregateFundDetails(schemeCode, cleanFundName) {
    if (!schemeCode) return null;

    // 1. Check local IndexedDB cache first
    try {
        const cached = await CacheManager.get(schemeCode);
        // Schema check: Ensure it's the new StandardFundObject with .nav.history
        if (CacheManager.isCacheValid(cached) && cached.nav && cached.nav.history) {
            console.log(`[Cache Hit] Serving ${schemeCode} from IndexedDB`);
            return cached;
        } else if (cached) {
            console.log(`[Cache Miss] Ignoring old-schema cache for ${schemeCode}`);
        }
    } catch (e) {
        console.warn("Cache retrieval failed, falling back to network:", e);
    }

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
    fund.meta.scheme_category = fund.meta.category;            // advisor.js kuvera fallback
    fund.meta.kuvera_category = fund.meta.category;            // advisor.js category lookup
    fund.portfolio.equity_percentage = fund.portfolio.equityPct;  // portfolio view
    fund.portfolio.debt_percentage = fund.portfolio.debtPct;
    fund.portfolio.cash_percentage = fund.portfolio.cashPct;
    fund.portfolio.expense_ratio = fund.details.expenseRatio;
    fund.portfolio.aum = fund.details.aum;
    fund.portfolio.exit_load = fund.details.exitLoad;
    fund.portfolio.holdings = fund.portfolio.topHoldings;

    // 3. Cache the StandardFundObject for next time
    try {
        await CacheManager.set(schemeCode, fund);
    } catch (e) {
        console.error("Failed to update cache:", e);
    }

    return fund;
}
