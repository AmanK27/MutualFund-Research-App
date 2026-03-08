/**
 * engine-worker.js
 *
 * Web Worker for the Robo-Advisor micro-app.
 * Receives a StandardFundObject (targetFundData) and an array of category peers
 * (peersData) from app.js, computes real risk-adjusted metrics, and returns a
 * strategy recommendation to the UI thread.
 *
 * Data contracts (from main app):
 *   targetFundData  — StandardFundObject from MFDB.getFund():
 *       { meta: { schemeName, subCategory, expenseRatio },
 *         navHistory: [{ date: Number(ms), nav: Number }, ...] sorted asc,
 *         details: { aum, expenseRatio } }
 *
 *   peersData — Array from MFDB.getPeers(subCategory):
 *       [{ schemeCode, schemeName, cagr1y: Number(decimal) }, ...] sorted desc by cagr1y
 */

self.onmessage = function (e) {
    const { action, payload } = e.data;

    if (action === 'ANALYZE_FUND') {
        const { targetSchemeCode, targetFundData, peersData } = payload;

        try {
            // ── Step 1: Validate inputs ───────────────────────────────────────────
            postProgress(10, 'Validating fund data...');
            if (!targetFundData) {
                return postError('Fund data not found in local cache. Please sync the app first.');
            }

            const navHistory = targetFundData.navHistory || [];
            if (navHistory.length < 30) {
                return postError('Insufficient NAV history to perform analysis (< 30 data points).');
            }

            // ── Step 2: Compute target fund returns ───────────────────────────────
            postProgress(30, 'Computing returns & risk metrics...');
            const cagr1Y = computeCAGR(navHistory, 1);
            const cagr3Y = computeCAGR(navHistory, 3);
            const cagr5Y = computeCAGR(navHistory, 5);
            const volatility = computeVolatility(navHistory, 252);
            const sharpe = computeSharpe(cagr1Y, volatility);
            const maxDD = computeMaxDrawdown(navHistory);

            // ── Step 3: Peer analysis ─────────────────────────────────────────────
            postProgress(60, 'Ranking peers...');
            const peerRanking = rankPeers(peersData, targetSchemeCode);
            const myRank = peerRanking.findIndex(p => String(p.schemeCode) === String(targetSchemeCode)) + 1;
            const topPeer = peerRanking[0];

            // ── Step 4: Recommendation logic ──────────────────────────────────────
            postProgress(80, 'Generating recommendation...');
            const { recommendation, confidence, reasoning } = generateRecommendation({
                cagr1Y, cagr3Y, volatility, sharpe, maxDD,
                myRank, peerCount: peerRanking.length, topPeer,
                targetSchemeCode
            });

            // ── Step 5: Build result payload ──────────────────────────────────────
            postProgress(95, 'Finalizing report...');
            const result = {
                analyzedFund: targetSchemeCode,
                fundName: targetFundData.meta?.schemeName || 'Unknown Fund',
                subCategory: targetFundData.meta?.subCategory || 'N/A',
                metrics: {
                    cagr1Y: cagr1Y != null ? (cagr1Y * 100).toFixed(2) + '%' : 'N/A',
                    cagr3Y: cagr3Y != null ? (cagr3Y * 100).toFixed(2) + '%' : 'N/A',
                    cagr5Y: cagr5Y != null ? (cagr5Y * 100).toFixed(2) + '%' : 'N/A',
                    volatility: volatility != null ? (volatility * 100).toFixed(2) + '%' : 'N/A',
                    sharpeRatio: sharpe != null ? sharpe.toFixed(2) : 'N/A',
                    maxDrawdown: maxDD != null ? (maxDD * 100).toFixed(2) + '%' : 'N/A',
                },
                peerRank: myRank > 0 ? `#${myRank} of ${peerRanking.length}` : 'N/A',
                recommendedSwap: topPeer && String(topPeer.schemeCode) !== String(targetSchemeCode)
                    ? {
                        schemeCode: topPeer.schemeCode,
                        schemeName: topPeer.schemeName,
                        cagr1Y: topPeer.cagr1y != null ? (topPeer.cagr1y * 100).toFixed(2) + '%' : 'N/A'
                    }
                    : null,
                recommendation,
                confidenceScore: confidence,
                reasoning,
                analysedAt: Date.now()
            };

            postProgress(100, 'Analysis complete.');
            self.postMessage({ status: 'COMPLETE', result });

        } catch (err) {
            postError('Engine error: ' + err.message);
        }
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function postProgress(pct, message) {
    self.postMessage({ status: 'PROGRESS', progress: pct, message });
}

function postError(message) {
    self.postMessage({ status: 'ERROR', message });
}

/**
 * Compute CAGR over N years from the tail of navHistory.
 * navHistory entries: { date: Number (ms timestamp) | Date, nav: Number }
 * Returns decimal (e.g. 0.12 = 12%) or null if insufficient data.
 */
function computeCAGR(navHistory, years) {
    const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;
    const latest = navHistory[navHistory.length - 1];
    if (!latest) return null;

    const latestMs = typeof latest.date === 'number' ? latest.date : new Date(latest.date).getTime();
    const targetMs = latestMs - years * YEAR_MS;

    // Find the closest entry at or before targetMs
    let closest = null;
    for (let i = navHistory.length - 1; i >= 0; i--) {
        const entryMs = typeof navHistory[i].date === 'number'
            ? navHistory[i].date
            : new Date(navHistory[i].date).getTime();
        if (entryMs <= targetMs) {
            closest = navHistory[i];
            break;
        }
    }
    if (!closest) return null;

    const actualYears = (latestMs - (typeof closest.date === 'number' ? closest.date : new Date(closest.date).getTime())) / YEAR_MS;
    if (actualYears < years * 0.85) return null; // insufficient history

    const ratio = latest.nav / closest.nav;
    return Math.pow(ratio, 1 / actualYears) - 1;
}

/**
 * Compute annualised standard deviation of daily log returns.
 * lookback: number of entries to use (e.g. 252 for ~1Y).
 */
function computeVolatility(navHistory, lookback) {
    const slice = navHistory.slice(-Math.min(lookback + 1, navHistory.length));
    if (slice.length < 10) return null;

    const logReturns = [];
    for (let i = 1; i < slice.length; i++) {
        const r = Math.log(slice[i].nav / slice[i - 1].nav);
        if (isFinite(r)) logReturns.push(r);
    }
    if (logReturns.length < 5) return null;

    const mean = logReturns.reduce((s, r) => s + r, 0) / logReturns.length;
    const variance = logReturns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / (logReturns.length - 1);
    return Math.sqrt(variance * 252); // annualise
}

/**
 * Compute Sharpe ratio: (cagr1Y - riskFreeRate) / volatility.
 * Risk-free rate: 6.5% (approx India 91-day T-bill).
 */
function computeSharpe(cagr1Y, volatility) {
    if (cagr1Y == null || volatility == null || volatility === 0) return null;
    const RISK_FREE = 0.065;
    return (cagr1Y - RISK_FREE) / volatility;
}

/**
 * Compute maximum drawdown over the full NAV history.
 * Returns a negative decimal (e.g. -0.35 = -35% drawdown).
 */
function computeMaxDrawdown(navHistory) {
    if (navHistory.length < 2) return null;
    let peak = navHistory[0].nav;
    let maxDD = 0;
    for (const entry of navHistory) {
        if (entry.nav > peak) peak = entry.nav;
        const dd = (entry.nav - peak) / peak;
        if (dd < maxDD) maxDD = dd;
    }
    return maxDD;
}

/**
 * Rank peers by cagr1y descending.
 * peersData: [{ schemeCode, schemeName, cagr1y }]
 */
function rankPeers(peersData, excludeCode) {
    if (!peersData || peersData.length === 0) return [];
    return [...peersData].sort((a, b) => (parseFloat(b.cagr1y) || 0) - (parseFloat(a.cagr1y) || 0));
}

/**
 * Generate a BUY/HOLD/SWITCH recommendation based on metrics and peer rank.
 */
function generateRecommendation({ cagr1Y, cagr3Y, volatility, sharpe, maxDD, myRank, peerCount, topPeer, targetSchemeCode }) {
    let score = 50; // neutral
    const factors = [];

    // Peer rank signals
    if (peerCount > 0) {
        const rankPct = myRank / peerCount; // lower = better
        if (rankPct <= 0.25) { score += 20; factors.push(`Top-quartile peer rank (#${myRank} of ${peerCount})`); }
        else if (rankPct <= 0.50) { score += 5; factors.push(`Above-median peer rank (#${myRank} of ${peerCount})`); }
        else if (rankPct <= 0.75) { score -= 10; factors.push(`Below-median peer rank (#${myRank} of ${peerCount})`); }
        else { score -= 25; factors.push(`Bottom-quartile peer rank (#${myRank} of ${peerCount}) — consider switching`); }
    }

    // Sharpe ratio signals
    if (sharpe != null) {
        if (sharpe > 1.0) { score += 15; factors.push(`Strong Sharpe ratio (${sharpe.toFixed(2)}) — good risk-adjusted return`); }
        else if (sharpe > 0.5) { score += 5; factors.push(`Acceptable Sharpe ratio (${sharpe.toFixed(2)})`); }
        else if (sharpe > 0) { score -= 5; factors.push(`Low Sharpe ratio (${sharpe.toFixed(2)}) — weak risk-adjusted return`); }
        else { score -= 15; factors.push(`Negative Sharpe ratio (${sharpe.toFixed(2)}) — underperforming risk-free rate`); }
    }

    // Drawdown signals
    if (maxDD != null) {
        if (maxDD > -0.15) { score += 10; factors.push(`Resilient drawdown profile (max ${(maxDD * 100).toFixed(1)}%)`); }
        else if (maxDD > -0.30) { score += 0; factors.push(`Moderate drawdown (max ${(maxDD * 100).toFixed(1)}%)`); }
        else { score -= 10; factors.push(`High historical drawdown (max ${(maxDD * 100).toFixed(1)}%)`); }
    }

    // Consistency (1Y vs 3Y spread)
    if (cagr1Y != null && cagr3Y != null) {
        const spread = Math.abs(cagr1Y - cagr3Y);
        if (spread < 0.05) { score += 5; factors.push('Consistent returns (1Y ≈ 3Y CAGR)'); }
        else if (spread > 0.15) { score -= 5; factors.push('Volatile return consistency (large 1Y vs 3Y gap)'); }
    }

    score = Math.max(0, Math.min(100, score));

    let recommendation, confidence;
    if (score >= 70) {
        recommendation = 'HOLD / CONTINUE SIP';
        confidence = score;
    } else if (score >= 50) {
        recommendation = 'MONITOR — Review in 90 days';
        confidence = score;
    } else {
        recommendation = topPeer && String(topPeer.schemeCode) !== String(targetSchemeCode)
            ? `SWITCH — Consider ${topPeer.schemeName}`
            : 'UNDERPERFORMING — Explore alternatives';
        confidence = 100 - score; // high confidence it's a weak fund
    }

    const reasoning = factors.length > 0
        ? factors.join('. ') + '.'
        : 'Insufficient data for detailed factor analysis.';

    return { recommendation, confidence: Math.round(confidence), reasoning };
}
