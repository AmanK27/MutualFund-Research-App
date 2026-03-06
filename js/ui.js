/**
 * ui.js - Dedicated UI handlers, modals, and rendering logic for nested features.
 */

let advisorChartInstance = null;

function closeAdvisorModal() {
    const modal = document.getElementById('advisorModal');
    const content = document.getElementById('advisorContent');
    if (content) {
        content.style.transform = 'translateY(20px)';
        content.style.opacity = '0';
    }
    setTimeout(() => {
        if (modal) modal.style.display = 'none';
        if (advisorChartInstance) {
            advisorChartInstance.destroy();
            advisorChartInstance = null;
        }
    }, 300);
}

async function openLossAdvisor(schemeCode, currentReturn) {
    const modal = document.getElementById('advisorModal');
    const content = document.getElementById('advisorContent');
    const loading = document.getElementById('advisorLoading');
    const results = document.getElementById('advisorResults');

    // Reset UI State
    document.getElementById('advFundName').textContent = 'Loading...';
    loading.style.display = 'block';
    results.style.display = 'none';

    if (advisorChartInstance) {
        advisorChartInstance.destroy();
        advisorChartInstance = null;
    }

    // Show Modal
    modal.style.display = 'flex';
    setTimeout(() => {
        content.style.transform = 'translateY(0)';
        content.style.opacity = '1';
    }, 10);

    try {
        // Collect transactions for this fund from window.transactions if needed
        const txns = window.transactions ? window.transactions.filter(t => t.schemeCode === schemeCode) : [];

        // Execute Engine (advisor.js)
        const diagnosis = await analyzeLoss(schemeCode, currentReturn, txns);

        // Update UI Text
        document.getElementById('advFundName').textContent = diagnosis.fundName;
        document.getElementById('advFundDD').textContent = diagnosis.fundDrawdown === 0 ? '0%' : diagnosis.fundDrawdown.toFixed(2) + '%';
        document.getElementById('advMarketDD').textContent = diagnosis.marketDrawdown === 0 ? '0%' : diagnosis.marketDrawdown.toFixed(2) + '%';

        const peerEl = document.getElementById('advPeerDD');
        if (diagnosis.topPeer) {
            const returnVal = diagnosis.topPeer.cagr1Y;
            const formattedReturn = returnVal > 0 ? '+' + returnVal.toFixed(2) : returnVal.toFixed(2);
            // If the display name is truncated (no 'direct' keyword), append the
            // normalized plan/option type badge so the user always has clarity.
            const rawName = diagnosis.topPeer.name || '';
            const needsBadge = !rawName.toLowerCase().includes('direct');
            const planBadge = diagnosis.topPeer.planType && diagnosis.topPeer.optionType
                ? `${diagnosis.topPeer.planType} ${diagnosis.topPeer.optionType}`
                : 'DIRECT GROWTH';
            const displayName = needsBadge ? `${rawName} [${planBadge}]` : rawName;
            const catLabel = diagnosis.topPeer.subCategory
                ? (window.Normalizer ? Normalizer.formatSubCategory(diagnosis.topPeer.subCategory) : diagnosis.topPeer.subCategory)
                : '';
            peerEl.innerHTML = `
                <span style="font-size:12px;display:block;color:white;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:4px;" title="${displayName}">${displayName}</span>
                <span style="color:${returnVal > 0 ? 'var(--success)' : 'var(--danger)'};font-size:16px;">${formattedReturn}% <span style="font-size:10px;color:var(--text-muted);">1Y Return</span></span>
                ${catLabel ? `<span style="display:inline-block;margin-top:6px;font-size:10px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);border-radius:4px;padding:2px 7px;color:var(--text-muted);letter-spacing:0.03em;">${catLabel}</span>` : ''}
            `;


        } else {
            peerEl.textContent = 'N/A';
        }

        // Strategy Rendering
        const strategyTitle = document.getElementById('advStrategyTitle');
        const strategyReason = document.getElementById('advStrategyReason');

        strategyTitle.textContent = diagnosis.strategy.replace(/_/g, ' ');
        strategyReason.textContent = diagnosis.strategyReason;

        if (diagnosis.strategy === 'COST_AVERAGE') {
            strategyTitle.style.color = 'var(--accent)';
        } else if (diagnosis.strategy === 'SWITCH_FUND') {
            strategyTitle.style.color = 'var(--success)';
        } else {
            strategyTitle.style.color = 'var(--text-primary)';
        }

        // Chart Rendering
        renderAdvisorChart(diagnosis.simulation);

        // Reveal Results
        loading.style.display = 'none';
        results.style.display = 'block';

    } catch (e) {
        console.error("Loss Advisor Error:", e);
        loading.innerHTML = `<div style="color:var(--error); margin-bottom: 8px;">Failed to run diagnosis.</div><div style="font-size: 13px;">${e.message}</div>`;
    }
}

function renderAdvisorChart(simData) {
    if (!simData || !simData.labels) return;

    const ctx = document.getElementById('advisorChart').getContext('2d');

    advisorChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: simData.labels,
            datasets: [
                {
                    label: 'Do Nothing (Hold)',
                    data: simData.doNothingArray,
                    borderColor: 'rgba(255, 255, 255, 0.4)',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    fill: false,
                    pointRadius: 0,
                    tension: 0.4
                },
                {
                    label: 'Algorithmic Strategy',
                    data: simData.strategyArray,
                    borderColor: '#4285F4', // var(--accent)
                    backgroundColor: 'rgba(66, 133, 244, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    pointRadius: 0,
                    tension: 0.4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                legend: {
                    display: false // Hidden because we built custom HTML legend
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleColor: 'rgba(255, 255, 255, 0.7)',
                    bodyColor: '#fff',
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderWidth: 1,
                    callbacks: {
                        label: function (context) {
                            return context.dataset.label + ': ₹' + context.parsed.y.toLocaleString('en-IN');
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false, color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: 'rgba(255,255,255,0.5)', maxTicksLimit: 6 }
                },
                y: {
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: {
                        color: 'rgba(255,255,255,0.5)',
                        callback: function (value) {
                            if (value >= 100000) return '₹' + (value / 100000).toFixed(1) + 'L';
                            if (value >= 1000) return '₹' + (value / 1000).toFixed(0) + 'k';
                            return '₹' + value;
                        }
                    }
                }
            }
        }
    });
}