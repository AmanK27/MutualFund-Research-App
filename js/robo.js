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
 * Identifies the holding with the lowest 1-year CAGR from master list metadata.
 * Returns { holding, fundMeta, returns1Y } or null if insufficient data.
 */
function diagnosePortfolio(holdings) {
    const master = window.allMfFunds || [];
    let worst = null;

    for (const h of Object.values(holdings)) {
        const meta = master.find(f => String(f.schemeCode) === String(h.code));
        if (!meta) continue;
        const r1Y = meta.returns1Y ?? null;
        if (r1Y === null) continue;

        if (!worst || r1Y < worst.returns1Y) {
            worst = { holding: h, fundMeta: meta, returns1Y: r1Y };
        }
    }
    return worst;
}

/* ── Replacement Fund Finder ────────────────────────────────────── */
/**
 * Given the diagnosed weakest holding, find the best replacement candidate:
 *  - Same category as the weak fund, top performer by 1Y return.
 *  - Exclude the weak fund itself.
 * Returns { fundMeta, returns1Y } or null.
 */
function findReplacementFund(diagnosis) {
    if (!diagnosis) return null;
    const master = window.allMfFunds || [];
    const category = diagnosis.fundMeta?.category;
    if (!category) return null;

    const candidates = master.filter(f =>
        f.category === category &&
        String(f.schemeCode) !== String(diagnosis.holding.code) &&
        f.returns1Y != null
    );

    if (candidates.length === 0) return null;
    const best = candidates.reduce((b, f) => f.returns1Y > b.returns1Y ? f : b, candidates[0]);
    return { fundMeta: best, returns1Y: best.returns1Y };
}

/* ── Portfolio Value Projector ──────────────────────────────────── */
/**
 * Projects the current portfolio's value over `years` using:
 *  - baseline: each holding grows at the fund's historical 3Y CAGR (or 1Y if not available).
 *  - swapped: the weak holding is replaced by the replacement fund's CAGR.
 *
 * Returns { labels, baseline, swapped } — arrays of yearly ₹ values.
 */
function projectPortfolioValue(holdings, diagnosis, replacement, years = 5) {
    const master = window.allMfFunds || [];
    const labels = Array.from({ length: years + 1 }, (_, i) => i === 0 ? 'Now' : `Y${i}`);
    let baselineNow = 0;
    let swappedNow = 0;

    // Compute per-fund compound growth
    const fundGrowths = []; // { currentValue, baseCAGR, swapCAGR }

    for (const h of Object.values(holdings)) {
        const cv = h.currentValue || 0;
        const meta = master.find(f => String(f.schemeCode) === String(h.code));
        const cagr = (meta?.returns3Y ?? meta?.returns1Y ?? 12) / 100; // fallback 12%
        const isWeak = diagnosis && String(h.code) === String(diagnosis.holding.code);
        const swapCAGR = isWeak && replacement
            ? (replacement.fundMeta.returns3Y ?? replacement.fundMeta.returns1Y ?? 14) / 100
            : cagr;
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

    if (!diagnosis) {
        el.innerHTML = `<div style="color:var(--text-muted);text-align:center;padding:12px 0;">
            Add at least one fund with historical return data to get a suggestion.
        </div>`;
        return;
    }

    const weakName = diagnosis.fundMeta?.schemeName || diagnosis.holding.name;
    const weakR1Y = diagnosis.returns1Y?.toFixed(2) ?? '—';
    const repName = replacement?.fundMeta?.schemeName ?? '—';
    const repR1Y = replacement?.returns1Y?.toFixed(2) ?? '—';
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
function runRoboAdvisor(holdings, analyticsData) {
    // Show tab bar
    const tabBar = document.getElementById('portfolioTabBar');
    if (tabBar) tabBar.style.display = 'block';

    // Run in next tick to not block the main render
    setTimeout(() => {
        const diagnosis = diagnosePortfolio(holdings);
        const replacement = findReplacementFund(diagnosis);

        renderSuggestionCard(diagnosis, replacement);

        if (diagnosis) {
            const projection = projectPortfolioValue(holdings, diagnosis, replacement, 5);
            renderSwapSimulatorChart(projection);
        }
    }, 0);
}

/* ── Global exposure ────────────────────────────────────────────── */
window.switchPortfolioTab = switchPortfolioTab;
window.runRoboAdvisor = runRoboAdvisor;
window.diagnosePortfolio = diagnosePortfolio;
window.findReplacementFund = findReplacementFund;
window.projectPortfolioValue = projectPortfolioValue;
window.renderSuggestionCard = renderSuggestionCard;
window.renderSwapSimulatorChart = renderSwapSimulatorChart;
