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

    // Layer 3: Category Peer Analysis & Two-Pass Scoring Engine
    console.log(`[Advisor Engine] Scanning Universe for top peer in category: ${fundCategory}`);

    let topPeer = null;
    let candidatePool = [];
    let targetFundScore = 0;

    try {
        const peers = await getPeerRanking(fundCategory, schemeCode);
        if (peers && peers.length > 0) {
            // First pass: Filter for standard Direct-Growth funds, excluding IDCW/Bonus variants
            const cleanPeers = peers.filter(p => {
                const n = p.schemeName.toUpperCase();
                // We prefer explicit Direct and Growth, but getPeerRanking might have already filtered.
                // We absolutely MUST exclude structural variants to avoid weird recommendations.
                return !n.includes('IDCW') && !n.includes('DIVIDEND') && !n.includes('BONUS');
            });

            cleanPeers.sort((a, b) => b.cagr1y - a.cagr1y);
            const topCandidates = cleanPeers.slice(0, 10); // Take the top 10 by raw CAGR

            // Second pass: Deep Comparison Engine
            // Fetch detailed stats (Expense Ratio) for the candidates and the target fund
            for (const candidate of topCandidates) {
                const details = await aggregateFundDetails(candidate.schemeCode);
                if (details) {
                    const expenseRatio = details.portfolio?.expense_ratio || 0.75; // assume high if unknown
                    const baseScore = candidate.cagr1y * 100;
                    // Penalty: Subtract (ExpenseRatio * 2) from base CAGR score
                    const qualityScore = baseScore - (expenseRatio * 2);

                    candidatePool.push({
                        code: candidate.schemeCode,
                        name: candidate.schemeName,
                        cagr1Y: baseScore,
                        expenseRatio: expenseRatio,
                        drawdown: calculate52WeekDrawdown(details.data) || 0,
                        score: qualityScore
                    });
                }
            }

            // Also score the current fund for apples-to-apples comparison
            const targetER = fundDetails.portfolio?.expense_ratio || 0.75;
            targetFundScore = (fund1yCAGR * 100) - (targetER * 2);

            if (candidatePool.length > 0) {
                // Sort by the newly minted QualityScore descending
                candidatePool.sort((a, b) => b.score - a.score);

                // Select the single highest qualified candidate
                const absoluteBest = candidatePool[0];

                if (String(absoluteBest.code) !== String(schemeCode)) {
                    topPeer = absoluteBest;
                } else if (candidatePool.length > 1) {
                    // If the absolute best IS the current fund, topPeer stays null or we take the runner up
                    // For the sake of matching logic, topPeer is meant to be the *alternative* best peer.
                    // We'll leave topPeer as null if the current fund is natively the #1 scoring fund.
                    // Or we could assign the runner-up for comparison. Let's assign the runner-up.
                    topPeer = candidatePool[1];
                }
            }
        }
    } catch (err) {
        console.error("Failed to execute Two-Pass Scoring Engine:", err);
    }

    const diagnosis = {
        schemeCode,
        fundName: fundDetails.meta.scheme_name,
        currentReturn,
        fundDrawdown,
        fund1yCAGR: fund1yCAGR !== null ? fund1yCAGR * 100 : null,
        marketDrawdown,
        category: fundCategory,
        topPeer,
        targetFundScore
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

    const { fundDrawdown, marketDrawdown, topPeer, currentReturn, targetFundScore } = diagnosis;

    // Layer 4: Decision Tree
    if (marketDrawdown < -10) {
        // Market is in correction territory
        strategy = "COST_AVERAGE";
        strategyReason = "Market Drop Detected. Buy the dip to lower your average cost.";
    } else if (currentReturn < 0 && topPeer && topPeer.score > targetFundScore) {
        // High quality peer dominates current fund
        strategy = "SWITCH_FUND";
        strategyReason = `Underperforming active management. Switch to ${topPeer.name} (Superior Score).`;
    } else if (fundDrawdown < -5 && topPeer && topPeer.drawdown < -5) {
        // Market is fine, but the entire category is suffering
        strategy = "HOLD_CATEGORY_CYCLE";
        strategyReason = "Category Sector rotation. The entire sector is down right now. Hold.";
    } else if (fundDrawdown < -3 && topPeer && topPeer.score > targetFundScore && topPeer.cagr1Y > (diagnosis.fund1yCAGR || 0)) {
        // Fund is losing, but the top peer is fundamentally winning
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
