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

    // Pass to Layer 4 & 5
    return generateStrategyAndSimulation(diagnosis, userTransactions);
}

/**
 * Step 2: The Strategy & Simulation Engine (Layers 4-5)
 */
function generateStrategyAndSimulation(diagnosis, userTransactions) {
    let strategy = "UNKNOWN";
    let strategyReason = "";

    const { fundDrawdown, marketDrawdown, topPeer } = diagnosis;

    // Layer 4: Decision Tree
    if (marketDrawdown < -10) {
        // Market is in correction territory
        strategy = "COST_AVERAGE";
        strategyReason = "Market Drop Detected. Buy the dip to lower your average cost.";
    } else if (fundDrawdown < -5 && topPeer && topPeer.drawdown < -5) {
        // Market is fine, but the entire category is suffering
        strategy = "HOLD_CATEGORY_CYCLE";
        strategyReason = "Category Sector rotation. The entire sector is down right now. Hold.";
    } else if (fundDrawdown < -3 && topPeer && topPeer.drawdown >= -2 && topPeer.cagr1Y > (diagnosis.fund1yCAGR || 0)) {
        // Fund is losing, but the top peer is winning
        strategy = "SWITCH_FUND";
        strategyReason = `Underperforming active management. Switch to ${topPeer.name}.`;
    } else {
        // Catch-all
        strategy = "HOLD_CATEGORY_CYCLE";
        strategyReason = "Underperformance is likely temporary noise. Hold the asset.";
    }

    diagnosis.strategy = strategy;
    diagnosis.strategyReason = strategyReason;

    // Layer 5: Simulation Array (3-Year Future Projection)
    // Assume current invested corpus for simulation. In real app, calculate from txns.
    // We will assume a proxy corpus of ₹100,000 for relative charting if txns are empty.

    let currentCorpus = 100000;
    let monthlySip = 5000;

    if (userTransactions && userTransactions.length > 0) {
        const units = userTransactions.reduce((acc, t) => acc + (t.type === 'BUY' ? t.units : -t.units), 0);
        // Approximation without active NAV fetch:
        // Real implementation would pass actual `currentValue` from portfolio view
    }

    const projectionMonths = 36;
    const simData = {
        labels: [], // Month 1, Month 2... Date objects or strings
        doNothingArray: [],
        strategyArray: []
    };

    // Base Rates for compounding
    const fundMonthlyRate = diagnosis.fund1yCAGR ? Math.pow(1 + (diagnosis.fund1yCAGR / 100), 1 / 12) - 1 : 0.005; // Default 6% 
    const peerMonthlyRate = topPeer ? Math.pow(1 + (topPeer.cagr1Y / 100), 1 / 12) - 1 : fundMonthlyRate + 0.002;

    let corpusA = currentCorpus; // Do Nothing
    let corpusB = currentCorpus; // Strategy

    const now = new Date();

    for (let m = 0; m <= projectionMonths; m++) {
        const simDate = new Date(now.getFullYear(), now.getMonth() + m, 1);
        simData.labels.push(simDate.toLocaleDateString('default', { month: 'short', year: '2-digit' }));

        simData.doNothingArray.push(Math.round(corpusA));
        simData.strategyArray.push(Math.round(corpusB));

        // Compound Do Nothing (Current Rate + Normal SIP)
        corpusA = (corpusA * (1 + fundMonthlyRate)) + monthlySip;

        // Compound Strategy
        if (strategy === "COST_AVERAGE") {
            // Strategy: Increase SIP by 50% during the dip for higher compounding at same rate
            corpusB = (corpusB * (1 + fundMonthlyRate)) + (monthlySip * 1.5);
        } else if (strategy === "SWITCH_FUND") {
            // Strategy: Compound at Top Peer's superior rate
            corpusB = (corpusB * (1 + peerMonthlyRate)) + monthlySip;
        } else {
            // HOLD
            corpusB = (corpusB * (1 + fundMonthlyRate)) + monthlySip;
        }
    }

    diagnosis.simulation = simData;
    console.log("[Advisor Engine] Strategy & Math Complete:", diagnosis);

    return diagnosis;
}
