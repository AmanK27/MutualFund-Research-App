/**
 * Multi-Layer Loss Recovery Advisor
 * Analyzes underperforming funds against Nifty 50 and category peers
 * to generate recovery strategies (Hold, Cost-Average, Switch).
 */

const NIFTY_50_CODE = "120716"; // UTI Nifty 50 code as market proxy

/**
 * Helper: Calculate max drawdown from 52-week high
 * Returns a negative percentage (e.g., -15.5) or 0 if no drawdown.
 */
function calculate52WeekDrawdown(navData) {
    if (!navData || navData.length < 2) return 0;

    const latestDate = navData[navData.length - 1].date;
    const oneYearAgo = new Date(latestDate);
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    let maxHigh = 0;
    for (let i = navData.length - 1; i >= 0; i--) {
        if (navData[i].date < oneYearAgo) break;
        if (navData[i].nav > maxHigh) {
            maxHigh = navData[i].nav;
        }
    }

    const currentNav = navData[navData.length - 1].nav;
    if (maxHigh === 0) return 0;
    return ((currentNav - maxHigh) / maxHigh) * 100;
}

/**
 * Step 1: The Multi-Layer Diagnostic Engine (Layers 1-3)
 * @param {string} schemeCode - The underperforming fund
 * @param {number} currentReturn - The current absolute return % (provided by UI)
 * @param {Array} userTransactions - User's txn history (optional for future weighted calc)
 */
async function analyzeLoss(schemeCode, currentReturn, userTransactions = []) {
    console.log(`[Advisor Engine] Starting diagnosis for ${schemeCode}...`);

    // Layer 1: Portfolio Fund Drawdown
    const fundDetails = await aggregateFundDetails(schemeCode);
    if (!fundDetails || !fundDetails.data) throw new Error("Could not load fund details for advisor.");

    const fundDrawdown = calculate52WeekDrawdown(fundDetails.data);
    const fund1yCAGR = getCAGR(fundDetails.data, 1);

    // Attempt Kuvera category first, then fallback to AMFI mapped category
    let fundCategory = fundDetails.meta.kuvera_category ||
        (window.SCHEME_CATEGORY_TO_LIVE_FUNDS ? window.SCHEME_CATEGORY_TO_LIVE_FUNDS[fundDetails.meta.scheme_category] : null);

    // Ultimate fallback if neither works
    if (!fundCategory) fundCategory = "Equity";

    // Layer 2: Market proxy (Nifty 50) Drawdown
    console.log(`[Advisor Engine] Fetching Market Proxy (Nifty 50: ${NIFTY_50_CODE})`);
    const marketDetails = await aggregateFundDetails(NIFTY_50_CODE, "UTI Nifty 50");
    const marketDrawdown = marketDetails ? calculate52WeekDrawdown(marketDetails.data) : 0;

    // Layer 3: Category Peer Analysis
    console.log(`[Advisor Engine] Scanning Universe for top peer in category: ${fundCategory}`);

    let topPeer = null;
    let highestCAGR = -Infinity;

    if (window.FUND_UNIVERSE && window.FUND_UNIVERSE.length > 0) {
        // Sequentially fetch/cache universe metrics
        for (const peerCode of window.FUND_UNIVERSE) {
            if (peerCode === schemeCode) continue; // Skip self

            try {
                // aggregateFundDetails utilizes CacheManager internally
                const peerDetails = await aggregateFundDetails(peerCode);
                if (peerDetails) {
                    const peerCat = peerDetails.meta.kuvera_category ||
                        (window.SCHEME_CATEGORY_TO_LIVE_FUNDS ? window.SCHEME_CATEGORY_TO_LIVE_FUNDS[peerDetails.meta.scheme_category] : "");

                    const isSameCategory = peerCat && (
                        peerCat.toLowerCase().includes(fundCategory.toLowerCase()) ||
                        fundCategory.toLowerCase().includes(peerCat.toLowerCase())
                    );

                    if (isSameCategory) {
                        const peerCAGR = getCAGR(peerDetails.data, 1);
                        if (peerCAGR !== null && peerCAGR > highestCAGR) {
                            highestCAGR = peerCAGR;
                            topPeer = {
                                code: peerCode,
                                name: peerDetails.meta.scheme_name,
                                cagr1Y: peerCAGR * 100, // as percentage
                                drawdown: calculate52WeekDrawdown(peerDetails.data)
                            };
                        }
                    }
                }
            } catch (err) {
                // Ignore silent fetch failures for peers
            }
        }
    }

    const diagnosis = {
        schemeCode,
        fundName: fundDetails.meta.scheme_name,
        currentReturn,
        fundDrawdown,
        fund1yCAGR: fund1yCAGR !== null ? fund1yCAGR * 100 : null,
        marketDrawdown,
        category: fundCategory,
        topPeer
    };

    console.log("[Advisor Engine] Diagnosis Generated:", diagnosis);
    return diagnosis;
}
