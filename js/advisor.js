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
    if (!fundDetails || !fundDetails.nav || !fundDetails.nav.history) throw new Error("Could not load fund details for advisor.");

    const fundDrawdown = calculate52WeekDrawdown(fundDetails.nav.history);
    const fund1yCAGR = getCAGR(fundDetails.nav.history, 1);

    // meta.category is set by createStandardFund() from Kuvera adapter (authoritative)
    // with AMFI scheme_category as fallback — no manual mapping needed
    let fundCategory = fundDetails.meta.category || 'Equity';

    // Capture AMFI-exact subCategory for strict peer matching
    // This is the sole source of truth for category enforcement — never Kuvera
    const targetSubCategory = fundDetails.meta.subCategory || null;
    console.log(`[Advisor Engine] Target fund category lock: "${targetSubCategory || 'none (will use fundCategory)'}"`);

    // Layer 2: Market proxy (Nifty 50) Drawdown
    console.log(`[Advisor Engine] Fetching Market Proxy (Nifty 50: ${NIFTY_50_CODE})`);
    const marketDetails = await aggregateFundDetails(NIFTY_50_CODE, "UTI Nifty 50");
    const marketDrawdown = marketDetails ? calculate52WeekDrawdown(marketDetails.nav.history) : 0;

    // Layer 3: Category Peer Analysis — Smart API with IndexedDB Cache
    // Call fetchCategoryPeers() directly. It internally uses IndexedDB (cache-first)
    // so data is available regardless of whether the user visited the fund dashboard first.
    let topPeer = null;
    let targetFundScore = 0;

    try {
        console.log(`[Advisor Engine] Fetching category peers for: "${fundCategory}" via fetchCategoryPeers (subCategory lock: "${targetSubCategory}")...`);
        const peers = await fetchCategoryPeers(fundCategory, schemeCode, targetSubCategory);

        // ── DIAGNOSTIC LOG: RAW PEERS ────────────────────────────────────────────
        console.log(`%c[ADVISOR DIAG] STEP 1 — RAW PEERS (${peers.length} funds) from fetchCategoryPeers (IndexedDB Cache-First)`, 'color:#a78bfa;font-weight:bold');
        console.table(peers.map(p => ({ Name: p.schemeName, Code: p.schemeCode, 'Raw CAGR 1Y (decimal)': p.cagr1y })));

        if (peers.length > 0) {

            // ── STEP A: Sort numerically (fromAmfiSearch winner always goes first) ─
            const parsedPeers = peers.map(p => ({
                ...p,
                cagr1y: (p.cagr1y != null && !isNaN(p.cagr1y)) ? parseFloat(p.cagr1y) : -999
            })).sort((a, b) => {
                // AMFI-search-verified winner is always pinned to top regardless of raw CAGR order
                if (a.fromAmfiSearch && !b.fromAmfiSearch) return -1;
                if (!a.fromAmfiSearch && b.fromAmfiSearch) return 1;
                return b.cagr1y - a.cagr1y;
            });

            console.log('%c[ADVISOR DIAG] STEP 2 — SORTED PEERS', 'color:#34d399;font-weight:bold');
            console.table(parsedPeers.map(p => ({
                Name: p.schemeName,
                planType: p.planType || 'N/A',
                optionType: p.optionType || 'N/A',
                Source: p.fromAmfiSearch ? '✅ AMFI-Search Verified' : '⚠️ name-filtered',
                'CAGR (%)': p.cagr1y > 0 ? `+${(p.cagr1y * 100).toFixed(2)}%` : (p.cagr1y === -999 ? 'NULL' : `${(p.cagr1y * 100).toFixed(2)}%`)
            })));

            // ── STEP B: Peer Selection ───────────────────────────────────────────
            // Step 1: prefer AMFI-search-verified peers (fromAmfiSearch:true set by findTrueBestPeer)
            // Step 2: fall back to name exclusion filter (last resort)
            let candidatePool = parsedPeers.filter(p => p.fromAmfiSearch === true);
            let selectionMethod = 'AMFI-search verified';

            if (candidatePool.length === 0) {
                candidatePool = parsedPeers.filter(p => {
                    const n = (p.schemeName || '').toLowerCase();
                    return !n.includes('regular') && !n.includes('idcw') &&
                        !n.includes('dividend') && !n.includes('bonus');
                });
                selectionMethod = 'name-exclusion fallback (AMFI search failed)';
            }

            console.log(`%c[ADVISOR DIAG] STEP 3 — SELECTION (${candidatePool.length} eligible peers via ${selectionMethod})`, 'color:#f59e0b;font-weight:bold');

            const candidatePeers = candidatePool
                .filter(p => String(p.schemeCode) !== String(schemeCode) && p.cagr1y > 0);

            console.log(`%c[ADVISOR DIAG] STEP 4 — TOP 3 PEERS (after self-exclusion & positive-return guard)`, 'color:#7c3aed;font-weight:bold');
            console.table(candidatePeers.slice(0, 3).map((p, i) => ({
                Rank: `#${i + 1}${i === 0 ? ' 🏆 WINNER' : ''}`,
                Name: p.schemeName,
                planType: p.planType || 'N/A',
                optionType: p.optionType || 'N/A',
                'CAGR (%)': `+${(p.cagr1y * 100).toFixed(2)}%`
            })));


            if (candidatePeers.length > 0) {
                const winner = candidatePeers[0];
                console.log(`%c[ADVISOR DIAG] 🏆 FINAL WINNER: ${winner.schemeName} | 1Y Return: +${(winner.cagr1y * 100).toFixed(2)}%`, 'color:#34d399;font-size:14px;font-weight:bold');

                // Fetch drawdown for the winner for the UI
                const details = await aggregateFundDetails(winner.schemeCode);
                const drawdown = details ? (calculate52WeekDrawdown(details.nav.history) || 0) : 0;

                topPeer = {
                    code: winner.schemeCode,
                    name: winner.schemeName,
                    planType: winner.planType || 'UNKNOWN',
                    optionType: winner.optionType || 'UNKNOWN',
                    cagr1Y: winner.cagr1y * 100,
                    drawdown,
                    score: winner.cagr1y * 100
                };
            } else {
                console.error('[ADVISOR DIAG] ❌ No valid positive-return peers survived — topPeer will be null. Is uiCategoryPeers empty?');
            }
        } else {
            console.warn('[ADVISOR DIAG] ⚠️ uiCategoryPeers is empty. Did you open the fund dashboard first to load the sidebar peers?');
        }
    } catch (err) {
        console.error("Failed to execute Peer Analysis Engine:", err);
    }

    const diagnosis = {
        schemeCode,
        fundName: fundDetails.meta.cleanName,
        currentReturn,
        fundDrawdown,
        fund1yCAGR: fund1yCAGR !== null ? fund1yCAGR * 100 : null,
        marketDrawdown,
        category: fundCategory,
        topPeer,
        targetFundScore: fund1yCAGR !== null ? (fund1yCAGR * 100) : 0
    };

    console.log("[Advisor Engine] Diagnosis Generated:", diagnosis);
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
