/* ═══════════════════════════════════════════════════════════════════
   app.js — Core App State, UI Rendering & Orchestration
   ═══════════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════════

   ═══════════════════════════════════════════════════════════════════ */
let currentFund = null;       // { meta, data } from API
let currentCode = null;
let fullNavData = [];          // sorted oldest→newest [{ date, nav }]
let navChart = null;

const STORAGE_KEY = 'mf_watchlist';

/* --- Compare State --- */
let compareState = {
    fundA: { meta: null, data: [], portfolio: {}, risk: {} },
    fundB: { meta: null, data: [], portfolio: {}, risk: {} },
    activeTab: 'returns'
};

const COMPARE_ROWS = {
    returns: [
        { label: 'YTD', period: 'ytd' },
        { label: '1 Day', period: '1d' },
        { label: '1 Week', period: '1w' },
        { label: '1 Month', period: '1m' },
        { label: '3 Months', period: '3m' },
        { label: '6 Months', period: '6m' },
        { label: '1 Year', period: 1 },
        { label: '2 Years', period: 2 },
        { label: '3 Years', period: 3 },
        { label: '5 Years', period: 5 },
        { label: '10 Years', period: 10 }
    ],
    risk: [
        { label: 'Volatility', key: 'volatility' },
        { label: 'Sharpe', key: 'sharpe' },
        { label: 'Sortino', key: 'sortino' },
        { label: 'Beta', key: 'beta' },
        { label: 'Alpha', key: 'alpha' }
    ],
    assets: [
        { label: 'Equity (%)', key: 'equity_percentage' },
        { label: 'Debt (%)', key: 'debt_percentage' },
        { label: 'Cash & Cash Eq. (%)', key: 'cash_percentage' }
    ],
    details: [
        { label: 'AUM', key: 'aum', type: 'currency' },
        { label: 'Expense Ratio (%)', key: 'expense_ratio' },
        { label: 'Exit Load', key: 'exit_load' }
    ]
};

/* ═══════════════════════════════════════════════════════════════════
   1 ─ LOCAL STORAGE WATCHLIST
   ═══════════════════════════════════════════════════════════════════ */
function loadWatchlist() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch (e) { return []; }
}

function saveWatchlist(list) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

function addToWatchlist(code, name) {
    const list = loadWatchlist();
    if (list.some(item => item.code === code)) return false;
    list.push({ code, name });
    saveWatchlist(list);
    renderWatchlist();
    return true;
}

function removeFromWatchlist(code) {
    let list = loadWatchlist();
    list = list.filter(item => item.code !== code);
    saveWatchlist(list);
    renderWatchlist();
    updateWatchlistBtn();
}

function isInWatchlist(code) {
    return loadWatchlist().some(item => item.code === code);
}

function renderWatchlist() {
    const container = document.getElementById('watchlistContainer');
    const list = loadWatchlist();
    const countEl = document.getElementById('watchlistCount');
    countEl.textContent = list.length;

    if (list.length === 0) {
        container.innerHTML = `
    <div class="watchlist-empty" id="watchlistEmpty">
        <div class="watchlist-empty-icon">🔖</div>
        <p>Your watchlist is empty.<br>Search for a fund and add it here.</p>
    </div>
`;
        return;
    }

    container.innerHTML = list.map(item => {
        const momentumBadge = item.momentum ? `<span style="font-size:10px; background:#10b981; color:white; padding:2px 6px; border-radius:10px; margin-left:8px; font-weight:700;">🔥 MOMENTUM</span>` : '';
        return `
            <div class="watchlist-item ${currentCode === item.code ? 'active' : ''}"
                 onclick="loadFund('${item.code}')">
                <div class="watchlist-item-dot"></div>
                <div class="watchlist-item-info">
                    <div style="display:flex; align-items:center;">
                        <div class="watchlist-item-name">${escapeHtml(item.name)}</div>
                        ${momentumBadge}
                    </div>
                    <div class="watchlist-item-code">${item.code}</div>
                </div>
                <button class="watchlist-item-remove"
                        onclick="event.stopPropagation(); removeFromWatchlist('${item.code}')"
                        title="Remove">✕</button>
            </div>
        `;
    }).join('');

    // Trigger momentum calculation in background if not already done
    calculateWatchlistMomentum();
}

async function calculateWatchlistMomentum() {
    const list = loadWatchlist();
    if (list.length === 0 || window.momentumCalculated) return;
    window.momentumCalculated = true;

    try {
        const results = [];
        // Batch fetch to avoid rate limits
        for (let i = 0; i < list.length; i++) {
            const fund = list[i];
            try {
                const json = await fetchFundData(fund.code);
                const data = prepareNavData(json.data);
                const ret30 = calc30DayReturn(data);
                if (ret30 !== null) {
                    results.push({ code: fund.code, ret30 });
                }
            } catch (e) { }
            if (i < list.length - 1) await new Promise(r => setTimeout(r, 300));
        }

        if (results.length > 0) {
            results.sort((a, b) => b.ret30 - a.ret30);
            const bestCode = results[0].code;
            const updatedList = list.map(item => ({
                ...item,
                momentum: item.code === bestCode && results[0].ret30 > 0.05 // only if > 5%
            }));
            saveWatchlist(updatedList);
            // Re-render without re-triggering this loop
            const container = document.getElementById('watchlistContainer');
            if (container) renderWatchlist();
        }
    } catch (err) { }
}

function toggleWatchlist() {
    if (!currentFund || !currentCode) return;
    const name = currentFund.meta.scheme_name || 'Unknown Fund';
    if (isInWatchlist(currentCode)) return;
    addToWatchlist(currentCode, name);
    updateWatchlistBtn();
    showToast('Added to watchlist', 'success');
}

function updateWatchlistBtn() {
    const btn = document.getElementById('addWatchlistBtn');
    const icon = document.getElementById('watchlistBtnIcon');
    const text = document.getElementById('watchlistBtnText');
    if (!currentCode) return;

    if (isInWatchlist(currentCode)) {
        btn.classList.add('added');
        icon.textContent = '✓';
        text.textContent = 'In Watchlist';
    } else {
        btn.classList.remove('added');
        icon.textContent = '＋';
        text.textContent = 'Add to Watchlist';
    }
}

/* ═══════════════════════════════════════════════════════════════════
   3 ─ MATH ENGINE
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Dynamic Peer Grouping & Ranking Logic (Step 1)
 * Filters master list for peers, fetches NAV, calculates 1Y CAGR.
 */
// Maps mfapi.in scheme_category strings → LIVE_FUNDS subcategory key
/* ═══════════════════════════════════════════════════════════════════
   4 ─ CHART.JS VISUALIZATION
   ═══════════════════════════════════════════════════════════════════ */
function renderChart(data) {
    const ctx = document.getElementById('navChart').getContext('2d');

    if (navChart) {
        navChart.destroy();
    }

    const labels = data.map(d => d.date);
    const values = data.map(d => d.nav);

    // Gradient fill
    const gradient = ctx.createLinearGradient(0, 0, 0, 380);
    gradient.addColorStop(0, 'rgba(56, 189, 248, 0.25)');
    gradient.addColorStop(0.5, 'rgba(56, 189, 248, 0.06)');
    gradient.addColorStop(1, 'rgba(56, 189, 248, 0.0)');

    navChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'NAV',
                data: values,
                borderColor: '#38bdf8',
                backgroundColor: gradient,
                borderWidth: 2,
                fill: true,
                tension: 0.1,
                pointRadius: 0,
                pointHoverRadius: 5,
                pointHoverBackgroundColor: '#38bdf8',
                pointHoverBorderColor: '#fff',
                pointHoverBorderWidth: 2,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(17, 24, 39, 0.95)',
                    borderColor: 'rgba(56, 189, 248, 0.3)',
                    borderWidth: 1,
                    titleColor: '#94a3b8',
                    bodyColor: '#f1f5f9',
                    titleFont: { size: 12, weight: '400' },
                    bodyFont: { size: 14, weight: '600' },
                    padding: 12,
                    cornerRadius: 8,
                    displayColors: false,
                    callbacks: {
                        title: (items) => {
                            const parsed = items[0].parsed;
                            if (parsed && parsed.x) {
                                const d = new Date(parsed.x);
                                return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
                            }
                            return items[0].label || '';
                        },
                        label: (item) => `NAV: ₹${parseFloat(item.raw).toFixed(4)}`
                    }
                }
            },
            scales: {
                x: {
                    type: 'time',
                    time: {
                        tooltipFormat: 'dd MMM yyyy',
                        displayFormats: {
                            month: 'MMM yyyy',
                            year: 'yyyy'
                        }
                    },
                    grid: {
                        color: 'rgba(255,255,255,0.03)',
                        drawBorder: false,
                    },
                    ticks: {
                        color: '#64748b',
                        font: { size: 11 },
                        maxRotation: 0,
                        autoSkipPadding: 30,
                    }
                },
                y: {
                    grid: {
                        color: 'rgba(255,255,255,0.03)',
                        drawBorder: false,
                    },
                    ticks: {
                        color: '#64748b',
                        font: { size: 11 },
                        callback: (val) => '₹' + val.toFixed(2)
                    }
                }
            }
        }
    });
}

/* ═══════════════════════════════════════════════════════════════════
   5 ─ TYING IT ALL TOGETHER
   ═══════════════════════════════════════════════════════════════════ */

function goHome() {
    document.getElementById('searchInput').value = '';
    currentFund = null;
    currentCode = null;
    fullNavData = null;
    showState('welcome');

    // Close mobile sidebar if open
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (sidebar.classList.contains('open')) {
        sidebar.classList.remove('open');
        overlay.classList.remove('active');
    }

    // Remove active states from nav
    document.getElementById('portfolioNavBtn').classList.remove('active');
    document.getElementById('compareNavBtn').classList.remove('active');
    document.querySelectorAll('.cat-sub-item').forEach(el => el.classList.remove('active'));
}

/* ── UI State Reset Helpers ──────────────────────────────── */
function resetDashboardState() {
    // Hide and clear the async-loaded sections so they don't
    // show stale data if the user loads a different fund later.
    const analysisCard = document.getElementById('analysisCard');
    if (analysisCard) {
        analysisCard.style.display = 'none';
        const aum = document.getElementById('fundAUM');
        const exp = document.getElementById('fundExpense');
        const exit = document.getElementById('fundExit');
        const tbody = document.getElementById('holdingsBody');
        if (aum) aum.textContent = '—';
        if (exp) exp.textContent = '—';
        if (exit) exit.textContent = '—';
        if (tbody) tbody.innerHTML = '';
    }

    const peerCard = document.getElementById('peerRankingCard');
    if (peerCard) {
        peerCard.style.display = 'none';
        const list = document.getElementById('peerRankingList');
        if (list) list.innerHTML = '';
    }

    // Destroy the NAV chart to avoid memory leaks / stale renders
    if (navChart) {
        navChart.destroy();
        navChart = null;
    }
}

function resetCompareState() {
    // Clear all compare inputs and hidden code fields
    const inputA = document.getElementById('compareInputA');
    const inputB = document.getElementById('compareInputB');
    const codeA = document.getElementById('compareCodeA');
    const codeB = document.getElementById('compareCodeB');
    const listA = document.getElementById('compareResultsA');
    const listB = document.getElementById('compareResultsB');

    if (inputA) inputA.value = '';
    if (inputB) inputB.value = '';
    if (codeA) codeA.value = '';
    if (codeB) codeB.value = '';
    if (listA) listA.innerHTML = '';
    if (listB) listB.innerHTML = '';

    // Hide results and loading indicator
    const results = document.getElementById('compareResults');
    const loading = document.getElementById('compareLoadingState');
    if (results) results.style.display = 'none';
    if (loading) loading.style.display = 'none';

    // Destroy the compare chart instance
    if (compareChartInstance) {
        compareChartInstance.destroy();
        compareChartInstance = null;
    }

    // Reset compare data
    compareDataA = [];
    compareDataB = [];
}

// showState and showToast removed as they are now in ui.js

function displayFundData() {
    const { meta = {}, data: rawData } = currentFund;
    fullNavData = prepareNavData(rawData);

    if (fullNavData.length === 0) {
        showToast('No valid NAV data found for this fund.', 'error');
        showState('welcome');
        return;
    }

    // Header
    const elFName = document.getElementById('fundName');
    if (elFName) elFName.textContent = formatFundName(meta.scheme_name) || 'Unknown Fund';
    const elFHouse = document.getElementById('fundHouse');
    if (elFHouse) elFHouse.textContent = meta.fund_house || '—';
    const elFCat = document.getElementById('fundCategory');
    if (elFCat) elFCat.textContent = (window.Normalizer)
        ? Normalizer.formatSubCategory(currentFund?.meta?.subCategory || meta.scheme_category || '')
        : (meta.scheme_category || '—');


    const elFType = document.getElementById('fundType');
    if (elFType) elFType.textContent = meta.scheme_type || '—';

    // Stats
    const latest = fullNavData[fullNavData.length - 1];
    const statNavEl = document.getElementById('statNAV');
    if (statNavEl) statNavEl.textContent = '₹' + latest.nav.toFixed(4);

    const statNavDateEl = document.getElementById('statNAVDate');
    if (statNavDateEl) {
        statNavDateEl.textContent = latest.date.toLocaleDateString('en-IN', {
            day: 'numeric', month: 'short', year: 'numeric'
        });
    }

    // Ensure "Add to Portfolio" button is visible and active
    const addBtn = document.getElementById('addPortfolioBtn');
    if (addBtn) {
        addBtn.style.display = 'flex'; // Use flex to match header alignment
        addBtn.disabled = false;
    }

    const cagr1 = getCAGR(fullNavData, 1);
    const cagr3 = getCAGR(fullNavData, 3);
    const cagr5 = getCAGR(fullNavData, 5);
    const cagrMax = getCAGR(fullNavData, null);
    const volatility = calcVolatility(fullNavData);

    const el1 = document.getElementById('statCAGR1Y');
    if (el1) {
        el1.textContent = formatPercent(cagr1);
        el1.className = 'stat-value ' + getPercentClass(cagr1);
    }

    const elVol = document.getElementById('statVolatility');
    if (elVol) {
        if (volatility !== null) {
            elVol.textContent = (volatility * 100).toFixed(2) + '%';
            elVol.className = 'stat-value ' + (volatility > 0.20 ? 'stat-negative' : volatility > 0.12 ? 'stat-neutral' : 'stat-positive');
        } else {
            elVol.textContent = '—';
            elVol.className = 'stat-value';
        }
    }

    // Chart
    setActiveRange('MAX');
    updateWatchlistBtn();
    renderWatchlist();

    // Calculate Health Score
    renderFundHealthScore();

    // Calculate SIP
    updateSIPCalculator();

    // Load category peers asynchronously
    if (meta.scheme_category) {
        initPeerRanking(meta.scheme_category, currentCode);
    } else {
        const prCard = document.getElementById('peerRankingCard');
        if (prCard) prCard.style.display = 'none';
    }

    // Add listeners for SIP if not added
    if (!window.sipListenersAdded) {
        const sipAmt = document.getElementById('sipAmount');
        const sipDur = document.getElementById('sipDuration');
        if (sipAmt) sipAmt.addEventListener('input', updateSIPCalculator);
        if (sipDur) sipDur.addEventListener('input', updateSIPCalculator);
        window.sipListenersAdded = true;
    }

    showState('dashboard');
}

/* ── Fund Health Score Algorithm ────────────────────────────────── */
function getFundHealthScore(data, expenseRatio) {
    if (!data || data.length < 2) return 0;

    const cagr3 = getCAGR(data, 3);
    const cagr1 = getCAGR(data, 1);
    const vol = calcVolatility(data);

    let weights = { cagr: 40, vol: 20, sharpe: 20, efficiency: 20 };
    const healthyCAGR = 0.15;
    const normCAGR = Math.min(Math.max((cagr1 ?? cagr3 ?? 0) / healthyCAGR, 0), 1.25);
    const normVol = vol !== null ? Math.max(0, 1 - (vol / 0.25)) : null;
    let sharpe = (vol > 0) ? (cagr1 ?? cagr3 ?? 0) / vol : null;
    const normSharpe = sharpe !== null ? Math.min(Math.max(sharpe / 1.0, 0), 1) : null;
    const normEfficiency = (expenseRatio !== null && !isNaN(expenseRatio)) ? Math.max(0, 1 - (expenseRatio / 2.5)) : null;

    if (normVol === null) { weights.cagr += 10; weights.efficiency += 10; weights.vol = 0; }
    if (normSharpe === null) { weights.cagr += 10; weights.efficiency += 10; weights.sharpe = 0; }
    if (normEfficiency === null) {
        const share = weights.efficiency / ((weights.cagr > 0 ? 1 : 0) + (weights.vol > 0 ? 1 : 0) + (weights.sharpe > 0 ? 1 : 0));
        if (weights.cagr > 0) weights.cagr += share;
        if (weights.vol > 0) weights.vol += share;
        if (weights.sharpe > 0) weights.sharpe += share;
        weights.efficiency = 0;
    }

    return Math.round(Math.min(((normCAGR * weights.cagr) + ((normVol ?? 0) * weights.vol) + ((normSharpe ?? 0) * weights.sharpe) + ((normEfficiency ?? 0) * weights.efficiency)), 100));
}

function renderFundHealthScore() {
    const expText = document.getElementById('fundExpense')?.textContent || '';
    const expVal = parseFloat(expText);

    const finalScore = getFundHealthScore(fullNavData, isNaN(expVal) ? null : expVal);

    const elValue = document.getElementById('healthScoreValue');
    const elCircle = document.querySelector('.health-score-circle');
    const elLabel = document.getElementById('healthScoreLabel');

    if (elValue) elValue.textContent = finalScore;
    if (elCircle) elCircle.style.background = `conic-gradient(var(--accent) ${finalScore}%, rgba(255,255,255,0.05) ${finalScore}%)`;
    if (elLabel) {
        if (finalScore >= 80) { elLabel.textContent = 'Excellent'; elLabel.style.color = '#10b981'; }
        else if (finalScore >= 60) { elLabel.textContent = 'Good / Healthy'; elLabel.style.color = '#34d399'; }
        else if (finalScore >= 40) { elLabel.textContent = 'Average'; elLabel.style.color = '#fbbf24'; }
        else { elLabel.textContent = 'Underperformer'; elLabel.style.color = '#ef4444'; }
    }
}

/**
 * Dynamic Rendering for Peer Comparison (Step 2 & 3)
 */
async function initPeerRanking(category, schemeCode) {
    const card = document.getElementById('peerRankingCard');
    const listEl = document.getElementById('peerRankingList');
    const loading = document.getElementById('peerRankingLoading');
    const label = document.getElementById('peerCategoryLabel');

    if (!card || !listEl || !loading) return;

    // Optional UI reset
    card.style.display = 'flex';
    listEl.innerHTML = '';
    label.textContent = category.replace(/Equity Scheme\s*-?\s*/ig, '').replace(/Open Ended Schemes/ig, '').trim();
    loading.style.display = 'block';

    try {
        // Use the smart IndexedDB-cached fetcher — same function the advisor uses
        const rankedPeers = await fetchCategoryPeers(category, schemeCode);
        loading.style.display = 'none';

        if (!rankedPeers || rankedPeers.length === 0) {
            listEl.innerHTML = '<div style="color:var(--text-muted);font-size:13px;text-align:center;">No peers found for strictly Direct Growth category.</div>';
            return;
        }

        // Force numerical sort 
        rankedPeers.sort((a, b) => parseFloat(b.cagr1y) - parseFloat(a.cagr1y));

        // Render Top 10
        const topPeers = rankedPeers.slice(0, 10);

        // Check if current fund is in top 10
        let currentInTop = topPeers.findIndex(p => p.schemeCode === String(schemeCode));

        // Function to build row HTML
        const buildRow = (peer, index) => {
            const isCurrent = peer.schemeCode === String(schemeCode);
            const highlightClass = isCurrent ? 'peer-highlight' : '';
            return `
                <div class="peer-item ${highlightClass}" onclick="loadFund('${peer.schemeCode}')" title="Click to view details">
                    <div class="peer-info">
                        <span class="peer-rank">#${index + 1}</span>
                        <span class="peer-name">${(() => {
                    const n = peer.schemeName || '';
                    if (n.toLowerCase().includes('direct')) return n;
                    const badge = (peer.planType && peer.optionType && peer.planType !== 'UNKNOWN')
                        ? `${peer.planType} ${peer.optionType}`
                        : 'DIRECT GROWTH';
                    return `${n} <span style="font-size:9px;opacity:0.65;font-weight:500;">[${badge}]</span>`;
                })()}</span>
                    </div>
                    <div class="peer-metric">
                        <span class="peer-metric-label">1Y CAGR</span>
                        <span class="peer-metric-value ${getPercentClass(peer.cagr1y)}">${formatPercent(peer.cagr1y)}</span>
                    </div>
                </div>
            `;
        };

        let html = topPeers.map((p, i) => buildRow(p, i)).join('');

        // Step 3 logic: if current fund is not in top 10, append it to the bottom
        if (currentInTop === -1) {
            const actualIndex = rankedPeers.findIndex(p => p.schemeCode === String(schemeCode));
            if (actualIndex !== -1) {
                html += `
                    <div style="text-align:center;color:var(--text-muted);font-size:18px;line-height:10px;">⋮</div>
                    ${buildRow(rankedPeers[actualIndex], actualIndex)}
                `;
            }
        }

        listEl.innerHTML = html;

        // Update Category Rank in UI
        const myRank = rankedPeers.findIndex(p => p.schemeCode === String(schemeCode));
        const rankValueEl = document.getElementById('categoryRankValue');
        if (rankValueEl && myRank !== -1) {
            rankValueEl.textContent = `#${myRank + 1} of ${rankedPeers.length}`;
        } else if (rankValueEl) {
            rankValueEl.textContent = 'Not Ranked';
        }

    } catch (err) {
        console.error("Peer rendering failed", err);
        loading.style.display = 'none';
        listEl.innerHTML = '<div style="color:var(--red);font-size:13px;text-align:center;">Error loading peer data.</div>';
    }
}

function updateSIPCalculator() {
    if (!fullNavData || fullNavData.length === 0) return;

    const amount = parseFloat(document.getElementById('sipAmount').value);
    const years = parseInt(document.getElementById('sipDuration').value);

    if (isNaN(amount) || isNaN(years) || amount <= 0 || years <= 0) return;

    const latestData = fullNavData[fullNavData.length - 1];
    const cutoffDate = new Date(latestData.date);
    cutoffDate.setFullYear(cutoffDate.getFullYear() - years);

    // Limit duration if fund doesn't have enough history
    const firstDataDate = fullNavData[0].date;
    let actualCutoff = cutoffDate;
    if (cutoffDate < firstDataDate) {
        actualCutoff = new Date(firstDataDate);
    }

    // Generate SIP dates (1st of every month starting from cutoff)
    let currentDate = new Date(actualCutoff);
    currentDate.setDate(1); // 1st of month
    if (currentDate < actualCutoff) currentDate.setMonth(currentDate.getMonth() + 1);

    const cashflows = [];
    let totalUnits = 0;
    let totalInvested = 0;

    while (currentDate <= latestData.date) {
        // Find nearest NAV on or after currentDate
        let navForMonth = null;
        for (let i = 0; i < fullNavData.length; i++) {
            if (fullNavData[i].date >= currentDate) {
                navForMonth = fullNavData[i].nav;
                break;
            }
        }

        if (navForMonth) {
            const unitsBought = amount / navForMonth;
            totalUnits += unitsBought;
            totalInvested += amount;
            cashflows.push({ amount: -amount, date: new Date(currentDate) });
        }

        // Next month
        currentDate.setMonth(currentDate.getMonth() + 1);
    }

    if (cashflows.length === 0) {
        const elInv = document.getElementById('sipInvested');
        if (elInv) elInv.textContent = '—';
        const elFin = document.getElementById('sipFinal');
        if (elFin) elFin.textContent = '—';
        const elXirr = document.getElementById('sipXirr');
        if (elXirr) elXirr.textContent = '—';
        return;
    }

    const finalValue = totalUnits * latestData.nav;

    // Final flow is the corpus withdrawal (positive)
    cashflows.push({ amount: finalValue, date: latestData.date });

    const xirr = calcXIRR(cashflows);

    const elInv = document.getElementById('sipInvested');
    if (elInv) elInv.textContent = '₹' + totalInvested.toLocaleString('en-IN');
    const elFin = document.getElementById('sipFinal');
    if (elFin) elFin.textContent = '₹' + Math.round(finalValue).toLocaleString('en-IN');

    const elXirr = document.getElementById('sipXirr');
    if (elXirr) {
        if (xirr !== null && !isNaN(xirr) && xirr > -0.99 && xirr < 10) {
            elXirr.textContent = (xirr * 100).toFixed(2) + '%';
            elXirr.className = 'sip-res-value sip-res-xirr ' + (xirr >= 0 ? 'stat-positive' : 'stat-negative');
        } else {
            elXirr.textContent = 'N/A';
            elXirr.className = 'sip-res-value sip-res-xirr';
        }
    }
}


function filterDataByRange(range) {
    if (!fullNavData || fullNavData.length === 0) return [];
    if (range === 'MAX') return fullNavData;

    const latest = fullNavData[fullNavData.length - 1].date;
    const cutoff = new Date(latest);

    switch (range) {
        case '1W': cutoff.setDate(cutoff.getDate() - 7); break;
        case '1M': cutoff.setMonth(cutoff.getMonth() - 1); break;
        case '3M': cutoff.setMonth(cutoff.getMonth() - 3); break;
        case '6M': cutoff.setMonth(cutoff.getMonth() - 6); break;
        case '1Y': cutoff.setFullYear(cutoff.getFullYear() - 1); break;
        case '3Y': cutoff.setFullYear(cutoff.getFullYear() - 3); break;
        case '5Y': cutoff.setFullYear(cutoff.getFullYear() - 5); break;
        case '10Y': cutoff.setFullYear(cutoff.getFullYear() - 10); break;
        default: return fullNavData;
    }

    return fullNavData.filter(d => d.date >= cutoff);
}

function setActiveRange(range) {
    document.querySelectorAll('#chartRangeBtns .range-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.range === range);
    });

    const filtered = filterDataByRange(range);

    if (navChart) {
        // Animate the update dynamically instead of destroying
        navChart.data.labels = filtered.map(d => d.date);
        navChart.data.datasets[0].data = filtered.map(d => d.nav);
        navChart.update();
    } else {
        renderChart(filtered);
    }
}

let isLoading = false;

async function loadFund(code) {
    code = String(code).trim();
    if (!code) { showToast('Please enter a scheme code.', 'error'); return; }
    if (isLoading) return; // prevent duplicate fetches

    isLoading = true;
    const searchBtn = document.getElementById('searchBtn');
    searchBtn.disabled = true;
    searchBtn.textContent = 'Loading…';

    currentCode = code;
    document.getElementById('searchInput').value = code;
    showState('loading');

    // Close mobile sidebar
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.remove('active');

    try {
        const data = await fetchFundData(code);
        currentFund = data;
        displayFundData();

        // Fetch advanced data (holdings/AUM/expense) in background with retry.
        // Show a loading skeleton so users see feedback during the attempt.
        const _analysisCard = document.getElementById('analysisCard');
        const _holdingsBody = document.getElementById('holdingsBody');
        if (_analysisCard && _holdingsBody) {
            _holdingsBody.innerHTML = `
                <tr><td colspan="3" style="text-align:center; color: var(--text-muted); padding: 24px;">
                    <span style="display:inline-block; animation: spin 1s linear infinite; margin-right:8px;">⟳</span>
                    Loading fund fundamentals…
                </td></tr>`;
            _analysisCard.style.display = 'block';
        }
        // Store these in global state or data attributes so the retry button can use them
        window._currentFundForRetry = data.meta.scheme_name;

        // Extract advanced data fetch into a reusable function attached to the window
        // so the inline onclick handler can call it.
        window.retryHoldingsFetch = async function () {
            const MAX_ATTEMPTS = 3;
            const RETRY_DELAY_MS = 1500;
            let advancedData = null;

            if (_holdingsBody) {
                _holdingsBody.innerHTML = `
                    <tr><td colspan="3" style="text-align:center; color: var(--text-muted); padding: 24px;">
                        <span style="display:inline-block; animation: spin 1s linear infinite; margin-right:8px;">⟳</span>
                        Fetching data...
                    </td></tr>`;
            }

            for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
                advancedData = await fetchAdvancedFundData(window._currentFundForRetry);
                if (advancedData) break;
                if (attempt < MAX_ATTEMPTS) {
                    if (_holdingsBody) {
                        _holdingsBody.innerHTML = `
                            <tr><td colspan="3" style="text-align:center; color: var(--text-muted); padding: 24px;">
                                <span style="display:inline-block; animation: spin 1s linear infinite; margin-right:8px;">⟳</span>
                                Retrying… (attempt ${attempt + 1}/${MAX_ATTEMPTS})
                            </td></tr>`;
                    }
                    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * attempt));
                }
            }

            if (advancedData) {
                renderAdvancedData(advancedData);
                // Recalculate health score now that we have expense ratio
                renderFundHealthScore();
            } else {
                if (_holdingsBody) {
                    _holdingsBody.innerHTML = `
                        <tr><td colspan="3" style="text-align:center; padding: 24px;">
                            <div style="color:var(--text-muted);font-size:13px;margin-bottom:8px;">Failed to load holdings.</div>
                            <button onclick="window.retryHoldingsFetch()" 
                                style="padding:4px 12px; font-size:12px; background:transparent; border:1px solid var(--border); color:var(--text-secondary); border-radius:4px; cursor:pointer;">
                                Retry
                            </button>
                        </td></tr>`;
                }
                const elAum = document.getElementById('fundAUM');
                const elExp = document.getElementById('fundExpense');
                if (elAum) elAum.textContent = '—';
                if (elExp) elExp.textContent = '—';
            }
        };

        // Initiate the first fetch
        window.retryHoldingsFetch();

    } catch (err) {
        showState('welcome');
        showToast(err.message || 'Failed to fetch fund data.', 'error');
    } finally {
        isLoading = false;
        searchBtn.disabled = false;
        searchBtn.textContent = 'Search Fund';
    }
}
function renderAdvancedData(data) {
    const card = document.getElementById('analysisCard');
    if (!data) return;

    card.style.display = 'block';

    const elAum = document.getElementById('fundAUM');
    if (elAum) elAum.textContent = data.aum ? '₹' + data.aum.toLocaleString('en-IN') + ' Cr' : '—';
    const elExp = document.getElementById('fundExpense');
    if (elExp) elExp.textContent = data.expenseRatio ? data.expenseRatio + '%' : '—';
    const elExit = document.getElementById('fundExit');
    if (elExit) elExit.textContent = data.exitLoad || '—';

    const tbody = document.getElementById('holdingsBody');
    tbody.innerHTML = '';

    // Limit to Top 10
    const top10 = data.holdings.slice(0, 10);
    if (top10.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color: var(--text-muted); padding: 24px;">No holdings data available.</td></tr>';
        return;
    }

    top10.forEach(h => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${h.company_name || '—'}</td>
            <td>${h.sector_name || '—'}</td>
            <td style="text-align: right; color: var(--accent); font-weight: 500;">${h.corpus_per ? h.corpus_per.toFixed(2) + '%' : '—'}</td>
        `;
        tbody.appendChild(tr);
    });
}

/* ── Portfolio Actions (Add Transaction) ───────────────────────── */
function openPortfolioModal() {
    if (!currentUser) {
        // Automatically promote to virtual guest if not signed in
        currentUser = { uid: "guest-user-123", displayName: "Guest User" };
        console.log("Auth: Auto-promoted to Guest for portfolio action");
    }
    if (!currentFund || !currentCode) return;

    document.getElementById('portfolioModal').style.display = 'flex';

    // Set default date to today, padded properly
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    document.getElementById('txnDate').value = `${yyyy}-${mm}-${dd}`;

    document.getElementById('txnAmount').value = '';
    document.getElementById('txnUnits').value = '';
    document.getElementById('navHelperText').textContent = 'Select a date above to fetch historical NAV.';
}

function closePortfolioModal() {
    document.getElementById('portfolioModal').style.display = 'none';
}

function calculateUnitsForTxn() {
    if (!fullNavData || fullNavData.length === 0) return;

    const dateStr = document.getElementById('txnDate').value; // YYYY-MM-DD
    const amount = parseFloat(document.getElementById('txnAmount').value);
    const unitsInput = document.getElementById('txnUnits');
    const helper = document.getElementById('navHelperText');

    if (!dateStr || isNaN(amount) || amount <= 0) {
        unitsInput.value = '';
        helper.textContent = 'Enter date and amount to auto-calculate units.';
        return;
    }

    const targetDate = new Date(dateStr);

    // Find the closest NAV on or after the target date
    let foundNav = null;
    let foundDate = null;

    // fullNavData is sorted oldest -> newest
    for (let i = 0; i < fullNavData.length; i++) {
        if (fullNavData[i].date >= targetDate) {
            foundNav = fullNavData[i].nav;
            foundDate = fullNavData[i].date;
            break;
        }
    }

    if (foundNav !== null) {
        const units = amount / foundNav;
        unitsInput.value = units.toFixed(4);

        const formattedDate = foundDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
        helper.innerHTML = `Calculated using NAV of <strong>₹${foundNav.toFixed(4)}</strong> on <strong>${formattedDate}</strong>.`;
        helper.style.color = 'var(--text-secondary)';
    } else {
        unitsInput.value = '';
        helper.textContent = 'No NAV data available for this date.';
        helper.style.color = '#f87171'; // red
    }
}

document.getElementById('txnDate').addEventListener('change', calculateUnitsForTxn);
document.getElementById('txnAmount').addEventListener('input', calculateUnitsForTxn);

/* ── Global Search Cache & Autocomplete ────────────────────────── */
window.allMfFunds = []; // [ { schemeCode, schemeName } ]
let searchTimeout;
let currentlySelectedSchemeCode = null; // Set when user explicitly picks from dropdown

/* ── Fund Name Simplifier ──────────────────────────────────────── */
/* ── Trending Funds (♥ shown on empty focus) ──────────────────*/
const TRENDING_FUNDS = [
    { schemeCode: '122639', schemeName: 'Parag Parikh Flexi Cap Fund - Direct Plan - Growth' },
    { schemeCode: '120503', schemeName: 'Axis Bluechip Fund - Direct Plan - Growth' },
    { schemeCode: '118989', schemeName: 'Mirae Asset Large Cap Fund - Direct Plan - Growth' },
    { schemeCode: '120716', schemeName: 'HDFC Index Fund-NIFTY 50 Plan - Direct Plan - Growth' },
    { schemeCode: '125354', schemeName: 'Axis Mid Cap Fund - Direct Plan - Growth' },
    { schemeCode: '119598', schemeName: 'SBI Blue Chip Fund - Direct Plan - Growth' },
    { schemeCode: '120587', schemeName: 'Kotak Flexicap Fund - Direct Plan - Growth' },
    { schemeCode: '118825', schemeName: 'Nippon India Index Fund - Nifty 50 Plan - Direct Plan - Growth' },
    { schemeCode: '130503', schemeName: 'Canara Robeco Flexi Cap Fund - Direct Plan - Growth' },
    { schemeCode: '119775', schemeName: 'Franklin India Flexi Cap Fund - Direct Plan - Growth' }
];

/* ── Autocomplete Registry ──────────────────────────────────*/
// Maps DOM element id → { code, name } for the currently highlighted item.
// Avoids inline onclick attributes entirely — safe with any fund name characters.
const _acRegistry = {};

function _buildDropdownItem(listEl, code, displayName, inputId, resultsId) {
    const li = document.createElement('li');
    li.className = 'ac-item';
    li.setAttribute('data-code', code);
    const uid = 'ac_' + code + '_' + inputId;
    li.id = uid;
    // Show clean name
    li.textContent = displayName;
    // Store in registry
    _acRegistry[uid] = { code: String(code), name: displayName };
    li.addEventListener('mousedown', (e) => {
        e.preventDefault(); // keep focus on input
        _selectFund(inputId, resultsId, String(code), displayName);
    });
    listEl.appendChild(li);
}

function _getActivePool() {
    const activeSet = window.activeSchemeCodesSet;
    return window.allMfFunds.filter(f => {
        const n = f.schemeName.toUpperCase();
        const passesName = n.includes('DIRECT') && n.includes('GROWTH') &&
            !n.includes('IDCW') && !n.includes('DIVIDEND');
        const passesActive = !activeSet || activeSet.size === 0 ||
            activeSet.has(String(f.schemeCode));
        return passesName && passesActive;
    });
}

function _selectFund(inputId, resultsId, code, cleanName) {
    const input = document.getElementById(inputId);
    const resultsList = document.getElementById(resultsId);

    // Set the clean readable name in the input — never the code
    input.value = cleanName;
    resultsList.style.display = 'none';

    if (inputId === 'searchInput') {
        // For main search: store and immediately navigate to the fund dashboard
        currentlySelectedSchemeCode = code;
        loadFund(code);
    } else if (inputId === 'compareInputA') {
        document.getElementById('compareCodeA').value = code;
    } else if (inputId === 'compareInputB') {
        document.getElementById('compareCodeB').value = code;
    }
}

function _renderTrending(inputId, resultsId) {
    const resultsList = document.getElementById(resultsId);
    resultsList.innerHTML = '';

    // Section header
    const header = document.createElement('li');
    header.className = 'ac-section-header';
    header.textContent = '🔥  Trending Funds';
    resultsList.appendChild(header);

    TRENDING_FUNDS.forEach(f => {
        _buildDropdownItem(resultsList, f.schemeCode, formatFundName(f.schemeName), inputId, resultsId);
    });

    resultsList.style.display = 'block';
}

function setupAutocomplete(inputId, resultsId) {
    const input = document.getElementById(inputId);
    const resultsList = document.getElementById(resultsId);
    let _focusedIndex = -1;

    function _getItems() {
        return Array.from(resultsList.querySelectorAll('.ac-item'));
    }

    function _setFocus(idx) {
        const items = _getItems();
        items.forEach(el => el.classList.remove('ac-focused'));
        if (idx >= 0 && idx < items.length) {
            items[idx].classList.add('ac-focused');
            items[idx].scrollIntoView({ block: 'nearest' });
        }
        _focusedIndex = idx;
    }

    // ---- Input event: search as you type ----
    input.addEventListener('input', () => {
        const query = input.value.trim();
        _focusedIndex = -1;
        clearTimeout(searchTimeout);

        if (query.length === 0) {
            if (inputId === 'searchInput') {
                _renderTrending(inputId, resultsId);
            } else {
                resultsList.style.display = 'none';
            }
            currentlySelectedSchemeCode = null;
            return;
        }

        if (query.length < 3) {
            resultsList.style.display = 'none';
            currentlySelectedSchemeCode = null;
            return;
        }

        // User typed — clear stored selection
        currentlySelectedSchemeCode = null;

        searchTimeout = setTimeout(() => {
            if (window.allMfFunds.length === 0) return;
            const q = query.toLowerCase();
            const matches = _getActivePool().filter(f =>
                f.schemeName.toLowerCase().includes(q) ||
                String(f.schemeCode).includes(q)
            ).slice(0, 40);

            resultsList.innerHTML = '';
            if (matches.length === 0) {
                const empty = document.createElement('li');
                empty.className = 'ac-empty';
                empty.textContent = 'No matching funds found';
                resultsList.appendChild(empty);
            } else {
                // Subtle header
                const hdr = document.createElement('li');
                hdr.className = 'ac-section-header';
                hdr.textContent = `🔍  ${matches.length} result${matches.length > 1 ? 's' : ''} for “${query}”`;
                resultsList.appendChild(hdr);
                matches.forEach(f => {
                    _buildDropdownItem(resultsList, f.schemeCode, formatFundName(f.schemeName), inputId, resultsId);
                });
            }
            resultsList.style.display = 'block';
        }, 220);
    });

    // ---- Focus: show trending if empty (main search only) ----
    input.addEventListener('focus', () => {
        if (inputId === 'searchInput' && input.value.trim().length === 0) {
            _renderTrending(inputId, resultsId);
        }
    });

    // ---- Keyboard navigation ----
    input.addEventListener('keydown', (e) => {
        const items = _getItems();

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            _setFocus(Math.min(_focusedIndex + 1, items.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            _setFocus(Math.max(_focusedIndex - 1, 0));
        } else if (e.key === 'Escape') {
            resultsList.style.display = 'none';
            _focusedIndex = -1;
        } else if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation(); // prevent any outer listener from double-firing

            if (_focusedIndex >= 0 && items[_focusedIndex]) {
                // Arrow-key highlighted item — select it
                const uid = items[_focusedIndex].id;
                const entry = _acRegistry[uid];
                if (entry) _selectFund(inputId, resultsId, entry.code, entry.name);
            } else if (inputId === 'searchInput') {
                // No item highlighted — treat as a text search
                resultsList.style.display = 'none';
                const val = input.value.trim();
                if (currentlySelectedSchemeCode) {
                    loadFund(currentlySelectedSchemeCode);
                } else if (/^\d+$/.test(val)) {
                    loadFund(val);
                } else if (val.length >= 3) {
                    showSearchResults(val);
                }
            }
        }
    });

    // ---- Hide when clicking outside ----
    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !resultsList.contains(e.target)) {
            resultsList.style.display = 'none';
            _focusedIndex = -1;
        }
    });
}

// ---------- Wire up autocomplete instances ----------
setupAutocomplete('searchInput', 'searchResults');
setupAutocomplete('compareInputA', 'compareResultsA');
setupAutocomplete('compareInputB', 'compareResultsB');

// ---------- Search button ----------
document.getElementById('searchBtn').addEventListener('click', () => {
    const inputVal = document.getElementById('searchInput').value.trim();
    document.getElementById('searchResults').style.display = 'none';

    if (currentlySelectedSchemeCode) {
        // Already loaded by _selectFund, but allow re-trigger if button is pressed after
        loadFund(currentlySelectedSchemeCode);
    } else if (/^\d+$/.test(inputVal)) {
        loadFund(inputVal);
    } else if (inputVal.length >= 3) {
        showSearchResults(inputVal);
    }
});

// Stub — fully implemented in Step 2
function showSearchResults(query) {
    const q = query.toLowerCase().trim();

    // Filter from the already-stripped Direct+Growth active fund pool
    const activeSet = window.activeSchemeCodesSet;
    const pool = window.allMfFunds.filter(f => {
        const n = f.schemeName.toUpperCase();
        const passesName = n.includes('DIRECT') && n.includes('GROWTH') &&
            !n.includes('IDCW') && !n.includes('DIVIDEND');
        const passesActive = !activeSet || activeSet.size === 0 ||
            activeSet.has(String(f.schemeCode));
        return passesName && passesActive;
    });

    const matches = pool.filter(f =>
        f.schemeName.toLowerCase().includes(q) ||
        String(f.schemeCode).includes(q)
    ).slice(0, 100); // cap at 100 rows for DOM performance

    const subtitle = document.getElementById('searchResultsSubtitle');
    const body = document.getElementById('searchResultsBody');
    const emptyMsg = document.getElementById('searchResultsEmpty');

    if (subtitle) subtitle.textContent =
        matches.length > 0
            ? `${matches.length} fund${matches.length === 1 ? '' : 's'} matched "${query}"`
            : `No results for "${query}"`;

    if (matches.length === 0) {
        body.innerHTML = '';
        emptyMsg.style.display = 'block';
    } else {
        emptyMsg.style.display = 'none';
        body.innerHTML = matches.map(f => {
            const display = escapeHtml(formatFundName(f.schemeName));
            return `
                <tr class="table-row" style="cursor:pointer;" onclick="loadFund('${f.schemeCode}')">
                    <td style="text-align:left; font-weight:500;">${display}</td>
                    <td style="text-align:right; color:var(--text-secondary); font-size:12px;">—</td>
                    <td style="text-align:right; color:var(--text-muted); font-size:11px;">${f.schemeCode}</td>
                </tr>`;
        }).join('');
    }

    // Hide the autocomplete dropdown
    document.getElementById('searchResults').style.display = 'none';
    showState('searchResults');
}

document.getElementById('chartRangeBtns').addEventListener('click', (e) => {
    const btn = e.target.closest('.range-btn');
    if (!btn) return;
    setActiveRange(btn.dataset.range);
});

/* ── Mobile Sidebar ────────────────────────────────────────────── */
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    sidebar.classList.toggle('open');
    overlay.classList.toggle('active');
}

document.getElementById('sidebarOverlay').addEventListener('click', () => {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.remove('active');
});

/* ── Toast ──────────────────────────────────────────────────────── */
// showToast removed - now in ui.js

/* ═══════════════════════════════════════════════════════════════════
   6 ─ CATEGORY NAVIGATION & DATA TABLE
   ═══════════════════════════════════════════════════════════════════ */

const CATEGORIES = [
    {
        name: 'Hybrid Funds', icon: '⚖️',
        subs: ['Conservative Hybrid', 'Balanced Advantage', 'Aggressive Hybrid', 'Arbitrage']
    },
    {
        name: 'Equity Funds', icon: '📊',
        subs: ['Large Cap', 'Mid Cap', 'Small Cap', 'Flexi Cap', 'ELSS']
    },
    {
        name: 'Debt Funds', icon: '🏦',
        subs: ['Liquid', 'Money Market', 'Corporate Bond', 'Gilt']
    },
    {
        name: 'Passives', icon: '📈',
        subs: ['Index Funds', 'ETFs']
    }
];

/* ── Live AMFI Category Parser ────────────────────────────────── */
window.LIVE_FUNDS = {};

async function refreshLiveData(btn) {
    const originalText = btn.innerHTML;
    btn.innerHTML = '↻ Fetching...';
    btn.disabled = true;
    try {
        await fetchLiveAmfiCategories();
        btn.innerHTML = '✓ Updated';

        // Re-render whichever view is currently active so the user
        // sees the refreshed data without having to re-navigate.
        const tableView = document.getElementById('tableView');
        const welcomeState = document.getElementById('welcomeState');

        if (tableView && tableView.style.display !== 'none' && currentSubcategory) {
            // Re-select the active subcategory to repopulate the table
            // with freshly fetched LIVE_FUNDS data
            currentTableData = (window.LIVE_FUNDS[currentSubcategory] || []).map(f => ({ ...f }));
            renderTable();
        }
        // If on welcomeState, we intentionally do NOT call loadTopPerformers here 
        // because the user reported it causes the UI to unintentionally jump to Equity Funds 
        // when they just meant to refresh Live AMFI data. There is a separate refresh button for Top Funds.
    } catch (error) {
        console.error(error);
        btn.innerHTML = '✕ Error';
    }
    setTimeout(() => {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }, 2000);
}


/* ── Table Columns Config ─────────────────────────────────────── */
const TABLE_COLUMNS = [
    { key: 'name', label: 'Fund Name', type: 'string' },
    { key: 'nav', label: 'NAV (₹)', type: 'number', fmt: v => '₹' + v.toFixed(2) },
    { key: 'cagr1', label: '1Y CAGR', type: 'number', fmt: v => (v >= 0 ? '+' : '') + v.toFixed(2) + '%', color: true },
    { key: 'cagr3', label: '3Y CAGR', type: 'number', fmt: v => (v >= 0 ? '+' : '') + v.toFixed(2) + '%', color: true },
    { key: 'vol', label: 'Volatility', type: 'number', fmt: v => v.toFixed(2) + '%', colorInverse: true },
    { key: 'sharpe', label: 'Sharpe', type: 'number', fmt: v => v.toFixed(2), colorSharpe: true },
    { key: 'aum', label: 'AUM (₹Cr)', type: 'number', fmt: v => v.toLocaleString('en-IN') },
];

let currentSubcategory = null;
let currentCategoryName = null;
let currentTableData = [];
let sortState = { key: null, desc: true };

/* ── Pagination State ─────────────────────────────────────────── */
let currentPage = 1;
const ITEMS_PER_PAGE = 10;

/* ── Render Category Nav ──────────────────────────────────────── */
function renderCategoryNav() {
    const nav = document.getElementById('categoryNav');
    nav.innerHTML = CATEGORIES.map((cat, ci) => `
        <div class="cat-group" id="catGroup${ci}">
            <div class="cat-header" onclick="toggleCategory(${ci})">
                <span class="cat-header-icon">${cat.icon}</span>
                <span class="cat-header-label">${cat.name}</span>
                <span class="cat-header-arrow">▶</span>
            </div>
            <div class="cat-subs">
                ${cat.subs.map(sub => `
                    <button class="cat-sub-item" data-sub="${sub}" data-cat="${cat.name}"
                            onclick="selectSubcategory('${sub}', '${cat.name}')">${sub}</button>
                `).join('')}
            </div>
        </div>
    `).join('');
}

function toggleCategory(index) {
    const group = document.getElementById('catGroup' + index);
    group.classList.toggle('open');
}

function selectSubcategory(sub, catName) {
    currentSubcategory = sub;
    currentCategoryName = catName;
    sortState = { key: null, desc: true };
    currentPage = 1;

    // Highlight active
    document.querySelectorAll('.cat-sub-item').forEach(el => el.classList.remove('active'));
    const active = document.querySelector(`.cat-sub-item[data-sub="${sub}"]`);
    if (active) active.classList.add('active');

    // Reset filters when switching category
    resetFilterState();

    // Get live data (apply filters immediately — all clear so same as raw)
    currentTableData = (window.LIVE_FUNDS[sub] || []).map(f => ({ ...f }));

    // Populate Fund House dropdown from this category's data
    populateFundHouseFilter(currentTableData);

    renderTable();
    showState('table');

    // Close mobile sidebar
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.remove('active');
}

/* ── Render Table ─────────────────────────────────────────────── */
function renderTable() {
    // Breadcrumb
    document.getElementById('tableBreadcrumb').innerHTML =
        `<span>${currentCategoryName}</span> <span>›</span> <span class="bc-active">${currentSubcategory}</span>`;
    document.getElementById('tableTitle').textContent = currentSubcategory;

    const total = currentTableData.length;
    document.getElementById('tableSubtitle').textContent =
        `${total} fund${total !== 1 ? 's' : ''} • Live data parsed from AMFI India`;

    // Thead
    const thead = document.getElementById('fundTableHead');
    thead.innerHTML = '<tr>' + TABLE_COLUMNS.map(col => {
        const isSorted = sortState.key === col.key;
        const arrow = isSorted ? (sortState.desc ? ' ▼' : ' ▲') : ' ▼';
        return `<th class="${isSorted ? 'sorted' : ''}" onclick="sortTable('${col.key}')">
            ${col.label}<span class="sort-arrow">${arrow}</span>
        </th>`;
    }).join('') + '</tr>';

    // Tbody
    const tbody = document.getElementById('fundTableBody');
    if (total === 0) {
        tbody.innerHTML = `<tr><td colspan="${TABLE_COLUMNS.length}">
            <div class="table-empty"><div class="table-empty-icon">📭</div><p>No funds in this category yet.</p></div>
        </td></tr>`;
        document.getElementById('paginationControls').style.display = 'none';
        return;
    }

    // Clamp currentPage within valid range
    const totalPages = Math.ceil(total / ITEMS_PER_PAGE);
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIdx = Math.min(startIdx + ITEMS_PER_PAGE, total);
    const pageData = currentTableData.slice(startIdx, endIdx);

    tbody.innerHTML = pageData.map(fund => {
        const escapedName = escapeHtml(fund.name);
        return `<tr data-code="${fund.code}" data-name="${escapedName}" class="fund-row">` +
            TABLE_COLUMNS.map(col => {
                const val = fund[col.key];
                let cls = '';
                if (col.color && typeof val === 'number') cls = val >= 0 ? 'td-positive' : 'td-negative';
                if (col.colorInverse && typeof val === 'number') cls = val > 20 ? 'td-negative' : val > 12 ? 'td-neutral' : 'td-positive';
                if (col.colorSharpe && typeof val === 'number') cls = val >= 1.5 ? 'td-positive' : val >= 0.8 ? 'td-neutral' : 'td-negative';

                let displayValue = val !== null && val !== undefined ? (col.fmt ? col.fmt(val) : escapeHtml(String(val))) : '<span style="color:var(--text-muted); font-size: 11px;">—</span>';
                if (col.key === 'nav') {
                    displayValue = val ? (col.fmt ? col.fmt(val) : escapeHtml(String(val))) : '—';
                    cls += ' fw-500';
                }

                return `<td class="${cls}">${displayValue}</td>`;
            }).join('') +
            '</tr>';
    }).join('');

    // Event delegation for fund rows
    tbody.querySelectorAll('.fund-row').forEach(row => {
        row.addEventListener('click', () => {
            loadFundFromTable(row.dataset.code, row.dataset.name);
        });
    });

    // Lazy load stats for visible rows only on the current page
    if (window.tableObserver) window.tableObserver.disconnect();
    window.tableObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const tr = entry.target;
                const code = tr.dataset.code;
                const name = tr.dataset.name;
                observer.unobserve(tr);
                fetchRowStats(code, name, tr);
            }
        });
    }, { rootMargin: '200px' });

    tbody.querySelectorAll('.fund-row').forEach(row => {
        window.tableObserver.observe(row);
    });

    // Render pagination UI
    renderPagination(total, totalPages);
}

/* ── Render Pagination Controls ───────────────────────────────── */
function renderPagination(total, totalPages) {
    const controls = document.getElementById('paginationControls');
    const infoEl = document.getElementById('paginationInfo');
    const btnsEl = document.getElementById('paginationButtons');

    if (totalPages <= 1) {
        controls.style.display = 'none';
        return;
    }

    controls.style.display = 'flex';

    const startIdx = (currentPage - 1) * ITEMS_PER_PAGE + 1;
    const endIdx = Math.min(currentPage * ITEMS_PER_PAGE, total);
    infoEl.textContent = `Showing ${startIdx}–${endIdx} of ${total} funds`;

    // Build page buttons with smart ellipsis
    let html = '';

    // Previous button
    html += `<button class="page-btn" id="prevPageBtn" onclick="goToPage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>← Prev</button>`;

    // Page number buttons
    const pages = getPageRange(currentPage, totalPages);
    pages.forEach(p => {
        if (p === '...') {
            html += `<span class="page-ellipsis">…</span>`;
        } else {
            html += `<button class="page-btn ${p === currentPage ? 'active' : ''}" onclick="goToPage(${p})">${p}</button>`;
        }
    });

    // Next button
    html += `<button class="page-btn" id="nextPageBtn" onclick="goToPage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>Next →</button>`;

    btnsEl.innerHTML = html;
}

/* Helper: generates an array of page numbers with ellipsis placeholders */
function getPageRange(current, total) {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const pages = [];
    pages.push(1);
    if (current > 3) pages.push('...');
    for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) {
        pages.push(p);
    }
    if (current < total - 2) pages.push('...');
    pages.push(total);
    return pages;
}

function goToPage(page) {
    const total = currentTableData.length;
    const totalPages = Math.ceil(total / ITEMS_PER_PAGE);
    if (page < 1 || page > totalPages) return;
    currentPage = page;
    renderTable();
    // Scroll table into view smoothly
    document.getElementById('tableView').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ── Lazy Load Row Stats ──────────────────────────────────────── */
async function fetchRowStats(code, name, rowElement) {
    const fund = currentTableData.find(f => f.code === String(code));
    if (!fund || fund._statsLoading || fund._statsLoaded) return;
    fund._statsLoading = true;

    const cells = rowElement.querySelectorAll('td');

    try {
        // Fetch NAV History
        const navRes = await fetch(`https://api.mfapi.in/mf/${code}`).then(res => res.json()).catch(() => null);

        if (navRes && navRes.data && navRes.data.length > 0) {
            const history = navRes.data.map(d => ({
                date: parseDate(d.date),
                nav: parseFloat(d.nav)
            })).reverse();

            const cagr1 = getCagrForYears(history, 1);
            const cagr3 = getCagrForYears(history, 3);
            const vol = calcVolatility(history);

            fund.cagr1 = cagr1;
            fund.cagr3 = cagr3;
            if (vol !== null) {
                fund.vol = vol * 100; // Store as percentage
                if (cagr1 !== null && fund.vol > 0) {
                    fund.sharpe = (cagr1 - 0.07) / (vol * 100); // approx risk free 7%
                }
            }
        }

        // Fetch AUM
        try {
            const cleanName = sanitizeForGroww(name);
            const searchUrl = 'https://corsproxy.io/?url=' + encodeURIComponent('https://groww.in/v1/api/search/v3/query/global/st_p_query?page=0&query=' + encodeURIComponent(cleanName));
            const searchRes = await fetch(searchUrl).then(r => r.json());

            if (searchRes && searchRes.data && searchRes.data.content) {
                const schemeHit = searchRes.data.content.find(x => x.entity_type === 'Scheme');
                if (schemeHit && schemeHit.search_id) {
                    const detailUrl = 'https://corsproxy.io/?url=' + encodeURIComponent('https://groww.in/v1/api/data/mf/web/v2/scheme/search/' + schemeHit.search_id);
                    const schemeObj = await fetch(detailUrl).then(r => r.json());
                    if (schemeObj && schemeObj.aum) {
                        fund.aum = schemeObj.aum;
                    }
                }
            }
        } catch (e) { /* ignore aum fail */ }

        fund._statsLoaded = true;

    } catch (err) {
        console.error("Stats fetch error for UI table code", code, err);
    } finally {
        fund._statsLoading = false;

        // Update UI visually if this row element is still in the DOM and valid
        if (rowElement && rowElement.dataset.code === String(code)) {
            // Update indices: 2(1Y), 3(3Y), 4(Vol), 5(Sharpe), 6(AUM)
            const updateCell = (idx, colKey) => {
                const col = TABLE_COLUMNS.find(c => c.key === colKey);
                const val = fund[colKey];
                if (!cells[idx]) return;

                if (val === null || val === undefined) {
                    cells[idx].innerHTML = '<span style="color:var(--text-muted); font-size: 11px;">—</span>';
                    cells[idx].className = '';
                } else {
                    cells[idx].innerHTML = col.fmt ? col.fmt(val) : escapeHtml(String(val));
                    let cls = '';
                    if (col.color && typeof val === 'number') cls = val >= 0 ? 'td-positive' : 'td-negative';
                    if (col.colorInverse && typeof val === 'number') cls = val > 20 ? 'td-negative' : val > 12 ? 'td-neutral' : 'td-positive';
                    if (col.colorSharpe && typeof val === 'number') cls = val >= 1.5 ? 'td-positive' : val >= 0.8 ? 'td-neutral' : 'td-negative';
                    cells[idx].className = cls;
                }
            };

            updateCell(2, 'cagr1');
            updateCell(3, 'cagr3');
            updateCell(4, 'vol');
            updateCell(5, 'sharpe');
            updateCell(6, 'aum');
        }
    }
}

/* ── Filters Logic ───────────────────────────────────────────── */
let activeFilters = { type: '', house: '', navMin: null, navMax: null };

function toggleFilterPanel() {
    document.getElementById('filterPanel').classList.toggle('open');
}

function resetFilterState() {
    activeFilters = { type: '', house: '', navMin: null, navMax: null };
    const fp = document.getElementById('filterPanel');
    if (fp) {
        const typeEl = document.getElementById('filterType');
        const houseEl = document.getElementById('filterHouse');
        const minEl = document.getElementById('filterNavMin');
        const maxEl = document.getElementById('filterNavMax');
        if (typeEl) typeEl.value = '';
        if (houseEl) houseEl.value = '';
        if (minEl) minEl.value = '';
        if (maxEl) maxEl.value = '';
        document.getElementById('filterActiveBadge').classList.remove('visible');
        fp.classList.remove('open');
    }
}

function populateFundHouseFilter(funds) {
    const houseEl = document.getElementById('filterHouse');
    if (!houseEl) return;
    const houses = new Set();
    funds.forEach(f => {
        const match = f.name.match(/^([A-Za-z\s]+(?:Mutual Fund|AMC|Asset|MF))/i);
        if (match) {
            houses.add(match[1].trim());
        } else {
            const parts = f.name.split(' ');
            if (parts.length >= 2) houses.add(parts.slice(0, 2).join(' '));
        }
    });
    const sorted = [...houses].sort();
    houseEl.innerHTML = '<option value="">All Fund Houses</option>' +
        sorted.map(h => `<option value="${h.toLowerCase()}">${h}</option>`).join('');
}

function applyFilters() {
    const typeVal = document.getElementById('filterType').value;
    const houseVal = document.getElementById('filterHouse').value.toLowerCase();
    const navMinVal = parseFloat(document.getElementById('filterNavMin').value);
    const navMaxVal = parseFloat(document.getElementById('filterNavMax').value);

    activeFilters = {
        type: typeVal,
        house: houseVal,
        navMin: isNaN(navMinVal) ? null : navMinVal,
        navMax: isNaN(navMaxVal) ? null : navMaxVal
    };

    const rawData = (window.LIVE_FUNDS[currentSubcategory] || []);

    currentTableData = rawData.filter(f => {
        const nameUpper = f.name.toUpperCase();
        const isDirect = nameUpper.includes('DIRECT');
        const isGrowth = nameUpper.includes('GROWTH');
        const isIDCW = nameUpper.includes('IDCW') || nameUpper.includes('DIVIDEND');

        if (activeFilters.type === 'direct-growth' && !(isDirect && isGrowth)) return false;
        if (activeFilters.type === 'direct-idcw' && !(isDirect && isIDCW)) return false;
        if (activeFilters.type === 'regular-growth' && !(!isDirect && isGrowth)) return false;
        if (activeFilters.type === 'regular-idcw' && !(!isDirect && isIDCW)) return false;

        if (activeFilters.house && !f.name.toLowerCase().includes(activeFilters.house)) return false;

        if (activeFilters.navMin !== null && f.nav < activeFilters.navMin) return false;
        if (activeFilters.navMax !== null && f.nav > activeFilters.navMax) return false;

        return true;
    }).map(f => ({ ...f }));

    const isActive = !!(activeFilters.type || activeFilters.house || activeFilters.navMin !== null || activeFilters.navMax !== null);
    document.getElementById('filterActiveBadge').classList.toggle('visible', isActive);

    currentPage = 1;
    renderTable();
}

function clearFilters() {
    resetFilterState();
    currentTableData = (window.LIVE_FUNDS[currentSubcategory] || []).map(f => ({ ...f }));
    currentPage = 1;
    renderTable();
}

/* ── Sort Table ───────────────────────────────────────────────── */
function sortTable(key) {
    if (sortState.key === key) {
        sortState.desc = !sortState.desc;
    } else {
        sortState.key = key;
        sortState.desc = true;
    }

    currentPage = 1; // Reset to first page on sort

    const col = TABLE_COLUMNS.find(c => c.key === key);
    currentTableData.sort((a, b) => {
        let va = a[key], vb = b[key];
        if (col.type === 'string') {
            va = String(va).toLowerCase();
            vb = String(vb).toLowerCase();
            return sortState.desc ? vb.localeCompare(va) : va.localeCompare(vb);
        }
        return sortState.desc ? vb - va : va - vb;
    });

    renderTable();
}

/* ── Load Fund from Table Row ─────────────────────────────────── */
function loadFundFromTable(code, name) {
    loadFund(code);
}

/* ═══════════════════════════════════════════════════════════════════
   7 ─ FIREBASE AUTH & FIRESTORE
   ═══════════════════════════════════════════════════════════════════ */

/* ──────────────────────────────────────────────────────────────────
   🔧 PASTE YOUR FIREBASE CONFIG BELOW
   Go to Firebase Console → Project Settings → Web App → Config
   ────────────────────────────────────────────────────────────────── */
const firebaseConfig = {
    apiKey: "AIzaSyCsQAAdqM99GCWUkoOY73aVSnpZdgFCg1s",
    authDomain: "mutualfund-research-app.firebaseapp.com",
    projectId: "mutualfund-research-app",
    storageBucket: "mutualfund-research-app.firebasestorage.app",
    messagingSenderId: "587243977915",
    appId: "1:587243977915:web:d9c49156f5e194f85cfd9e"
};

// Initialize Firebase
const firebaseApp = firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let currentUser = null;

/* ── Google Sign-In ────────────────────────────────────────────── */
function handleGoogleSignIn() {
    const btn = document.getElementById('googleSignInBtn');
    btn.disabled = true;
    btn.textContent = 'Signing in…';

    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(function (error) {
        console.error('Sign-in error:', error);
        showToast('Sign-in failed: ' + error.message, 'error');
        btn.disabled = false;
        btn.innerHTML = '<svg viewBox="0 0 24 24" style="width:20px;height:20px"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg> Sign in with Google';
    });
}

/* ── Sign Out ──────────────────────────────────────────────────── */

/* ── Guest Sign-In (Dev Bypass) ────────────────────────────────── */
function handleGuestSignIn() {
    console.log("Entering Guest Mode");
    currentUser = {
        uid: "guest-user-123",
        displayName: "Guest Tester",
        email: "guest@localhost",
        photoURL: ""
    };

    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('app').style.display = 'flex';

    // Update sidebar profile
    document.getElementById('userAvatar').src = '';
    document.getElementById('userName').textContent = 'Guest Tester';
    document.getElementById('userEmail').textContent = 'guest@localhost';
    document.getElementById('userProfile').style.display = 'flex';

    showToast("Signed in as Guest (Dev Mode)", "success");

    // Mock db transactions block to let portfolio view work locally without crashing
    window.isGuestMode = true;
}

function handleSignOut() {
    auth.signOut().then(function () {
        showToast('Signed out successfully', 'success');
    }).catch(function (error) {
        showToast('Sign-out failed: ' + error.message, 'error');
    });
}

/* ── Auth State Observer ───────────────────────────────────────── */
auth.onAuthStateChanged(function (user) {
    const loginScreen = document.getElementById('loginScreen');
    const appShell = document.getElementById('app');
    const userProfile = document.getElementById('userProfile');

    if (user) {
        // User signed in
        currentUser = user;
        loginScreen.style.display = 'none';
        appShell.style.display = 'flex';

        // Update sidebar profile
        document.getElementById('userAvatar').src = user.photoURL || '';
        document.getElementById('userName').textContent = user.displayName || 'User';
        document.getElementById('userEmail').textContent = user.email || '';
        userProfile.style.display = 'flex';

        // Ensure user doc exists in Firestore
        db.collection('users').doc(user.uid).set({
            displayName: user.displayName,
            email: user.email,
            photoURL: user.photoURL,
            lastLogin: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true }).catch(function (e) {
            console.warn('Firestore user doc update failed:', e);
        });

        console.log('Auth: Signed in as', user.displayName, user.uid);
    } else {
        // User signed out - Show login screen
        currentUser = null;
        loginScreen.style.display = 'flex';
        appShell.style.display = 'none';
        userProfile.style.display = 'none';
        console.log('Auth: User is signed out, showing login screen');
    }

    // Expose inner UI and Event functions to global scope for HTML inline standard handlers
    window.handleGoogleSignIn = handleGoogleSignIn;
    window.handleSignOut = handleSignOut;
    window.handleGuestSignIn = handleGuestSignIn;
    window.refreshLiveData = refreshLiveData;
    window.loadFund = loadFund;
    window.refreshTopFunds = refreshTopFunds;
    window.setTopFundsHorizon = setTopFundsHorizon;
    window.toggleWatchlist = toggleWatchlist;
    window.loadCompareView = loadCompareView;
    window.loadPortfolioView = loadPortfolioView;
    window.loadForecastView = loadForecastView;
    window.openQrModal = typeof openQrModal !== 'undefined' ? openQrModal : () => { };
    window.openGlossary = typeof openGlossary !== 'undefined' ? openGlossary : () => { };
    window.toggleCategory = toggleCategory;
    window.selectSubcategory = selectSubcategory;
    window.renderCategoryNav = renderCategoryNav;
    window.resetCompareState = resetCompareState;
    window.goHome = typeof goHome !== 'undefined' ? goHome : () => { window.showState('welcome'); };
});


const PORTFOLIO_KEY = 'mf_portfolio_txns';
let guestTxns = JSON.parse(localStorage.getItem(PORTFOLIO_KEY)) || [];

/* ── Firestore Transaction Helpers ─────────────────────────────── */
/**
 * Add a portfolio transaction
 * @param {Object} txn - { type, schemeCode, schemeName, amount, units, navAtDate, date }
 */
function addTransaction(txn) {
    if (!currentUser) return Promise.reject(new Error('Not authenticated'));

    /* ── Guest Mode ─────────────────────────────────────────────── */
    if (currentUser.uid === "guest-user-123") {
        return new Promise(resolve => {
            if (txn.type === 'sip_config') {
                // Store SIP config as-is (no Firestore Timestamp conversion needed)
                guestTxns.push({
                    id: "guest-txn-" + Date.now(),
                    type: 'sip_config',
                    schemeCode: txn.schemeCode,
                    schemeName: txn.schemeName || '',
                    amount: Number(txn.amount),
                    startDate: txn.startDate,
                    sipStatus: txn.sipStatus || 'active',
                    endDate: txn.endDate || null,
                    isStepUp: txn.isStepUp || false,
                    stepUpAmount: Number(txn.stepUpAmount) || 0,
                    stepUpFrequency: txn.stepUpFrequency || 'annually'
                });
            } else {
                guestTxns.push({
                    id: "guest-txn-" + Date.now(),
                    type: txn.type,
                    schemeCode: txn.schemeCode,
                    schemeName: txn.schemeName || '',
                    amount: Number(txn.amount),
                    units: Number(txn.units),
                    navAtDate: Number(txn.navAtDate) || 0,
                    date: { toDate: () => new Date(txn.date) },
                    createdAt: { toDate: () => new Date() }
                });
            }
            localStorage.setItem(PORTFOLIO_KEY, JSON.stringify(guestTxns));
            setTimeout(resolve, 300);
        });
    }

    /* ── Firestore: SIP Config ──────────────────────────────────── */
    if (txn.type === 'sip_config') {
        return db.collection('users').doc(currentUser.uid)
            .collection('transactions').add({
                type: 'sip_config',
                schemeCode: txn.schemeCode,
                schemeName: txn.schemeName || '',
                amount: Number(txn.amount),
                startDate: txn.startDate,                   // 'YYYY-MM-DD' string
                sipStatus: txn.sipStatus || 'active',       // 'active' | 'paused'
                endDate: txn.endDate || null,               // 'YYYY-MM-DD' string or null
                isStepUp: txn.isStepUp || false,
                stepUpAmount: Number(txn.stepUpAmount) || 0,
                stepUpFrequency: txn.stepUpFrequency || 'annually',
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
    }

    /* ── Firestore: Lump Sum / Sell ─────────────────────────────── */
    return db.collection('users').doc(currentUser.uid)
        .collection('transactions').add({
            type: txn.type,              // 'buy' | 'sell'
            schemeCode: txn.schemeCode,
            schemeName: txn.schemeName || '',
            amount: Number(txn.amount),
            units: Number(txn.units),
            navAtDate: Number(txn.navAtDate) || 0,
            date: firebase.firestore.Timestamp.fromDate(new Date(txn.date)),
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
}



/**
 * Get all transactions for the current user
 * @returns {Promise<Array>}
 */
function getTransactions() {
    if (!currentUser) return Promise.reject(new Error('Not authenticated'));

    if (currentUser.uid === "guest-user-123") {
        return Promise.resolve([...guestTxns].reverse());
    }

    return db.collection('users').doc(currentUser.uid)
        .collection('transactions')
        .orderBy('createdAt', 'desc')   // all docs have createdAt; sip_config has no 'date' field
        .get()
        .then(function (snapshot) {
            return snapshot.docs.map(function (doc) {
                return Object.assign({ id: doc.id }, doc.data());
            });
        });
}


/**
 * Delete a transaction
 * @param {string} txnId
 */
function deleteTransaction(txnId) {
    if (!currentUser) return Promise.reject(new Error('Not authenticated'));

    if (currentUser.uid === "guest-user-123") {
        guestTxns = guestTxns.filter(t => t.id !== txnId);
        localStorage.setItem(PORTFOLIO_KEY, JSON.stringify(guestTxns));
        return Promise.resolve();
    }

    return db.collection('users').doc(currentUser.uid)

        .collection('transactions').doc(txnId).delete();
}

/* ── Portfolio Aggregation & UI ────────────────────────────────── */
async function saveTransaction() {
    if (!currentUser) return;

    const btn = document.getElementById('saveTxnBtn');
    const dateStr = document.getElementById('txnDate').value;
    const amount = parseFloat(document.getElementById('txnAmount').value);
    const units = parseFloat(document.getElementById('txnUnits').value);

    if (!dateStr || isNaN(amount) || isNaN(units)) {
        showToast("Please fill all fields correctly to calculate units.", "error");
        return;
    }

    btn.textContent = 'Saving...';
    btn.disabled = true;

    const txn = {
        type: 'buy',
        schemeCode: currentCode,
        schemeName: document.getElementById('fundName').textContent,
        amount: amount,
        units: units,
        navAtDate: amount / units,
        date: dateStr // YYYY-MM-DD
    };

    try {
        await addTransaction(txn);
        showToast("Added to portfolio successfully!", "success");
        closePortfolioModal();
        // Refresh portfolio if that view is active
        if (document.getElementById('portfolioView').style.display === 'block') {
            loadPortfolioView();
        }
    } catch (err) {
        console.error("Save Txn:", err);
        showToast("Failed to save transaction.", "error");
    } finally {
        btn.textContent = 'Save Transaction';
        btn.disabled = false;
    }
}

async function loadPortfolioView() {
    showState('portfolio');

    if (!currentUser) {
        document.getElementById('portfolioEmptyState').textContent = 'Please sign in to view your portfolio.';
        document.getElementById('portfolioEmptyState').style.display = 'block';
        document.getElementById('portfolioStatsGrid').style.display = 'none';
        document.getElementById('portfolioTableCard').style.display = 'none';
        return;
    }

    // Initialise alert settings inputs from localStorage
    const alertSettings = loadAlertSettings();
    const stopLossEl = document.getElementById('alertStopLoss');
    const takeProfitEl = document.getElementById('alertTakeProfit');
    if (stopLossEl) stopLossEl.value = alertSettings.stopLoss;
    if (takeProfitEl) takeProfitEl.value = alertSettings.takeProfit;

    document.getElementById('portfolioEmptyState').textContent = 'Loading your portfolio data...';
    document.getElementById('portfolioEmptyState').style.display = 'block';
    document.getElementById('portfolioStatsGrid').style.display = 'none';
    document.getElementById('portfolioTableCard').style.display = 'none';

    try {
        // 1. Fetch Transactions
        const txns = await getTransactions();
        if (txns.length === 0) {
            document.getElementById('portfolioEmptyState').textContent = 'Your portfolio is empty. Click "+ Add Transaction" above to get started.';
            document.getElementById('portfolioEmptyState').style.display = 'block';
            const insightsWrapper = document.getElementById('portfolioInsightsWrapper');
            const txnDetails = document.getElementById('txnHistoryDetails');
            if (insightsWrapper) insightsWrapper.style.display = 'none';
            if (txnDetails) txnDetails.style.display = 'none';
            return;
        }

        // 2. Expand sip_config records → synthetic buy transactions; keep the rest as-is
        document.getElementById('portfolioEmptyState').textContent = 'Expanding SIP history…';

        // Reset to Holdings tab by default
        switchPortfolioTab('holdings');

        let expandedTxns = []; // used for XIRR and holdings math

        // Process sip_configs first (they need NAV fetches)
        const sipConfigs = txns.filter(t => t.type === 'sip_config');
        const normalTxns = txns.filter(t => t.type !== 'sip_config');

        // Expand each SIP config into instalment rows
        for (const cfg of sipConfigs) {
            try {
                const endDate = cfg.sipStatus === 'paused' ? cfg.endDate : null;

                // Build step-up config from stored fields (graceful fallback for older docs)
                const stepUpConfig = {
                    isStepUp: !!cfg.isStepUp,
                    stepUpAmount: Number(cfg.stepUpAmount) || 0,
                    stepUpStartDate: cfg.stepUpStartDate || null,
                    stepUpFrequency: cfg.stepUpFrequency || 'annually'
                };

                const ledger = await generateSipLedger(
                    cfg.schemeCode,
                    Number(cfg.amount),
                    cfg.startDate,
                    endDate,
                    stepUpConfig
                );
                // Convert instalments into synthetic buy transactions
                ledger.instalments.forEach(inst => {
                    expandedTxns.push({
                        type: 'buy',
                        schemeCode: cfg.schemeCode,
                        schemeName: cfg.schemeName,
                        amount: inst.amount,
                        units: inst.units,
                        navAtDate: inst.nav,
                        date: inst.date,
                        _synthetic: true // flag: not a real Firestore doc
                    });
                });
            } catch (e) {
                console.warn(`SIP ledger expansion failed for ${cfg.schemeCode}:`, e);
            }
        }


        // Merge with normal transactions
        expandedTxns = [...expandedTxns, ...normalTxns];

        // 3. Group by Scheme — handle buy as inflows, sell reduces units
        const holdings = {};
        let globalInvested = 0;

        const today = new Date();
        const MS_PER_DAY = 86400000;
        const LTCG_THRESHOLD_DAYS = 365;

        expandedTxns.forEach(t => {
            const code = t.schemeCode;
            if (!holdings[code]) {
                holdings[code] = { name: t.schemeName, code, totalUnits: 0, totalInvested: 0, txns: [] };
            }
            if (t.type === 'buy') {
                holdings[code].totalUnits += Number(t.units);
                holdings[code].totalInvested += Number(t.amount);
                globalInvested += Number(t.amount);

                // Tax bucket: tag each unit lot as STCG or LTCG
                const txDate = t.date && t.date.toDate ? t.date.toDate() : new Date(t.date);
                const ageInDays = (today - txDate) / MS_PER_DAY;
                const bucket = ageInDays >= LTCG_THRESHOLD_DAYS ? 'LTCG' : 'STCG';
                if (!holdings[code].taxBuckets) holdings[code].taxBuckets = { LTCG: { units: 0, cost: 0 }, STCG: { units: 0, cost: 0 } };
                holdings[code].taxBuckets[bucket].units += Number(t.units);
                holdings[code].taxBuckets[bucket].cost += Number(t.amount);

            } else if (t.type === 'sell') {
                holdings[code].totalUnits -= Number(t.units);
                const avgCost = holdings[code].totalInvested / (holdings[code].totalUnits + Number(t.units));
                holdings[code].totalInvested -= avgCost * Number(t.units);
                globalInvested -= avgCost * Number(t.units);
            }
            holdings[code].txns.push(t);
        });

        // Remove fully-sold holdings
        Object.keys(holdings).forEach(code => {
            if (holdings[code].totalUnits <= 0) delete holdings[code];
        });


        // 3. Fetch latest NAV & Metrics for each holding in parallel (Cache-First)
        await Promise.all(Object.keys(holdings).map(async code => {
            try {
                const fundDetails = await aggregateFundDetails(code, holdings[code].name);
                if (fundDetails) {
                    // Map standardize schema back to portfolio view expectations
                    // data is sorted oldest -> newest via utils.js; take last element
                    const latestNav = (fundDetails.data && fundDetails.data.length > 0) ? fundDetails.data[fundDetails.data.length - 1].nav : 0;
                    holdings[code].currentNav = latestNav;
                    holdings[code].currentValue = latestNav * holdings[code].totalUnits;
                    holdings[code].fetchError = false;

                    // Asset allocation for donut chart
                    holdings[code].equityPct = fundDetails.portfolio.equity_percentage;
                    holdings[code].debtPct = fundDetails.portfolio.debt_percentage;
                    holdings[code].cashPct = fundDetails.portfolio.cash_percentage;
                } else {
                    holdings[code].fetchError = true;
                    holdings[code].currentNav = null;
                    holdings[code].currentValue = null;
                }
            } catch (err) {
                console.error(`Failed to fetch details for ${code}:`, err);
                holdings[code].fetchError = true;
                holdings[code].currentNav = null;
                holdings[code].currentValue = null;
            }
        }));

        // 4. Build holdings table
        let globalCurrentValue = 0;
        let globalInvestedInSuccessfulFunds = 0; // only sum invested if fetch worked
        const tbody = document.getElementById('portfolioTableBody');
        tbody.innerHTML = '';

        Object.values(holdings).forEach(h => {
            const hasError = h.fetchError || h.currentValue === null;
            if (!hasError) {
                globalCurrentValue += h.currentValue;
                globalInvestedInSuccessfulFunds += h.totalInvested;
            }

            const avgNav = h.totalUnits > 0 ? h.totalInvested / h.totalUnits : 0;
            const absReturnPct = (!hasError && h.totalInvested > 0) ? ((h.currentValue - h.totalInvested) / h.totalInvested) * 100 : 0;
            const isLoss = absReturnPct < 0;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="font-weight: 500; cursor: pointer;" onclick="loadFund('${h.code}')">
                    ${escapeHtml(h.name)} 
                    ${hasError ? '<span title="Fetch failed" style="color:var(--error); cursor:help;">⚠️</span>' : ''}
                </td>
                <td style="cursor: pointer;" onclick="loadFund('${h.code}')">${h.totalUnits.toFixed(3)}</td>
                <td style="cursor: pointer;" onclick="loadFund('${h.code}')">₹${avgNav.toFixed(2)}</td>
                <td style="cursor: pointer;" onclick="loadFund('${h.code}')">${hasError ? '<span style="color:var(--error);">---</span>' : '₹' + h.currentNav.toFixed(2)}</td>
                <td style="cursor: pointer;" onclick="loadFund('${h.code}')">₹${h.totalInvested.toLocaleString('en-IN')}</td>
                <td style="cursor: pointer;" onclick="loadFund('${h.code}')">${hasError ? '<span style="color:var(--error);">---</span>' : '₹' + h.currentValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                <td style="text-align: right; display: flex; align-items: center; justify-content: flex-end; gap: 8px;" class="${hasError ? '' : getPercentClass(absReturnPct / 100)}">
                    <span style="min-width: 60px;">${hasError ? 'Error' : (absReturnPct >= 0 ? '+' : '') + absReturnPct.toFixed(2) + '%'}</span>
                </td>
            `;
            tbody.appendChild(tr);
        });

        // 5. Compute aggregate financial stats
        // Formula change: only compare Current Value vs Invested amount for funds that actually loaded!
        const totalAbsReturn = globalInvestedInSuccessfulFunds > 0 ? ((globalCurrentValue - globalInvestedInSuccessfulFunds) / globalInvestedInSuccessfulFunds) * 100 : 0;

        document.getElementById('pfTotalInvested').textContent = '₹' + globalInvested.toLocaleString('en-IN');
        document.getElementById('pfCurrentValue').textContent = '₹' + globalCurrentValue.toLocaleString('en-IN', { maximumFractionDigits: 0 });

        const returnEl = document.getElementById('pfAbsoluteReturn');
        returnEl.textContent = (totalAbsReturn >= 0 ? '+' : '') + totalAbsReturn.toFixed(2) + '%';
        returnEl.className = 'stat-value ' + getPercentClass(totalAbsReturn / 100);

        // 5b. Asset Allocation & Tax Bucketing analytics
        let weightedEquityRs = 0, weightedDebtRs = 0, weightedCashRs = 0;
        let stcgValue = 0, ltcgValue = 0;

        Object.values(holdings).forEach(h => {
            const cv = h.currentValue || 0;
            const nav = h.currentNav || 0;

            // Weighted equity / debt by current value
            if (h.equityPct !== undefined) {
                weightedEquityRs += cv * (h.equityPct / 100);
                weightedDebtRs += cv * (h.debtPct / 100);
                weightedCashRs += cv * (h.cashPct / 100);
            } else {
                // Fall back to category guess from master list
                const meta = (window.allMfFunds || []).find(f => String(f.schemeCode) === String(h.code));
                const cat = (meta?.category || '').toLowerCase();
                if (cat.includes('debt') || cat.includes('liquid') || cat.includes('overnight')) {
                    weightedDebtRs += cv;
                } else if (cat.includes('hybrid')) {
                    weightedEquityRs += cv * 0.65;
                    weightedDebtRs += cv * 0.35;
                } else {
                    weightedEquityRs += cv;   // default: treat as equity
                }
            }

            // STCG / LTCG values based on current NAV
            if (h.taxBuckets && nav > 0) {
                stcgValue += h.taxBuckets.STCG.units * nav;
                ltcgValue += h.taxBuckets.LTCG.units * nav;
            }
        });

        const totalAllocated = weightedEquityRs + weightedDebtRs + weightedCashRs || globalCurrentValue || 1;
        const portfolioEquityPct = (weightedEquityRs / totalAllocated) * 100;
        const portfolioDebtPct = (weightedDebtRs / totalAllocated) * 100;
        const portfolioCashPct = Math.max(0, 100 - portfolioEquityPct - portfolioDebtPct);

        // Update STCG / LTCG stat tiles
        const stcgEl = document.getElementById('pfStcgValue');
        const ltcgEl = document.getElementById('pfLtcgValue');
        if (stcgEl) stcgEl.textContent = '₹' + stcgValue.toLocaleString('en-IN', { maximumFractionDigits: 0 });
        if (ltcgEl) ltcgEl.textContent = '₹' + ltcgValue.toLocaleString('en-IN', { maximumFractionDigits: 0 });

        // Step 4: Tax Liability Calculation
        // Formula: STCG * 0.20, (LTCG - 1.25L) * 0.125
        const stcgTax = stcgValue * 0.20;
        const ltcgTaxable = Math.max(0, ltcgValue - 125000);
        const ltcgTax = ltcgTaxable * 0.125;
        const totalTax = stcgTax + ltcgTax;

        const stcgTaxEl = document.getElementById('pfStcgTax');
        const ltcgTaxEl = document.getElementById('pfLtcgTax');
        const totalTaxEl = document.getElementById('pfTotalTax');

        if (stcgTaxEl) stcgTaxEl.textContent = '₹' + Math.round(stcgTax).toLocaleString('en-IN');
        if (ltcgTaxEl) ltcgTaxEl.textContent = '₹' + Math.round(ltcgTax).toLocaleString('en-IN');
        if (totalTaxEl) totalTaxEl.textContent = '₹' + Math.round(totalTax).toLocaleString('en-IN');

        // Trigger Smart Diagnosis
        window.currentUserPortfolio = Object.values(holdings); // store for diagnosis
        runSmartPortfolioDiagnosis(Object.values(holdings));

        // Render allocation donut
        if (typeof renderAllocationDonut === 'function') {
            renderAllocationDonut(portfolioEquityPct, portfolioDebtPct, portfolioCashPct);
        }

        // 6. XIRR — build cash flows across all expanded transactions (includes synthetic SIP rows)
        const allBuyTxns = expandedTxns.filter(t => t.type === 'buy');
        const cashFlows = buildCashFlows(allBuyTxns, globalCurrentValue);
        const xirrEl = document.getElementById('pfXirr');
        if (cashFlows && cashFlows.length >= 2 && globalCurrentValue > 0) {
            try {
                const xirr = computeXIRR(cashFlows);
                if (isFinite(xirr) && !isNaN(xirr)) {
                    xirrEl.textContent = (xirr >= 0 ? '+' : '') + (xirr * 100).toFixed(2) + '%';
                    xirrEl.className = 'stat-value ' + getPercentClass(xirr);
                } else {
                    xirrEl.textContent = '—';
                }
            } catch (e) {
                xirrEl.textContent = '—';
            }
        } else {
            xirrEl.textContent = '—';
        }

        // 7. Show main sections + build analyticsData for steps 7b and 9
        document.getElementById('portfolioEmptyState').style.display = 'none';
        document.getElementById('portfolioStatsGrid').style.display = 'grid';
        document.getElementById('portfolioSummaryBar').style.display = 'flex';
        document.getElementById('portfolioTableCard').style.display = 'block';
        const toggleBar = document.getElementById('analyticsToggleBar');
        if (toggleBar) toggleBar.style.display = 'flex';

        const freshAlertSettings = loadAlertSettings();
        const analyticsData = { portfolioEquityPct, stcgValue, ltcgValue, holdings };

        // 7b. Run Robo-Advisor Suggestions Lab (non-blocking, uses analyticsData)
        if (typeof runRoboAdvisor === 'function') {
            runRoboAdvisor(holdings, analyticsData);
        }

        // 8. Render Transaction History
        const txnDetails = document.getElementById('txnHistoryDetails');
        if (txnDetails) txnDetails.style.display = 'block';
        renderTransactionHistory(txns);

        // 9. Run Insights & Alerts — pass analyticsData (portfolioEquityPct + taxData)
        const insightsWrapper = document.getElementById('portfolioInsightsWrapper');
        if (insightsWrapper) insightsWrapper.style.display = 'block';
        const alerts = await runInsightAlerts(holdings, freshAlertSettings, analyticsData);
        renderInsightAlerts(alerts);

    } catch (e) {
        console.error("Portfolio Load Error:", e);
        document.getElementById('portfolioEmptyState').textContent = 'Failed to load portfolio: ' + e.message;
        document.getElementById('portfolioEmptyState').style.display = 'block';
    }
}

/* ── QR CODE MODAL ──────────────────────────────────────── */
function openQrModal() {
    document.getElementById('qrModal').style.display = 'flex';
}

function closeQrModal() {
    document.getElementById('qrModal').style.display = 'none';
}

/* ── Compare Funds Logic ───────────────────────────────────────── */
let compareDataA = [];
let compareDataB = [];

/* ── Top 5 Performers Logic Constants ─────────────────────────── */
let topFundsHorizon = '1Y'; // '1Y' | '3Y' | '5Y' | 'Max'
let topFundsCategory = 'Equity Funds';
const HORIZON_YEARS_MAP = { '1Y': 1, '3Y': 3, '5Y': 5, 'Max': null };
const HORIZON_MIN_DAYS = { '1Y': 252, '3Y': 252 * 3, '5Y': 252 * 5, 'Max': 252 };
let compareChartInstance = null;
let currentCompareRange = 'MAX';

function loadCompareView() {
    resetCompareState();
    showState('compare');
}

document.getElementById('runCompareBtn').addEventListener('click', async () => {
    let codeA = document.getElementById('compareCodeA').value.trim();
    let codeB = document.getElementById('compareCodeB').value.trim();

    const inputA = document.getElementById('compareInputA').value.trim();
    const inputB = document.getElementById('compareInputB').value.trim();

    if (!codeA && /^\\d+$/.test(inputA)) codeA = inputA;
    if (!codeB && /^\\d+$/.test(inputB)) codeB = inputB;

    if (!codeA || !codeB) {
        showToast("Please select two funds from the search dropdown.", "error");
        return;
    }

    document.getElementById('compareResults').style.display = 'none';
    document.getElementById('compareLoadingState').style.display = 'block';

    try {
        const [fundA, fundB] = await Promise.all([
            aggregateFundDetails(codeA, inputA),
            aggregateFundDetails(codeB, inputB)
        ]);

        if (!fundA || !fundB) {
            throw new Error("Failed to load aggregated fund details.");
        }

        compareState.fundA = fundA;
        compareState.fundB = fundB;

        renderCompareChart();
        renderCompareTable(); // Initial render for active tab (defaults to returns)

        document.getElementById('compareLoadingState').style.display = 'none';
        document.getElementById('compareResults').style.display = 'block';

    } catch (e) {
        console.error("Compare fetch error:", e);
        showToast("Error loading comparison data.", "error");
        document.getElementById('compareLoadingState').style.display = 'none';
    }
});

function populateCompareStats(meta, data, advStats, prefix) {
    // Legacy support for any existing UI elements that haven't been removed yet
    if (!data || data.length === 0) return;
    const latest = data[data.length - 1];
    const nameEl = document.getElementById(`compName${prefix}`);
    if (nameEl) nameEl.textContent = meta.scheme_name || 'Unknown Scheme';
}

/* --- Compare Table Rendering --- */
function renderCompareTable() {
    if (!compareState.fundA.meta || !compareState.fundB.meta) return;

    const headerHeader = document.getElementById('compareTableHeader');
    const tbody = document.getElementById('compareTableBody');
    const tabs = document.querySelectorAll('.compare-tab');

    // Update Tab UI
    tabs.forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === compareState.activeTab);
    });

    // Render Headers
    headerHeader.innerHTML = '<th></th>' +
        `<th style="color: var(--accent);">${formatFundName(compareState.fundA.meta.scheme_name)}</th>` +
        `<th style="color: #ec4899;">${formatFundName(compareState.fundB.meta.scheme_name)}</th>`;

    const rows = COMPARE_ROWS[compareState.activeTab] || [];
    tbody.innerHTML = rows.map(row => {
        let valA = '-', valB = '-';
        let classA = '', classB = '';

        if (compareState.activeTab === 'returns') {
            valA = calculateTrailingReturn(compareState.fundA.data, row.period);
            valB = calculateTrailingReturn(compareState.fundB.data, row.period);
            classA = getPercentClass(valA);
            classB = getPercentClass(valB);
            valA = formatPercent(valA);
            valB = formatPercent(valB);
        } else if (compareState.activeTab === 'risk') {
            valA = formatCompareData(compareState.fundA.risk?.[row.key]);
            valB = formatCompareData(compareState.fundB.risk?.[row.key]);
        } else if (compareState.activeTab === 'assets') {
            valA = formatCompareData(compareState.fundA.portfolio?.[row.key], '%');
            valB = formatCompareData(compareState.fundB.portfolio?.[row.key], '%');
        } else if (compareState.activeTab === 'details') {
            if (row.type === 'currency' && compareState.fundA.portfolio?.[row.key]) {
                valA = '₹' + compareState.fundA.portfolio[row.key] + ' Cr';
            } else {
                valA = formatCompareData(compareState.fundA.portfolio?.[row.key]);
            }
            if (row.type === 'currency' && compareState.fundB.portfolio?.[row.key]) {
                valB = '₹' + compareState.fundB.portfolio[row.key] + ' Cr';
            } else {
                valB = formatCompareData(compareState.fundB.portfolio?.[row.key]);
            }
        }

        return `<tr>
            <td>${row.label}</td>
            <td class="${classA}">${valA}</td>
            <td class="${classB}">${valB}</td>
        </tr>`;
    }).join('');

    // Special Case: Top 10 Holdings Section
    if (compareState.activeTab === 'holdings') {
        const holdingsA = (compareState.fundA.portfolio?.holdings || []).slice(0, 10);
        const holdingsB = (compareState.fundB.portfolio?.holdings || []).slice(0, 10);

        if (holdingsA.length > 0 || holdingsB.length > 0) {
            tbody.innerHTML += `
                <tr class="sub-header">
                    <td colspan="3">Top 10 Holdings</td>
                </tr>
            `;

            for (let i = 0; i < 10; i++) {
                const hA = holdingsA[i];
                const hB = holdingsB[i];
                if (!hA && !hB) break;

                tbody.innerHTML += `
                    <tr>
                        <td>Asset #${i + 1}</td>
                        <td>${hA ? `${hA.company_name || hA.name || '-'} <br><small style="color:var(--text-muted)">${hA.corpus_per || hA.weight || hA.asset_percentage || '-'}%</small>` : '-'}</td>
                        <td>${hB ? `${hB.company_name || hB.name || '-'} <br><small style="color:var(--text-muted)">${hB.corpus_per || hB.weight || hB.asset_percentage || '-'}%</small>` : '-'}</td>
                    </tr>
                `;
            }
        } else {
            tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;color:var(--text-muted);padding:32px;">No holding data available from upstream API</td></tr>`;
        }
    }
}

function calculateTrailingReturn(data, period) {
    if (!data || data.length < 2) return null;
    const latest = data[data.length - 1];
    let past = null;

    if (typeof period === 'number') {
        return getCagrForYears(data, period);
    }

    const latestDate = new Date(latest.date);
    const targetDate = new Date(latestDate);

    if (period === 'ytd') {
        targetDate.setMonth(0, 1);
        targetDate.setHours(0, 0, 0, 0);
    } else if (period === '1d') {
        targetDate.setDate(latestDate.getDate() - 1);
    } else if (period === '1w') {
        targetDate.setDate(latestDate.getDate() - 7);
    } else if (period === '1m') {
        targetDate.setMonth(latestDate.getMonth() - 1);
    } else if (period === '3m') {
        targetDate.setMonth(latestDate.getMonth() - 3);
    } else if (period === '6m') {
        targetDate.setMonth(latestDate.getMonth() - 6);
    }

    // Find closest date <= targetDate
    for (let i = data.length - 1; i >= 0; i--) {
        if (data[i].date <= targetDate) {
            past = data[i];
            break;
        }
    }

    if (!past || past === latest) return null;
    return (latest.nav / past.nav) - 1;
}

// Tab Switching Listener
document.getElementById('compareTabs').addEventListener('click', (e) => {
    const tabEl = e.target.closest('.compare-tab');
    if (!tabEl) return;
    compareState.activeTab = tabEl.dataset.tab;
    renderCompareTable();
});

// Compare Range Selector
document.querySelectorAll('#compareRangeBtns .range-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('#compareRangeBtns .range-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        currentCompareRange = e.target.dataset.range;
        renderCompareChart();
    });
});

function renderCompareChart() {
    if (!compareState.fundA.data || !compareState.fundB.data ||
        compareState.fundA.data.length === 0 || compareState.fundB.data.length === 0) return;

    // Determine Common Start Date based on range
    const now = new Date();
    let limitDate = new Date("1970-01-01");

    if (currentCompareRange === '1Y') { limitDate = new Date(new Date().setFullYear(now.getFullYear() - 1)); }
    else if (currentCompareRange === '3Y') { limitDate = new Date(new Date().setFullYear(now.getFullYear() - 3)); }
    else if (currentCompareRange === '5Y') { limitDate = new Date(new Date().setFullYear(now.getFullYear() - 5)); }

    // Filter data
    const filtA = compareState.fundA.data.filter(d => d.date >= limitDate);
    const filtB = compareState.fundB.data.filter(d => d.date >= limitDate);

    if (filtA.length === 0 || filtB.length === 0) {
        showToast("Not enough data for the selected range to compare", "error");
        return;
    }

    // Normalize starting NAV to 100
    const baseNavA = filtA[0].nav;
    const baseNavB = filtB[0].nav;

    const normA = filtA.map(d => ({ x: d.date.getTime(), y: (d.nav / baseNavA) * 100 }));
    const normB = filtB.map(d => ({ x: d.date.getTime(), y: (d.nav / baseNavB) * 100 }));

    const canvas = document.getElementById('compareChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (compareChartInstance) {
        compareChartInstance.destroy();
    }

    compareChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [
                {
                    label: formatFundName(compareState.fundA.meta.scheme_name),
                    data: normA,
                    borderColor: '#38bdf8',
                    backgroundColor: 'rgba(56, 189, 248, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.1,
                    pointRadius: 0,
                    pointHoverRadius: 6
                },
                {
                    label: formatFundName(compareState.fundB.meta.scheme_name),
                    data: normB,
                    borderColor: '#ec4899', // Pink
                    backgroundColor: 'rgba(236, 72, 153, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.1,
                    pointRadius: 0,
                    pointHoverRadius: 6
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
                    display: true,
                    position: 'bottom',
                    labels: { color: '#94a3b8' }
                },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    titleColor: '#f1f5f9',
                    bodyColor: '#cbd5e1',
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderWidth: 1,
                    padding: 12,
                    callbacks: {
                        label: function (context) {
                            return context.dataset.label.substring(0, 20) + '... : ' + context.parsed.y.toFixed(2) + ' (Base 100)';
                        }
                    }
                }
            },
            scales: {
                x: {
                    type: 'time',
                    time: { tooltipFormat: 'dd MMM yyyy' },
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#64748b' }
                },
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#64748b' }
                }
            }
        }
    });
}


/* ── SIP Forecast View ─────────────────────────────────────────── */
async function loadForecastView() {
    showState('sip-forecast');
    // Active Tab Styling
    document.querySelectorAll('.sidebar-nav-item, .portfolio-nav-item').forEach(el => el.classList.remove('active'));
    document.getElementById('forecastNavBtn').classList.add('active');

    await runSIPForecast();
}

async function runSIPForecast() {
    const opportunitiesList = document.getElementById('sipOpportunitiesList');
    const loading = document.getElementById('sipOpportunityLoading');
    const alertBox = document.getElementById('marketCorrectionAlert');
    if (!opportunitiesList || !loading || !alertBox) return;

    loading.style.display = 'block';
    opportunitiesList.innerHTML = '';
    alertBox.innerHTML = '';

    try {
        // 1. Market Crash Detector (Nifty 50 - 120716)
        const niftyJson = await fetchFundData('120716');
        const niftyData = prepareNavData(niftyJson.data);
        if (niftyData.length > 10) {
            const recent = niftyData.slice(-10);
            const peak = Math.max(...recent.map(d => d.nav));
            const latest = niftyData[niftyData.length - 1].nav;
            const drawdown = (latest - peak) / peak;

            if (drawdown <= -0.08) { // 8% correction in 10 days is significant per specs
                alertBox.innerHTML = `
                    <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 12px; padding: 20px; display: flex; align-items: center; gap: 20px;">
                        <div style="font-size: 32px;">🚨</div>
                        <div>
                            <div style="font-size: 16px; font-weight: 700; color: #ef4444; margin-bottom: 4px;">Market Correction Detected!</div>
                            <div style="font-size: 13px; color: var(--text-secondary);">
                                Nifty 50 has dropped <strong>${(Math.abs(drawdown) * 100).toFixed(2)}%</strong> from its 10-day peak. 
                                This is historically a great time to increase your SIP amounts or make top-up investments.
                            </div>
                        </div>
                    </div>
                `;
            }
        }

        // 2. 200 DMA Opportunity Scanner
        const watchlist = loadWatchlist();
        const portfolio = window.currentUserPortfolio || [];
        const uniqueCodes = new Set([...watchlist.map(f => f.code), ...portfolio.map(f => f.schemeCode)]);

        const opportunities = [];
        for (const code of uniqueCodes) {
            try {
                const json = await fetchFundData(code);
                const data = prepareNavData(json.data);
                if (data.length >= 200) {
                    const dma200 = calcDMA(data, 200);
                    const latest = data[data.length - 1].nav;
                    if (latest < dma200) {
                        opportunities.push({
                            code,
                            name: json.meta.scheme_name,
                            category: json.meta.scheme_category,
                            price: latest,
                            dma: dma200,
                            discount: (dma200 - latest) / dma200
                        });
                    }
                }
            } catch (e) { }
            // Throttle
            await new Promise(r => setTimeout(r, 400));
        }

        loading.style.display = 'none';
        if (opportunities.length === 0) {
            opportunitiesList.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted); font-size: 13px;">
                    No accumulation opportunities found. All your funds are trading above their 200 DMA.
                </div>
            `;
        } else {
            opportunitiesList.innerHTML = opportunities.map(opp => `
                <div class="stat-card" style="cursor: pointer;" onclick="loadFund('${opp.code}')">
                    <div style="font-size: 10px; font-weight: 700; color: var(--accent); text-transform: uppercase; margin-bottom: 6px;">💎 Accumulation Zone</div>
                    <div style="font-size: 13px; font-weight: 700; color: var(--text-primary); margin-bottom: 12px; line-height: 1.4;">${escapeHtml(opp.name)}</div>
                    <div style="display: flex; justify-content: space-between; align-items: flex-end;">
                        <div>
                            <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 2px;">Vs 200 DMA</div>
                            <div style="font-size: 14px; font-weight: 700; color: #ef4444;">-${(opp.discount * 100).toFixed(2)}%</div>
                        </div>
                        <div style="text-align: right;">
                            <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 2px;">NAV</div>
                            <div style="font-size: 14px; font-weight: 600;">₹${opp.price.toFixed(2)}</div>
                        </div>
                    </div>
                </div>
            `).join('');
        }

    } catch (err) {
        loading.style.display = 'none';
        console.error("Forecast error:", err);
    }
}

/* ── Robo Momentum Scanner (Homepage) ────────────────────────────── */
async function runMomentumScanner() {
    const loadingEl = document.getElementById('momentumLoading');
    const gridEl = document.getElementById('momentumGrid');
    if (!loadingEl || !gridEl) return;

    if (!window.FUND_UNIVERSE || window.FUND_UNIVERSE.length === 0) {
        if (loadingEl) loadingEl.style.display = 'none';
        return;
    }

    try {
        const momentumResults = [];
        const batchSize = 5; // Process in batches to avoid 429s

        for (let i = 0; i < window.FUND_UNIVERSE.length; i += batchSize) {
            const batch = window.FUND_UNIVERSE.slice(i, i + batchSize);

            const results = await Promise.allSettled(batch.map(async (code) => {
                const json = await fetchFundData(code);
                const data = prepareNavData(json.data);
                if (data.length < 2) return null;

                // Calculate 30-day return (approx)
                const end = data[data.length - 1];
                let startIdx = 0;
                const thirtyDaysAgo = new Date(end.date);
                thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

                for (let j = data.length - 1; j >= 0; j--) {
                    if (data[j].date <= thirtyDaysAgo) {
                        startIdx = j;
                        break;
                    }
                }
                const start = data[startIdx];
                const returnVal = (end.nav - start.nav) / start.nav;

                return {
                    code,
                    name: json.meta.scheme_name,
                    category: json.meta.scheme_category,
                    return30d: returnVal,
                    nav: end.nav
                };
            }));

            results.forEach(res => {
                if (res.status === 'fulfilled' && res.value) {
                    momentumResults.push(res.value);
                }
            });

            // Brief delay between batches
            if (i + batchSize < window.FUND_UNIVERSE.length) {
                await new Promise(r => setTimeout(r, 600));
            }
        }

        // Sort descending and take top 3
        momentumResults.sort((a, b) => b.return30d - a.return30d);
        const top3 = momentumResults.slice(0, 3);

        if (top3.length === 0) {
            loadingEl.innerHTML = '<div style="font-size:12px;">No breakout data found today.</div>';
            return;
        }

        loadingEl.style.display = 'none';
        gridEl.style.display = 'grid';
        gridEl.innerHTML = top3.map(f => `
            <div class="stat-card" style="cursor:pointer;" onclick="loadFund('${f.code}')">
                <div style="font-size:10px; font-weight:700; color:var(--accent); text-transform:uppercase; margin-bottom:6px;">🔥 30D Momentum</div>
                <div style="font-size:13px; font-weight:700; color:var(--text-primary); margin-bottom:8px; line-height:1.4; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">${escapeHtml(f.name)}</div>
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div style="font-size:11px; color:var(--text-muted);">${escapeHtml(f.category)}</div>
                    <div style="font-size:14px; font-weight:700; color:#10b981;">+${(f.return30d * 100).toFixed(2)}%</div>
                </div>
            </div>
        `).join('');

    } catch (err) {
        console.error("Scanner error:", err);
        loadingEl.innerHTML = '<div style="font-size:12px;">Scanner paused. Too many requests.</div>';
    }
}

/* ── Top 5 Performers Logic ─────────────────────────────────────── */
// Variables moved to top for proper initialization

function setTopFundsHorizon(horizon) {
    topFundsHorizon = horizon;
    document.querySelectorAll('#topFundsHorizonBtns .range-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.horizon === horizon);
    });
    loadTopPerformers(topFundsCategory, horizon);
}

async function refreshTopFunds() {
    const btn = document.getElementById('topFundsRefreshBtn');
    const spinner = document.getElementById('topFundsRefreshSpinner');
    const label = document.getElementById('topFundsRefreshLabel');
    if (!btn || btn.disabled) return;

    btn.disabled = true;
    spinner.style.display = 'inline-block';
    label.textContent = 'Fetching…';

    try {
        // Re-fetch fresh AMFI categories (clears & rebuilds LIVE_FUNDS)
        await fetchLiveAmfiCategories();
        // Re-rank top performers with current category + horizon
        await loadTopPerformers(topFundsCategory, topFundsHorizon);
        label.textContent = '✓ Updated';
    } catch (e) {
        console.error('Refresh failed:', e);
        label.textContent = '✕ Error';
    } finally {
        spinner.style.display = 'none';
        btn.disabled = false;
        setTimeout(() => { label.textContent = '↻ Refresh'; }, 2000);
    }
}

async function loadTopPerformers(categoryStr, horizon) {
    horizon = horizon || topFundsHorizon;
    topFundsCategory = categoryStr;

    const grid = document.getElementById('topPerformersGrid');
    const loader = document.getElementById('topPerformersLoading');
    const heading = document.getElementById('topFundsHeading');
    grid.innerHTML = '';
    loader.style.display = 'block';

    // Update heading to current horizon
    const horizonLabel = horizon === 'Max' ? 'All-Time' : horizon;
    if (heading) heading.textContent = `Top 5 Funds (${horizonLabel} Return)`;

    try {
        const catObj = CATEGORIES.find(c => c.name === categoryStr);
        if (!catObj) return;

        let allCodes = [];
        catObj.subs.forEach(sub => {
            if (window.LIVE_FUNDS[sub]) {
                allCodes = allCodes.concat(window.LIVE_FUNDS[sub]);
            }
        });

        // Limit to 30 to avoid excessive fetching
        allCodes = allCodes.slice(0, 30);

        const minDays = HORIZON_MIN_DAYS[horizon] || 252;
        const yearsBack = HORIZON_YEARS_MAP[horizon]; // null = Max

        const promises = allCodes.map(async (fund) => {
            try {
                const res = await fetch('https://api.mfapi.in/mf/' + fund.code);
                if (!res.ok) return null;
                const data = await res.json();
                if (!data.data || data.data.length < minDays) return null;

                const history = data.data.map(d => ({
                    date: parseDate(d.date),
                    nav: parseFloat(d.nav)
                })).reverse(); // oldest → newest

                let cagr;
                if (yearsBack === null) {
                    // Max: use getCAGR full range
                    cagr = getCAGR(history, null);
                } else {
                    cagr = getCagrForYears(history, yearsBack);
                }

                if (cagr === null || isNaN(cagr)) return null;

                return { code: fund.code, name: fund.name, cagr, horizon };
            } catch (e) {
                return null;
            }
        });

        const results = await Promise.all(promises);
        const valid = results.filter(r => r !== null);

        // Sort by selected CAGR descending
        valid.sort((a, b) => b.cagr - a.cagr);

        const top5 = valid.slice(0, 5);

        loader.style.display = 'none';

        if (top5.length === 0) {
            grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); font-size: 13px;">Not enough ${horizonLabel} historical data for this category.</div>`;
            return;
        }

        grid.innerHTML = top5.map(f => {
            const words = f.name.split(' ').filter(w => w.length > 0);
            const init1 = words[0] ? words[0][0].toUpperCase() : '';
            const init2 = words[1] && !words[1].toLowerCase().includes('fund') ? words[1][0].toUpperCase() : '';
            const initials = init1 + init2 || 'MF';
            return `
            <div class="top-perf-card" onclick="loadFund('${f.code}')">
                <div class="tp-header">
                    <div class="tp-avatar">${initials}</div>
                    <div class="tp-info">
                        <div class="tp-title" title="${f.name}">${f.name}</div>
                        <div class="tp-sub">${horizonLabel} Annualised CAGR</div>
                    </div>
                </div>
                <div class="tp-return">${f.cagr >= 0 ? '+' : ''}${(f.cagr * 100).toFixed(2)}%</div>
            </div>
        `}).join('');

    } catch (err) {
        console.error(err);
        loader.style.display = 'none';
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #f87171; font-size: 13px;">Failed to load data.</div>';
    }
}

document.getElementById('topPerfFilters').addEventListener('click', (e) => {
    if (e.target.classList.contains('pf-filter-btn')) {
        document.querySelectorAll('.pf-filter-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        loadTopPerformers(e.target.dataset.cat, topFundsHorizon);
    }
});

/* ═══════════════════════════════════════════════════════════════════
   8 ─ MF GLOSSARY
   ═══════════════════════════════════════════════════════════════════ */

const GLOSSARY_TERMS = [
    {
        term: 'NAV (Net Asset Value)',
        definition: 'The per-unit market value of a mutual fund. Calculated as (Total Assets − Liabilities) ÷ Total Units outstanding. This is the price at which units are bought or sold on a given day.'
    },
    {
        term: 'CAGR (Compound Annual Growth Rate)',
        definition: 'The rate at which an investment grows from its beginning value to its ending value, assuming profits are reinvested each year. Formula: (Ending Value / Beginning Value)^(1/N) − 1, where N is the number of years.'
    },
    {
        term: 'XIRR (Extended Internal Rate of Return)',
        definition: 'A function that calculates the return on an investment where cash flows occur at irregular intervals of time. Commonly used to measure the actual return on SIP investments.'
    },
    {
        term: 'SIP (Systematic Investment Plan)',
        definition: 'A disciplined investment method where a fixed amount is invested in a mutual fund at regular intervals (weekly, monthly, quarterly). Benefits from rupee-cost averaging and the power of compounding.'
    },
    {
        term: 'AUM (Assets Under Management)',
        definition: 'The total market value of all the investments managed by a mutual fund at a given point in time. A larger AUM can indicate greater investor trust, but very large AUM can limit a fund\'s agility in smaller-cap strategies.'
    },
    {
        term: 'Expense Ratio (TER)',
        definition: 'The annual fee charged by a mutual fund to cover operating costs (fund management, administration, marketing). Expressed as a percentage of AUM. Lower expense ratios directly improve net returns for investors.'
    },
    {
        term: 'Exit Load',
        definition: 'A fee charged to investors when they redeem (sell) their mutual fund units before a specified period. Exists to discourage short-term trading. E.g., 1% if redeemed within 1 year of purchase.'
    },
    {
        term: 'Sharpe Ratio',
        definition: 'A risk-adjusted performance measure. Calculated as (Portfolio Return − Risk-Free Rate) ÷ Standard Deviation. A higher Sharpe Ratio means more return per unit of risk taken. A ratio above 1 is generally considered good.'
    },
    {
        term: 'Alpha',
        definition: 'The excess return of a fund compared to its benchmark index. A positive alpha means the fund manager has added value over the index; negative alpha means underperformance. E.g., Alpha of +2 means 2% extra return above benchmark.'
    },
    {
        term: 'Beta',
        definition: 'A measure of a fund\'s sensitivity to market movements relative to its benchmark. Beta of 1 means moves exactly with the market; Beta > 1 is more volatile; Beta < 1 is less volatile. Useful for assessing market risk.'
    },
    {
        term: 'Standard Deviation (Volatility)',
        definition: 'Measures how much a fund\'s returns fluctuate around its average return over a period. Higher standard deviation indicates higher volatility and risk. A stable fund with consistent returns will have lower standard deviation.'
    },
    {
        term: 'Benchmark Index',
        definition: 'A standard index (e.g., NIFTY 50, BSE Sensex, NIFTY Midcap 150) against which a fund\'s performance is measured. The fund manager aims to outperform (generate alpha over) its stated benchmark.'
    },
    {
        term: 'IDCW (Income Distribution cum Capital Withdrawal)',
        definition: 'Formerly called the "Dividend" option. In this plan, the fund periodically distributes a portion of realised gains to investors. The NAV reduces by the amount distributed. Not to be confused with a guaranteed income.'
    },
    {
        term: 'SWP (Systematic Withdrawal Plan)',
        definition: 'The opposite of SIP. Allows investors to withdraw a fixed amount from a mutual fund at regular intervals. Useful for creating a regular cash flow in retirement while keeping the remaining corpus invested.'
    },
    {
        term: 'Direct Plan',
        definition: 'A plan where investors purchase mutual fund units directly from the AMC (Asset Management Company) without involving a distributor. Has a lower expense ratio than Regular plans because no commission is paid to an intermediary.'
    },
    {
        term: 'Regular Plan',
        definition: 'A plan where mutual fund units are purchased through a distributor or intermediary. Carries a higher expense ratio than Direct plans because a commission is paid to the distributor. The NAV of Regular plans is always lower than Direct plans.'
    },
    {
        term: 'Growth Option',
        definition: 'In this option, all gains and dividends are reinvested within the fund, increasing the NAV over time. No payouts are made to the investor. Best suited for long-term wealth creation and tax efficiency (gains taxed only on redemption).'
    },
    {
        term: 'ELSS (Equity Linked Savings Scheme)',
        definition: 'A type of equity mutual fund that offers tax deductions up to ₹1.5 lakh per year under Section 80C of the Income Tax Act. Has a mandatory 3-year lock-in period — the shortest among all 80C instruments.'
    },
    {
        term: 'Debt Fund',
        definition: 'A mutual fund that primarily invests in fixed-income securities such as government bonds, corporate bonds, treasury bills, and money market instruments. Generally lower risk and lower potential return than equity funds.'
    },
    {
        term: 'Flexi Cap Fund',
        definition: 'An equity mutual fund that can invest across companies of any market capitalisation (large cap, mid cap, or small cap) without any minimum allocation constraint. The fund manager has full flexibility to allocate based on market conditions.'
    }
];

function openGlossary() {
    const modal = document.getElementById('glossaryModal');
    const panel = document.getElementById('glossaryPanel');
    const searchEl = document.getElementById('glossarySearch');

    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';

    // Trigger slide-in animation
    requestAnimationFrame(() => {
        panel.style.transform = 'translateX(0)';
    });

    // Reset and render
    if (searchEl) searchEl.value = '';
    renderGlossary(GLOSSARY_TERMS);
}

function closeGlossary() {
    const modal = document.getElementById('glossaryModal');
    const panel = document.getElementById('glossaryPanel');

    panel.style.transform = 'translateX(100%)';
    document.body.style.overflow = '';

    setTimeout(() => {
        modal.style.display = 'none';
    }, 300); // match CSS transition duration
}

function renderGlossary(terms) {
    const list = document.getElementById('glossaryList');
    if (!list) return;

    if (terms.length === 0) {
        list.innerHTML = `<div style="text-align:center; padding:40px 0; color:var(--text-muted); font-size:13px;">No terms match your search.</div>`;
        return;
    }

    list.innerHTML = terms.map((t, i) => `
        <div style="
            border-bottom: 1px solid var(--border-glass);
            padding: 18px 0;
            ${i === 0 ? 'padding-top: 8px;' : ''}
        ">
            <div style="font-size:13px; font-weight:700; color:var(--accent); margin-bottom:6px; letter-spacing:0.2px;">${escapeHtml(t.term)}</div>
            <div style="font-size:12px; color:var(--text-secondary); line-height:1.7;">${escapeHtml(t.definition)}</div>
        </div>
    `).join('');
}

function searchGlossary(query) {
    const q = query.toLowerCase().trim();
    if (!q) {
        renderGlossary(GLOSSARY_TERMS);
        return;
    }
    const filtered = GLOSSARY_TERMS.filter(t =>
        t.term.toLowerCase().includes(q) ||
        t.definition.toLowerCase().includes(q)
    );
    renderGlossary(filtered);
}

/* ── Portfolio Tab Switching ────────────────────────────────────── */
function switchPortfolioTab(tab) {
    const holdingsTab = document.getElementById('portfolioTableCard');
    const suggestionsTab = document.getElementById('suggestionsTab');
    const btnHoldings = document.getElementById('tabHoldings');
    const btnSuggestions = document.getElementById('tabSuggestions');

    if (!holdingsTab || !suggestionsTab) return;

    if (tab === 'holdings') {
        holdingsTab.style.display = 'block';
        suggestionsTab.style.display = 'none';
        if (btnHoldings) {
            btnHoldings.style.color = 'var(--accent)';
            btnHoldings.style.borderBottom = '2px solid var(--accent)';
        }
        if (btnSuggestions) {
            btnSuggestions.style.color = 'var(--text-muted)';
            btnSuggestions.style.borderBottom = '2px solid transparent';
        }
    } else {
        holdingsTab.style.display = 'none';
        suggestionsTab.style.display = 'block';
        if (btnHoldings) {
            btnHoldings.style.color = 'var(--text-muted)';
            btnHoldings.style.borderBottom = '2px solid transparent';
        }
        if (btnSuggestions) {
            btnSuggestions.style.color = 'var(--accent)';
            btnSuggestions.style.borderBottom = '2px solid var(--accent)';
        }
    }
}

// Close on Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.getElementById('glossaryModal').style.display === 'block') {
        closeGlossary();
    }
});


// ── PORTFOLIO UI TOGGLES ──────────────────────────────────────────────
window.toggleAnalyticsPanel = function (show) {
    const container = document.getElementById('portfolioContainer');
    const panel = document.getElementById('portfolioAnalyticsPanel');
    const btn = document.getElementById('btnToggleAnalytics');
    if (!container || !panel) return;

    // Determine target state
    const isCurrentlyOpen = container.classList.contains('analytics-open');
    const targetState = typeof show !== 'undefined' ? show : !isCurrentlyOpen;

    if (targetState) {
        container.classList.remove('analytics-closed');
        container.classList.add('analytics-open');
        panel.style.display = 'block';
        if (btn) btn.querySelector('span').textContent = 'Hide Details / Analytics';
    } else {
        container.classList.remove('analytics-open');
        container.classList.add('analytics-closed');
        panel.style.display = 'none'; // Explicitly hide when closed
        if (btn) btn.querySelector('span').textContent = 'Show Details / Analytics';
    }

    if (window.Chart) {
        const resizeInterval = setInterval(() => {
            Chart.instances.forEach(c => c.resize());
        }, 50);
        setTimeout(() => {
            clearInterval(resizeInterval);
            Chart.instances.forEach(c => c.resize());
        }, 450);
    }
};

/* ── Smart Portfolio Diagnosis ────────────────────────────────── */
async function runSmartPortfolioDiagnosis(holdings) {
    const listEl = document.getElementById('swapDiagnosisContent');
    if (!listEl || !holdings || holdings.length === 0) return;

    try {
        const results = [];

        for (const h of holdings) {
            try {
                const json = await fetchFundData(h.code);
                const data = prepareNavData(json.data);
                const score = getFundHealthScore(data, null);

                if (score < 40) {
                    const category = json.meta.scheme_category;
                    const replacement = await findBestReplacement(category, score);

                    if (replacement) {
                        results.push({
                            weakFund: { name: h.name, code: h.code, score },
                            strongFund: replacement
                        });
                    }
                }
            } catch (e) { console.warn("Diag item failed:", e); }
            await new Promise(r => setTimeout(r, 400));
        }

        if (results.length === 0) {
            listEl.innerHTML = `
                <div style="background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 8px; padding: 16px; font-size: 13px; color: #10b981; text-align: center;">
                    ✅ Your portfolio is healthy! No underperforming funds (Score < 40) detected.
                </div>
            `;
            return;
        }

        listEl.innerHTML = results.map(res => `
            <div class="stat-card" style="border: 1px solid rgba(239, 68, 68, 0.2); background: rgba(0,0,0,0.1); margin-bottom:12px;">
                <div style="display:flex; justify-content:space-between; margin-bottom:12px; align-items:center;">
                    <div style="font-size:11px; font-weight:700; color:#ef4444; text-transform:uppercase;">⚠️ Action Required</div>
                    <div style="font-size:10px; padding:2px 6px; background:#ef4444; color:white; border-radius:4px; font-weight:700;">Score: ${res.weakFund.score}</div>
                </div>
                <div style="font-size:13px; font-weight:700; color:var(--text-primary); margin-bottom:4px;">${escapeHtml(res.weakFund.name)}</div>
                <div style="font-size:11px; color:var(--text-muted); margin-bottom:16px;">This fund is underperforming its peers.</div>
                
                <div style="padding:12px; background:rgba(16,185,129,0.1); border-radius:6px; border:1px solid rgba(16,185,129,0.2);">
                    <div style="font-size:10px; font-weight:700; color:#10b981; text-transform:uppercase; margin-bottom:6px;">🚀 Suggested Upgrade</div>
                    <div style="font-size:12px; font-weight:700; color:var(--text-primary); margin-bottom:4px;">${escapeHtml(res.strongFund.name)}</div>
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-size:10px; color:var(--text-muted);">Momentum: +${(res.strongFund.ret30 * 100).toFixed(2)}%</span>
                        <button onclick="loadFund('${res.strongFund.code}')" style="background:var(--accent); color:white; border:none; padding:4px 10px; border-radius:4px; font-size:10px; cursor:pointer; font-weight:700;">View Fund</button>
                    </div>
                </div>
            </div>
        `).join('');

    } catch (err) {
        console.error("Diagnosis error:", err);
        listEl.innerHTML = '<div style="font-size:12px; color:var(--text-muted); text-align:center;">Diagnosis paused. Too many requests.</div>';
    }
}

async function findBestReplacement(category, weakScore) {
    if (!window.FUND_UNIVERSE) return null;
    const candidates = [];
    for (const code of window.FUND_UNIVERSE) {
        try {
            const json = await fetchFundData(code);
            if (json.meta.scheme_category === category) {
                const data = prepareNavData(json.data);
                const ret30 = calc30DayReturn(data);
                const score = getFundHealthScore(data, null);
                if (score > 60) {
                    candidates.push({ code, name: json.meta.scheme_name, ret30, score });
                }
            }
        } catch (e) { }
        if (candidates.length >= 2) break;
        await new Promise(r => setTimeout(r, 200));
    }
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => b.ret30 - a.ret30);
    return candidates[0];
}

/* ═══════════════════════════════════════════════════════════
   SMART BRIDGE NAVIGATION (RESEARCH -> ADVISOR)
   ═══════════════════════════════════════════════════════════ */
// Smart Bridge Logic moved to js/bridge.js

/* ── Boot ───────────────────────────────────────────────────────── */
(async function bootApp() {
    try {
        renderCategoryNav();
        renderWatchlist();

        // Background pre-fetches
        fetchGlobalFundList();

        // Blocking fetch for categories so the UI doesn't render empty
        const catLoadLabel = document.getElementById('tableSubtitle');
        if (catLoadLabel) catLoadLabel.textContent = "Loading live categories from AMFI...";

        try {
            await fetchLiveAmfiCategories();
        } catch (catErr) {
            console.error("Critical: AMFI Category load failed:", catErr);
            if (catLoadLabel) catLoadLabel.textContent = "Offline Mode: Using cached data.";
            // Fallback: window.LIVE_FUNDS should ideally have default structure
        }

        showState('welcome');
        renderCategoryNav();

        // Auto-load top performers for default category
        try {
            await loadTopPerformers('Equity Funds', topFundsHorizon);
        } catch (tpErr) {
            console.warn("Top Performers load failed:", tpErr);
        }

        // Run Robo Momentum Scanner
        runMomentumScanner();
    } catch (bootErr) {
        console.error("FATAL: bootApp crashed:", bootErr);
        // Attempt to unblock the UI if possible
        const loading = document.getElementById('loadingState');
        if (loading) loading.style.display = 'none';
        const welcome = document.getElementById('welcomeState');
        if (welcome) welcome.style.display = 'block';
    }
})();
