/**
 * robo.js — Actionable Suggestions Simulation Lab
 *
 * Provides:
 *  - diagnosePortfolio(holdings)            → finds the weakest holding
 *  - findReplacementFund(weakHolding, data) → picks the best candidate swap
 *  - projectPortfolioValue(data, years)     → baseline vs swapped projection
 *  - renderSuggestionCard(diagnosis)        → injects HTML into #swapDiagnosisContent
 *  - renderSwapSimulatorChart(projection)   → Chart.js Line chart
 *  - switchPortfolioTab(tab)                → tab bar controller
 *  - runRoboAdvisor(holdings, analyticsData)→ orchestrator called from app.js
 */

'use strict';

/* ── Tab Controller ─────────────────────────────────────────────── */
function switchPortfolioTab(tab) {
    const holdingsTab = document.getElementById('portfolioTableCard');
    const suggestTab = document.getElementById('suggestionsTab');
    const btnHoldings = document.getElementById('tabHoldings');
    const btnSuggestions = document.getElementById('tabSuggestions');

    const ACTIVE_STYLE = { color: 'var(--accent)', borderBottom: '2px solid var(--accent)' };
    const INACTIVE_STYLE = { color: 'var(--text-muted)', borderBottom: '2px solid transparent' };

    if (tab === 'holdings') {
        if (holdingsTab) holdingsTab.style.display = 'block';
        if (suggestTab) suggestTab.style.display = 'none';
        if (btnHoldings) { Object.assign(btnHoldings.style, ACTIVE_STYLE); }
        if (btnSuggestions) { Object.assign(btnSuggestions.style, INACTIVE_STYLE); }
    } else {
        if (holdingsTab) holdingsTab.style.display = 'none';
        if (suggestTab) suggestTab.style.display = 'block';
        if (btnHoldings) { Object.assign(btnHoldings.style, INACTIVE_STYLE); }
        if (btnSuggestions) { Object.assign(btnSuggestions.style, ACTIVE_STYLE); }
    }
}

/* ── Diagnosis ──────────────────────────────────────────────────── */
/**
 * Fetches NAV history and metadata for all holdings to calculate CAGRs.
 * Identifies the holding with the lowest 1-year CAGR.
 * Returns { holding, fundMeta, returns1Y, returns3Y } or null if insufficient data.
 */
async function diagnosePortfolio(holdings) {
    const master = window.allMfFunds || [];
    const enrichedHoldings = [];

    for (const h of Object.values(holdings)) {
        try {
            const res = await fetch(`https://api.mfapi.in/mf/${h.code}`);
            if (!res.ok) continue;
            const data = await res.json();
            if (!data || !data.data || data.data.length === 0 || !data.meta) continue;

            const navHistory = data.data.map(d => {
                const parts = d.date.split('-');
                return { date: new Date(parts[2], parts[1] - 1, parts[0]), nav: parseFloat(d.nav) };
            }).sort((a, b) => a.date - b.date);

            const cagr1y = window.getCAGR(navHistory, 1);
            const cagr3y = window.getCAGR(navHistory, 3);

            if (cagr1y !== null) {
                enrichedHoldings.push({
                    holding: h,
                    fundMeta: {
                        schemeCode: h.code,
                        schemeName: h.name,
                        category: data.meta.scheme_category
                    },
                    returns1Y: cagr1y,
                    returns3Y: cagr3y
                });
            }
        } catch (err) {
            console.warn("Failed to fetch history for robo advisor", h.code, err);
        }
    }

    if (enrichedHoldings.length === 0) return null;

    // Sort by 1Y return ascending to find the worst performer
    enrichedHoldings.sort((a, b) => a.returns1Y - b.returns1Y);
    return enrichedHoldings[0];
}

/* ── Replacement Fund Finder ────────────────────────────────────── */
/**
 * Uses window.getPeerRanking (from api.js) to find the best peer in the category.
 * Returns { fundMeta, returns1Y, returns3Y } or null.
 */
async function findReplacementFund(diagnosis) {
    if (!diagnosis || !diagnosis.fundMeta || !diagnosis.fundMeta.category) return null;

    // getPeerRanking returns array of { schemeCode, schemeName, cagr1y }
    try {
        const peers = await window.getPeerRanking(diagnosis.fundMeta.category, diagnosis.holding.code);
        if (!peers || peers.length === 0) return null;

        // The top peer is the first item that is NOT the current holding
        const topPeer = peers.find(p => String(p.schemeCode) !== String(diagnosis.holding.code));
        if (!topPeer) return null;

        // Fetch the 3Y CAGR for the replacement to use in projection
        let returns3Y = topPeer.cagr1y; // default to 1Y if 3Y fails
        try {
            const res = await fetch(`https://api.mfapi.in/mf/${topPeer.schemeCode}`);
            if (res.ok) {
                const data = await res.json();
                if (data && data.data) {
                    const navHistory = data.data.map(d => {
                        const parts = d.date.split('-');
                        return { date: new Date(parts[2], parts[1] - 1, parts[0]), nav: parseFloat(d.nav) };
                    }).sort((a, b) => a.date - b.date);
                    const c3y = window.getCAGR(navHistory, 3);
                    if (c3y !== null) returns3Y = c3y;
                }
            }
        } catch (e) {
            // ignore
        }

        return {
            fundMeta: {
                schemeCode: topPeer.schemeCode,
                schemeName: topPeer.schemeName,
                category: diagnosis.fundMeta.category
            },
            returns1Y: topPeer.cagr1y,
            returns3Y: returns3Y
        };
    } catch (e) {
        console.warn("Failed to find replacement fund:", e);
        return null;
    }
}

/* ── Portfolio Value Projector ──────────────────────────────────── */
function projectPortfolioValue(holdings, diagnosis, replacement, years = 5) {
    const labels = Array.from({ length: years + 1 }, (_, i) => i === 0 ? 'Now' : `Y${i}`);
    let baselineNow = 0;
    let swappedNow = 0;

    const fundGrowths = []; // { currentValue, baseCAGR, swapCAGR }

    for (const h of Object.values(holdings)) {
        const cv = h.currentValue || 0;

        let cagr = 0.12; // fallback 12%
        let swapCAGR = cagr;

        const isWeak = diagnosis && String(h.code) === String(diagnosis.holding.code);

        if (isWeak && diagnosis) {
            cagr = (diagnosis.returns3Y ?? diagnosis.returns1Y ?? 12) / 100;
            if (replacement) {
                swapCAGR = (replacement.returns3Y ?? replacement.returns1Y ?? 14) / 100;
            } else {
                swapCAGR = cagr;
            }
        } else {
            // For other holdings we don't have their historical CAGRs explicitly stored right now unless we passed them all down.
            // But we can approximate them as 12% for the baseline.
            cagr = 0.12;
            swapCAGR = cagr;
        }

        fundGrowths.push({ cv, baseCAGR: cagr, swapCAGR });
        baselineNow += cv;
        swappedNow += cv;
    }

    const baseline = [baselineNow];
    const swapped = [swappedNow];

    for (let y = 1; y <= years; y++) {
        let bVal = 0, sVal = 0;
        fundGrowths.forEach(fg => {
            bVal += fg.cv * Math.pow(1 + fg.baseCAGR, y);
            sVal += fg.cv * Math.pow(1 + fg.swapCAGR, y);
        });
        baseline.push(Math.round(bVal));
        swapped.push(Math.round(sVal));
    }

    return { labels, baseline, swapped };
}

/* ── Suggestion Card Renderer ───────────────────────────────────── */
function renderSuggestionCard(diagnosis, replacement) {
    const el = document.getElementById('swapDiagnosisContent');
    if (!el) return;

    if (!diagnosis || !replacement) {
        el.innerHTML = `<div style="color:var(--text-muted);text-align:center;padding:12px 0;">
            Add at least one fund with historical return data and peers to get a suggestion.
        </div>`;
        return;
    }

    const weakName = diagnosis.fundMeta?.schemeName || diagnosis.holding.name;
    const weakR1Y = typeof diagnosis.returns1Y === 'number' ? (diagnosis.returns1Y * 100).toFixed(2) : '—';
    const repName = replacement?.fundMeta?.schemeName ?? '—';
    const repR1Y = typeof replacement?.returns1Y === 'number' ? (replacement.returns1Y * 100).toFixed(2) : '—';
    const repCode = replacement?.fundMeta?.schemeCode ?? '';

    el.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:16px;align-items:center;margin-bottom:16px;">
        <!-- Weak fund -->
        <div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);border-radius:8px;padding:12px 14px;">
            <div style="font-size:10px;font-weight:700;color:#ef4444;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">⚠ Underperformer</div>
            <div style="font-size:12px;font-weight:600;color:var(--text-primary);margin-bottom:2px;">${escapeHtml ? escapeHtml(weakName) : weakName}</div>
            <div style="font-size:11px;color:var(--text-muted);">1Y Return: <strong style="color:#ef4444;">${weakR1Y}%</strong></div>
        </div>
        <!-- Arrow -->
        <div style="font-size:22px;color:var(--accent);">→</div>
        <!-- Replacement -->
        <div style="background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.25);border-radius:8px;padding:12px 14px;">
            <div style="font-size:10px;font-weight:700;color:#10b981;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">✦ Recommended Swap</div>
            <div style="font-size:12px;font-weight:600;color:var(--text-primary);margin-bottom:2px;">${escapeHtml ? escapeHtml(repName) : repName}</div>
            <div style="font-size:11px;color:var(--text-muted);">1Y Return: <strong style="color:#10b981;">${repR1Y}%</strong></div>
        </div>
    </div>
    <div style="font-size:11px;color:var(--text-muted);line-height:1.6;border-top:1px solid rgba(255,255,255,0.06);padding-top:10px;">
        💡 This suggestion is based on 1-year peer returns in the <em>${diagnosis.fundMeta?.category ?? 'same'}</em> category. 
        The 5-year projection below assumes historical CAGR growth rates. <strong>This is not financial advice.</strong>
        ${repCode ? `<span style="cursor:pointer;color:var(--accent);" onclick="loadFund('${repCode}')"> View fund →</span>` : ''}
    </div>`;
}

/* ── Swap Simulator Chart ───────────────────────────────────────── */
let _swapChart = null;

function renderSwapSimulatorChart(projection) {
    const canvas = document.getElementById('swapSimulatorChart');
    if (!canvas) return;

    const fmt = v => '₹' + Math.round(v / 1000).toLocaleString('en-IN') + 'K';

    const chartData = {
        labels: projection.labels,
        datasets: [
            {
                label: 'Do Nothing',
                data: projection.baseline,
                borderColor: '#6366f1',
                backgroundColor: 'rgba(99,102,241,0.12)',
                fill: true,
                tension: 0.4,
                borderWidth: 2.5,
                pointRadius: 4,
                pointBackgroundColor: '#6366f1'
            },
            {
                label: 'With Swap',
                data: projection.swapped,
                borderColor: '#10b981',
                backgroundColor: 'rgba(16,185,129,0.08)',
                fill: true,
                tension: 0.4,
                borderWidth: 2.5,
                pointRadius: 4,
                pointBackgroundColor: '#10b981'
            }
        ]
    };

    const options = {
        responsive: true,
        interaction: { mode: 'index', intersect: false },
        plugins: {
            legend: { display: false },
            tooltip: {
                callbacks: {
                    label: ctx => ` ${ctx.dataset.label}: ${fmt(ctx.parsed.y)}`
                }
            }
        },
        scales: {
            x: {
                grid: { color: 'rgba(255,255,255,0.05)' },
                ticks: { color: 'rgba(255,255,255,0.5)', font: { size: 11 } }
            },
            y: {
                grid: { color: 'rgba(255,255,255,0.05)' },
                ticks: {
                    color: 'rgba(255,255,255,0.5)',
                    font: { size: 11 },
                    callback: fmt
                }
            }
        }
    };

    if (_swapChart) {
        _swapChart.data = chartData;
        _swapChart.update();
    } else {
        _swapChart = new Chart(canvas, { type: 'line', data: chartData, options });
    }
}

/* ── Orchestrator ───────────────────────────────────────────────── */
/**
 * Called from app.js after all holdings are computed.
 * Shows the tab bar and runs the full diagnosis → projection pipeline.
 */
async function runRoboAdvisor(holdings, analyticsData) {
    // Show tab bar
    const tabBar = document.getElementById('portfolioTabBar');
    if (tabBar) tabBar.style.display = 'flex'; // Or block depending on CSS

    // Show loading state
    const el = document.getElementById('swapDiagnosisContent');
    if (el) el.innerHTML = `<div style="color:var(--text-muted);text-align:center;padding:12px 0;">Loading analysis...</div>`;

    try {
        const diagnosis = await diagnosePortfolio(holdings);
        const replacement = await findReplacementFund(diagnosis);

        renderSuggestionCard(diagnosis, replacement);

        if (diagnosis && replacement) {
            const projection = projectPortfolioValue(holdings, diagnosis, replacement, 5);
            renderSwapSimulatorChart(projection);
        }
    } catch (e) {
        console.error("RoboAdvisor failed:", e);
        if (el) el.innerHTML = `<div style="color:var(--text-muted);text-align:center;padding:12px 0;">Error running analysis. Please try again later.</div>`;
    }
}

/* ── Global exposure ────────────────────────────────────────────── */
window.switchPortfolioTab = switchPortfolioTab;
window.runRoboAdvisor = runRoboAdvisor;
window.diagnosePortfolio = diagnosePortfolio;
window.findReplacementFund = findReplacementFund;
window.projectPortfolioValue = projectPortfolioValue;
window.renderSuggestionCard = renderSuggestionCard;
window.renderSwapSimulatorChart = renderSwapSimulatorChart;


/* ── Global exposure ────────────────────────────────────────────── */
window.switchPortfolioTab = switchPortfolioTab;
window.runRoboAdvisor = runRoboAdvisor;
window.diagnosePortfolio = diagnosePortfolio;
window.findReplacementFund = findReplacementFund;
window.projectPortfolioValue = projectPortfolioValue;
window.renderSuggestionCard = renderSuggestionCard;
window.renderSwapSimulatorChart = renderSwapSimulatorChart;
