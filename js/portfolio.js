/* ── Automation Rules (localStorage) ────────────────────── */
const AUTOMATION_RULES_KEY = 'mf_automation_rules';

const AUTOMATION_RULES_DEFAULTS = {
    // Legacy thresholds (still used by stop-loss / take-profit rules)
    stopLoss: -5,
    takeProfit: 15,
    // New rules
    enableDriftAlert: true,
    targetEquity: 70,
    enablePeerAlert: true,
    peerTolerance: 2,
    enableMarketTimingAlert: true,
    marketDropThreshold: 10,
    enableTaxHarvestAlert: true
};

function loadAutomationRules() {
    try {
        const stored = JSON.parse(localStorage.getItem(AUTOMATION_RULES_KEY));
        return Object.assign({}, AUTOMATION_RULES_DEFAULTS, stored || {});
    } catch (e) {
        return { ...AUTOMATION_RULES_DEFAULTS };
    }
}

function saveAutomationRules() {
    const rules = {
        stopLoss: parseFloat(document.getElementById('alertStopLoss').value) || -5,
        takeProfit: parseFloat(document.getElementById('alertTakeProfit').value) || 15,
        enableDriftAlert: document.getElementById('ruleEnableDrift').checked,
        targetEquity: parseFloat(document.getElementById('ruleTargetEquity').value) || 70,
        enablePeerAlert: document.getElementById('ruleEnablePeer').checked,
        peerTolerance: parseFloat(document.getElementById('rulePeerTolerance').value) || 2,
        enableMarketTimingAlert: document.getElementById('ruleEnableMarket').checked,
        marketDropThreshold: parseFloat(document.getElementById('ruleMarketDrop').value) || 10,
        enableTaxHarvestAlert: document.getElementById('ruleEnableTax').checked
    };
    localStorage.setItem(AUTOMATION_RULES_KEY, JSON.stringify(rules));
    showToast('Automation rules saved ✓', 'success');
    closeAutomationModal();
}

/** Backward-compat shim so old code calling loadAlertSettings() still works */
function loadAlertSettings() { return loadAutomationRules(); }
function saveAlertSettings(s) {
    const rules = loadAutomationRules();
    localStorage.setItem(AUTOMATION_RULES_KEY, JSON.stringify({ ...rules, ...s }));
    showToast('Settings saved ✓', 'success');
}

/* ── Automation Modal ────────────────────────────────────── */
function openAutomationModal() {
    const rules = loadAutomationRules();
    // Populate all fields from stored rules
    document.getElementById('alertStopLoss').value = rules.stopLoss;
    document.getElementById('alertTakeProfit').value = rules.takeProfit;
    document.getElementById('ruleEnableDrift').checked = rules.enableDriftAlert;
    document.getElementById('ruleTargetEquity').value = rules.targetEquity;
    document.getElementById('ruleEnablePeer').checked = rules.enablePeerAlert;
    document.getElementById('rulePeerTolerance').value = rules.peerTolerance;
    document.getElementById('ruleEnableMarket').checked = rules.enableMarketTimingAlert;
    document.getElementById('ruleMarketDrop').value = rules.marketDropThreshold;
    document.getElementById('ruleEnableTax').checked = rules.enableTaxHarvestAlert;

    const modal = document.getElementById('automationSettingsModal');
    modal.style.display = 'flex';
    setTimeout(() => document.getElementById('automationModalCard').style.transform = 'scale(1)', 10);
}

function closeAutomationModal() {
    const card = document.getElementById('automationModalCard');
    if (card) card.style.transform = 'scale(0.95)';
    setTimeout(() => {
        const modal = document.getElementById('automationSettingsModal');
        if (modal) modal.style.display = 'none';
    }, 200);
}



/* ── Portfolio Transaction Modal ────────────────────────────────── */
let pfModalSelectedCode = null;
let pfModalSelectedName = null;
let pfFundSearchDebounceTimer = null;

function openPortfolioTxnModal() {
    if (!currentUser) { showToast('Please sign in to track your portfolio.', 'error'); return; }
    pfModalSelectedCode = null;
    pfModalSelectedName = null;
    const modal = document.getElementById('portfolioTxnModal');
    modal.style.display = 'flex';
    setTimeout(() => modal.querySelector('.pf-modal-card').style.transform = 'scale(1)', 10);

    const searchInput = document.getElementById('pfFundSearch');
    searchInput.value = '';
    searchInput.placeholder = 'Type fund name or scheme code…';
    document.getElementById('pfFundResults').innerHTML = '';
    document.getElementById('pfTxnAmount').value = '';
    document.getElementById('pfTxnNav').value = '';
    document.getElementById('pfTxnUnits').value = '';
    document.getElementById('pfTxnDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('pfTxnType').value = 'buy';
    document.getElementById('pfSipStatus').value = 'active';
    document.getElementById('pfLastSipDate').value = '';
    document.getElementById('pfSelectedFundLabel').textContent = 'No fund selected';
    // Reset step-up state
    document.getElementById('pfStepUpNo').checked = true;
    document.getElementById('pfStepUpFieldsRow').style.display = 'none';
    document.getElementById('pfStepUpAmount').value = '';
    document.getElementById('pfStepUpFrequency').value = 'annually';

    // Reset dynamic UI to Lump Sum state
    onTxnTypeChange();

    // Eagerly load the global fund list if not already fetched
    if (!window.allMfFunds || window.allMfFunds.length === 0) {
        searchInput.placeholder = 'Loading fund list… please wait';
        fetchGlobalFundList().then(() => {
            searchInput.placeholder = 'Type fund name or scheme code…';
        }).catch(() => {
            searchInput.placeholder = 'Type fund name or scheme code…';
        });
    }
}

/* ── UI State Machine ────────────────────────────────────────────── */
function onTxnTypeChange() {
    const type = document.getElementById('pfTxnType').value;
    const isSip = type === 'sip';

    // SIP-specific rows
    document.getElementById('pfSipStatusRow').style.display = isSip ? 'block' : 'none';
    document.getElementById('pfSipPreviewRow').style.display = isSip ? 'block' : 'none';
    document.getElementById('pfStepUpToggleRow').style.display = isSip ? 'block' : 'none';

    // NAV + Units only shown for Lump Sum / Sell
    document.getElementById('pfNavUnitsRow').style.display = isSip ? 'none' : 'grid';

    // Dynamic labels
    document.getElementById('pfAmountLabel').textContent =
        isSip ? 'Monthly SIP Amount (₹)' : 'Amount Invested (₹)';
    document.getElementById('pfDateLabel').textContent =
        isSip ? 'SIP Start Date' : (type === 'sell' ? 'Sell Date' : 'Transaction Date');

    // Reset SIP sub-fields whenever type changes
    document.getElementById('pfLastSipDateRow').style.display = 'none';
    document.getElementById('pfStepUpFieldsRow').style.display = 'none';
    document.getElementById('pfSipStatus').value = 'active';
    document.getElementById('pfStepUpNo').checked = true;
    document.getElementById('pfStepUpAmount').value = '';
    document.getElementById('pfStepUpFrequency').value = 'annually';
}

function onSipStatusChange() {
    const status = document.getElementById('pfSipStatus').value;
    document.getElementById('pfLastSipDateRow').style.display = status === 'paused' ? 'block' : 'none';
}

function onStepUpToggleChange() {
    const isYes = document.getElementById('pfStepUpYes').checked;
    document.getElementById('pfStepUpFieldsRow').style.display = isYes ? 'block' : 'none';
    if (!isYes) {
        document.getElementById('pfStepUpAmount').value = '';
        document.getElementById('pfStepUpFrequency').value = 'annually';
    }
}

function closePortfolioTxnModal() {
    const modal = document.getElementById('portfolioTxnModal');
    modal.querySelector('.pf-modal-card').style.transform = 'scale(0.95)';
    setTimeout(() => modal.style.display = 'none', 200);
}

function handlePfFundSearch() {
    clearTimeout(pfFundSearchDebounceTimer);
    const query = document.getElementById('pfFundSearch').value.trim().toLowerCase();
    const resultsEl = document.getElementById('pfFundResults');
    if (query.length < 2) { resultsEl.innerHTML = ''; return; }

    // If fund list still loading, show a hint and retry shortly
    if (!window.allMfFunds || window.allMfFunds.length === 0) {
        resultsEl.innerHTML = '<li style="padding:10px 14px;color:var(--text-muted);font-size:13px;">⏳ Loading fund list, please try again in a moment…</li>';
        pfFundSearchDebounceTimer = setTimeout(() => {
            const allFunds = window.allMfFunds || [];
            // Filter to Direct Growth funds only (same pool as main search)
            const pool = allFunds.filter(f => {
                const n = f.schemeName.toUpperCase();
                return n.includes('DIRECT') && n.includes('GROWTH') &&
                    !n.includes('IDCW') && !n.includes('DIVIDEND');
            });

            const matches = pool.filter(f =>
                f.schemeName.toLowerCase().includes(query) ||
                String(f.schemeCode).includes(query)
            ).slice(0, 8);

            if (matches.length === 0) {
                resultsEl.innerHTML = '<li style="padding:10px 14px;color:var(--text-muted);font-size:13px;">No funds found</li>';
                return;
            }
            resultsEl.innerHTML = matches.map(f => {
                const display = formatFundName(f.schemeName);
                const safeCode = f.schemeCode;
                return `<li style="padding:10px 14px;cursor:pointer;font-size:13px;color:var(--text-primary);border-bottom:1px solid var(--border-glass);transition:background 0.15s;"
                    onmouseover="this.style.background='rgba(56,189,248,0.08)'"
                    onmouseout="this.style.background=''"
                    onmousedown="selectPfFund('${safeCode}', '${display.replace(/'/g, "\\'").replace(/"/g, '&quot;')}')">
                    <div style="font-weight:500;">${display}</div>
                    <div style="font-size:11px;color:var(--text-muted);">Code: ${safeCode}</div>
                </li>`;
            }).join('');
        }, 280);
        return;
    }

    pfFundSearchDebounceTimer = setTimeout(() => {
        const allFunds = window.allMfFunds || [];
        // Filter to Direct Growth funds only (same pool as main search)
        const pool = allFunds.filter(f => {
            const n = f.schemeName.toUpperCase();
            return n.includes('DIRECT') && n.includes('GROWTH') &&
                !n.includes('IDCW') && !n.includes('DIVIDEND');
        });

        const matches = pool.filter(f =>
            f.schemeName.toLowerCase().includes(query) ||
            String(f.schemeCode).includes(query)
        ).slice(0, 8);

        if (matches.length === 0) {
            resultsEl.innerHTML = '<li style="padding:10px 14px;color:var(--text-muted);font-size:13px;">No funds found</li>';
            return;
        }
        resultsEl.innerHTML = matches.map(f => {
            const display = formatFundName(f.schemeName);
            const safeCode = f.schemeCode;
            return `<li style="padding:10px 14px;cursor:pointer;font-size:13px;color:var(--text-primary);border-bottom:1px solid var(--border-glass);transition:background 0.15s;"
                onmouseover="this.style.background='rgba(56,189,248,0.08)'"
                onmouseout="this.style.background=''"
                onmousedown="selectPfFund('${safeCode}', '${display.replace(/'/g, "\\'").replace(/"/g, '&quot;')}')"><div style="font-weight:500;">${display}</div><div style="font-size:11px;color:var(--text-muted);">Code: ${safeCode}</div></li>`;
        }).join('');
    }, 280);
}

function selectPfFund(code, name) {
    pfModalSelectedCode = String(code);
    pfModalSelectedName = name;
    document.getElementById('pfFundSearch').value = name;
    document.getElementById('pfSelectedFundLabel').textContent = `Selected: ${name}`;
    document.getElementById('pfFundResults').innerHTML = '';
    // Auto-fetch NAV for today's date
    autofetchPfNav();
}

async function autofetchPfNav() {
    if (!pfModalSelectedCode) return;
    const dateStr = document.getElementById('pfTxnDate').value;
    if (!dateStr) return;

    const navInput = document.getElementById('pfTxnNav');
    navInput.placeholder = 'Fetching NAV…';
    navInput.value = '';

    try {
        const res = await fetch(`https://api.mfapi.in/mf/${pfModalSelectedCode}`);
        const data = await res.json();
        if (data && data.data && data.data.length > 0) {
            // Find the NAV closest to but not after the selected date
            const targetDate = new Date(dateStr);
            let bestNav = null;
            for (const entry of data.data) {
                const parts = entry.date.split('-');
                const entryDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
                if (entryDate <= targetDate) { bestNav = entry.nav; break; }
            }
            navInput.value = bestNav ? parseFloat(bestNav).toFixed(4) : '';
            navInput.placeholder = 'NAV at purchase date';
            recomputePfUnits();
        }
    } catch (e) {
        navInput.placeholder = 'Enter NAV manually';
    }
}

function recomputePfUnits() {
    const amount = parseFloat(document.getElementById('pfTxnAmount').value);
    const nav = parseFloat(document.getElementById('pfTxnNav').value);
    if (!isNaN(amount) && !isNaN(nav) && nav > 0) {
        document.getElementById('pfTxnUnits').value = (amount / nav).toFixed(4);
    }
}

async function saveNewTransaction() {
    if (!pfModalSelectedCode) { showToast('Please search and select a fund first.', 'error'); return; }

    const type = document.getElementById('pfTxnType').value;
    const amount = parseFloat(document.getElementById('pfTxnAmount').value);
    const dateStr = document.getElementById('pfTxnDate').value;

    if (!dateStr || isNaN(amount) || amount <= 0) {
        showToast('Please fill Amount and Date correctly.', 'error'); return;
    }

    const btn = document.getElementById('pfSaveTxnBtn');
    btn.disabled = true;

    /* ── SIP Config path ────────────────────────────────────────── */
    if (type === 'sip') {
        const sipStatus = document.getElementById('pfSipStatus').value;   // 'active' | 'paused'
        const lastSipDate = sipStatus === 'paused'
            ? document.getElementById('pfLastSipDate').value
            : null;

        if (sipStatus === 'paused' && !lastSipDate) {
            showToast('Please enter the Last SIP Date for a paused SIP.', 'error');
            btn.disabled = false; return;
        }

        // ── Read step-up config from form ────────────────────────────
        const isStepUp = document.getElementById('pfStepUpYes').checked;
        const stepUpAmount = isStepUp ? parseFloat(document.getElementById('pfStepUpAmount').value) || 0 : 0;
        const stepUpFrequency = isStepUp ? document.getElementById('pfStepUpFrequency').value : 'annually';

        if (isStepUp) {
            if (!stepUpAmount || stepUpAmount <= 0) {
                showToast('Please enter a valid Step-Up Amount.', 'error');
                btn.disabled = false; return;
            }
        }

        const stepUpConfig = { isStepUp, stepUpAmount, stepUpFrequency };

        btn.textContent = '⏳ Simulating SIP history…';

        try {
            // Validate the ledger can be generated before saving
            await generateSipLedger(
                pfModalSelectedCode,
                amount,
                dateStr,
                lastSipDate || null,
                stepUpConfig
            );

            // Save compact config with step-up fields
            await addTransaction({
                type: 'sip_config',
                schemeCode: pfModalSelectedCode,
                schemeName: pfModalSelectedName,
                amount,                          // base monthly amount
                startDate: dateStr,
                sipStatus,                       // 'active' | 'paused'
                endDate: lastSipDate || null,
                isStepUp,
                stepUpAmount,
                stepUpFrequency
            });

            showToast('SIP added to portfolio ✓', 'success');
            closePortfolioTxnModal();
            loadPortfolioView();
        } catch (err) {
            console.error('Save SIP error:', err);
            showToast('Failed to save SIP: ' + err.message, 'error');
        } finally {
            btn.textContent = 'Save Transaction'; btn.disabled = false;
        }
        return;
    }


    /* ── Lump Sum / Sell path ───────────────────────────────────── */
    const nav = parseFloat(document.getElementById('pfTxnNav').value);
    const units = parseFloat(document.getElementById('pfTxnUnits').value);

    if (isNaN(nav) || nav <= 0 || isNaN(units) || units <= 0) {
        showToast('NAV and Units are required. Fetch or enter NAV manually.', 'error');
        btn.disabled = false; return;
    }

    btn.textContent = 'Saving…';

    try {
        await addTransaction({
            type,
            schemeCode: pfModalSelectedCode,
            schemeName: pfModalSelectedName,
            amount,
            units,
            navAtDate: nav,
            date: dateStr
        });
        showToast('Transaction added to portfolio ✓', 'success');
        closePortfolioTxnModal();
        loadPortfolioView();
    } catch (err) {
        console.error('Save Txn error:', err);
        showToast('Failed to save transaction.', 'error');
    } finally {
        btn.textContent = 'Save Transaction'; btn.disabled = false;
    }
}


/* ── XIRR Engine ────────────────────────────────────────────────── */
/**
 * Computes XIRR via Newton-Raphson iteration.
 * @param {Array<{date: Date, amount: number}>} cashFlows  negative = outflow (investments), positive = inflow (current value)
 * @returns {number} XIRR as a decimal (e.g. 0.12 = 12%)
 */
function computeXIRR(cashFlows, guess = 0.1) {
    const MAX_ITER = 100;
    const TOLERANCE = 1e-6;
    const refDate = cashFlows[0].date;

    function npv(rate) {
        return cashFlows.reduce((sum, cf) => {
            const t = (cf.date - refDate) / (365.25 * 24 * 60 * 60 * 1000);
            return sum + cf.amount / Math.pow(1 + rate, t);
        }, 0);
    }

    function dnpv(rate) {
        return cashFlows.reduce((sum, cf) => {
            const t = (cf.date - refDate) / (365.25 * 24 * 60 * 60 * 1000);
            return sum - t * cf.amount / Math.pow(1 + rate, t + 1);
        }, 0);
    }

    let rate = guess;
    for (let i = 0; i < MAX_ITER; i++) {
        const f = npv(rate);
        const df = dnpv(rate);
        if (Math.abs(df) < 1e-12) break;
        const newRate = rate - f / df;
        if (Math.abs(newRate - rate) < TOLERANCE) return newRate;
        rate = newRate;
        if (rate < -0.999) rate = -0.999; // guard against blow-up
    }
    return rate;
}

/**
 * Builds cash flow arrays from transactions and final portfolio value.
 */
function buildCashFlows(txns, totalCurrentValue) {
    const flows = txns
        .filter(t => t.type === 'buy' || t.type === 'sip')
        .map(t => ({
            date: t.date && t.date.toDate ? t.date.toDate() : new Date(t.date),
            amount: -Math.abs(t.amount)   // outflow = negative
        }))
        .sort((a, b) => a.date - b.date);

    if (flows.length === 0) return null;

    // Terminal value = today
    flows.push({ date: new Date(), amount: totalCurrentValue });
    return flows;
}

/* ── Asset Allocation Donut Chart ────────────────────────────── */
let _allocationChart = null;

function renderAllocationDonut(equityPct, debtPct, cashPct) {
    const canvas = document.getElementById('allocationDonut');
    const analyticsRow = document.getElementById('portfolioAnalyticsRow');
    if (!canvas) return;

    // Show the analytics row as a 3-column grid
    if (analyticsRow) analyticsRow.style.display = 'grid';

    // Sanitize inputs — guard against NaN / Infinity
    const safeEq = isFinite(equityPct) ? Math.max(0, Math.round(equityPct * 10) / 10) : 0;
    const safeDt = isFinite(debtPct) ? Math.max(0, Math.round(debtPct * 10) / 10) : 0;
    const safeCsh = isFinite(cashPct) ? Math.max(0, Math.round(cashPct * 10) / 10) : 0;

    // Ensure at least a tiny segment so the donut always renders
    const total = safeEq + safeDt + safeCsh;
    const data = total > 0 ? [safeEq, safeDt, safeCsh] : [100, 0, 0];
    const labels = ['Equity', 'Debt', 'Cash/Others'];
    const colors = ['#6366f1', '#10b981', '#f59e0b'];
    const displayData = total > 0 ? [safeEq, safeDt, safeCsh] : ['—', '—', '—'];

    if (_allocationChart) {
        _allocationChart.data.datasets[0].data = data;
        _allocationChart.update();
    } else {
        _allocationChart = new Chart(canvas, {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{
                    data,
                    backgroundColor: colors,
                    borderWidth: 2,
                    borderColor: 'rgba(0,0,0,0.2)',
                    hoverOffset: 6
                }]
            },
            options: {
                cutout: '72%',
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: ctx => ` ${ctx.label}: ${ctx.parsed.toFixed(1)}%`
                        }
                    }
                },
                animation: { duration: 600 }
            }
        });
    }

    // Custom legend with clean numbers
    const legend = document.getElementById('allocationLegend');
    if (legend) {
        legend.innerHTML = labels.map((l, i) => `
            <span style="display:flex;align-items:center;gap:4px;">
                <span style="width:9px;height:9px;border-radius:50%;background:${colors[i]};display:inline-block;"></span>
                ${l} ${typeof displayData[i] === 'number' ? displayData[i] + '%' : displayData[i]}
            </span>`).join('');
    }
}

/* ── Insights & Alerts Engine ───────────────────────────────────── */
/**
 * Rule A: Asset Drift   (enableDriftAlert)
 * Rule B: Market Timing (enableMarketTimingAlert) — UTI Nifty 50 52-week drop
 * Rule C: Tax Harvest   (enableTaxHarvestAlert)   — LTCG holdings with unrealised loss
 * Rule D: Peer Lag      (enablePeerAlert)          — now uses rules.peerTolerance
 * Rule E: Stop-Loss / Take-Profit (always active)
 */
async function runInsightAlerts(holdings, alertSettings, analyticsData = {}) {
    const alerts = [];
    const master = window.allMfFunds || [];
    const rules = loadAutomationRules(); // always read from localStorage

    // ── Rule A: Asset Drift ──────────────────────────────────────
    if (rules.enableDriftAlert) {
        const actualEquity = analyticsData.portfolioEquityPct;
        if (typeof actualEquity === 'number' && isFinite(actualEquity)) {
            const drift = Math.abs(actualEquity - rules.targetEquity);
            if (drift > 5) {
                const direction = actualEquity > rules.targetEquity ? 'overweight' : 'underweight';
                alerts.push({
                    type: 'asset_drift',
                    severity: 'warning',
                    icon: '⚖️',
                    title: `Asset Allocation Drift`,
                    message: `Your equity exposure is <strong>${actualEquity.toFixed(1)}%</strong> — ${drift.toFixed(1)}% ${direction} vs your target of <strong>${rules.targetEquity}%</strong>. Consider rebalancing.`
                });
            }
        }
    }

    // ── Rule B: Market Timing ────────────────────────────────────
    if (rules.enableMarketTimingAlert) {
        try {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), 4000);
            // UTI Nifty 50 Index Fund Direct Growth (scheme 120716)
            const res = await fetch('https://api.mfapi.in/mf/120716', { signal: ctrl.signal });
            clearTimeout(t);
            if (res.ok) {
                const data = await res.json();
                const navs = (data.data || []).slice(0, 365).map(d => parseFloat(d.nav)).filter(n => isFinite(n));
                if (navs.length >= 2) {
                    const currentNav = navs[0];
                    const peakNav = Math.max(...navs);
                    const dropPct = ((peakNav - currentNav) / peakNav) * 100;
                    if (dropPct >= rules.marketDropThreshold) {
                        alerts.push({
                            type: 'market_timing',
                            severity: 'info',
                            icon: '📉',
                            title: `Market Dip Opportunity`,
                            message: `Nifty 50 is <strong>${dropPct.toFixed(1)}%</strong> below its 52-week peak of <strong>₹${peakNav.toFixed(0)}</strong>. Consider deploying idle capital to take advantage of lower NAVs.`
                        });
                    }
                }
            }
        } catch (_) { /* network error or timeout — skip silently */ }
    }

    // ── Rule C: Tax Loss Harvest ─────────────────────────────────
    if (rules.enableTaxHarvestAlert) {
        const harvestable = [];
        for (const h of Object.values(holdings)) {
            if (!h.taxBuckets || !h.currentNav) continue;
            const ltcgUnits = h.taxBuckets.LTCG.units;
            const ltcgCost = h.taxBuckets.LTCG.cost;
            if (ltcgUnits > 0) {
                const ltcgCurrentValue = ltcgUnits * h.currentNav;
                if (ltcgCurrentValue < ltcgCost) {
                    const loss = ltcgCost - ltcgCurrentValue;
                    harvestable.push({ name: h.name, loss });
                }
            }
        }
        if (harvestable.length > 0) {
            const list = harvestable.map(f =>
                `<em>${f.name}</em> (₹${f.loss.toLocaleString('en-IN', { maximumFractionDigits: 0 })} unrealised loss)`
            ).join(', ');
            alerts.push({
                type: 'tax_harvest',
                severity: 'info',
                icon: '🏦',
                title: `Tax Loss Harvesting Opportunity`,
                message: `The following LTCG holdings have unrealised losses you could harvest to offset gains: ${list}.`
            });
        }
    }

    // ── Rule D & E: Per-holding rules ────────────────────────────
    for (const h of Object.values(holdings)) {
        const absReturnPct = h.totalInvested > 0
            ? ((h.currentValue - h.totalInvested) / h.totalInvested) * 100
            : 0;

        // E — Stop-Loss
        if (absReturnPct <= alertSettings.stopLoss) {
            alerts.push({
                type: 'stop_loss',
                severity: 'danger',
                icon: '🔴',
                title: `Stop-Loss Triggered: ${h.name}`,
                message: `Return of <strong>${absReturnPct.toFixed(2)}%</strong> is below your stop-loss threshold of <strong>${alertSettings.stopLoss}%</strong>.`
            });
        }
        // E — Take-Profit
        if (absReturnPct >= alertSettings.takeProfit) {
            alerts.push({
                type: 'take_profit',
                severity: 'success',
                icon: '🟢',
                title: `Take-Profit Target Hit: ${h.name}`,
                message: `Return of <strong>${absReturnPct.toFixed(2)}%</strong> has reached your take-profit target of <strong>${alertSettings.takeProfit}%</strong>. Consider reviewing your position.`
            });
        }

        // D — Peer Underperformance (now reads peerTolerance from automation rules)
        if (rules.enablePeerAlert) {
            const fundMeta = master.find(f => String(f.schemeCode) === String(h.code));
            if (fundMeta && fundMeta.category) {
                const category = fundMeta.category;
                const peers = master.filter(f => f.category === category && f.returns1Y != null);
                if (peers.length > 1) {
                    const topPeer = peers.reduce((best, f) =>
                        (f.returns1Y > (best.returns1Y || -Infinity)) ? f : best, peers[0]);
                    const myReturn1Y = fundMeta.returns1Y || 0;
                    const gap = topPeer.returns1Y - myReturn1Y;
                    if (gap > rules.peerTolerance) {
                        alerts.push({
                            type: 'peer_lag',
                            severity: 'warning',
                            icon: '📊',
                            title: `Peer Underperformance: ${h.name}`,
                            message: `Your fund's 1Y return (<strong>${myReturn1Y.toFixed(2)}%</strong>) lags the top peer <em>${topPeer.schemeName}</em> (<strong>${topPeer.returns1Y.toFixed(2)}%</strong>) by <strong>${gap.toFixed(2)}%</strong>.`
                        });
                    }
                }
            }
        }
    }

    return alerts;
}

/* Severity order for grouping */
const SEVERITY_ORDER = ['danger', 'warning', 'info', 'success'];
const SEVERITY_META = {
    danger: { bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.3)', label: '🚨 Action Required' },
    warning: { bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.3)', label: '⚠️ Needs Attention' },
    info: { bg: 'rgba(56,189,248,0.1)', border: 'rgba(56,189,248,0.3)', label: '💡 Opportunities' },
    success: { bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.3)', label: '✅ Good News' }
};

function renderInsightAlerts(alerts) {
    const panel = document.getElementById('portfolioInsightsPanel');
    const badge = document.getElementById('alertsBadge');
    if (!panel) return;

    if (alerts.length === 0) {
        panel.innerHTML = `<div style="text-align:center;padding:24px;color:var(--text-muted);font-size:13px;">
            ✅ No alerts at this time. Your portfolio is on track with the configured thresholds.
        </div>`;
        if (badge) badge.style.display = 'none';
        return;
    }

    if (badge) { badge.textContent = alerts.length; badge.style.display = 'inline-flex'; }

    // Group by severity
    const grouped = {};
    SEVERITY_ORDER.forEach(s => { grouped[s] = []; });
    alerts.forEach(a => { if (grouped[a.severity]) grouped[a.severity].push(a); });

    let html = '';
    SEVERITY_ORDER.forEach(sev => {
        const group = grouped[sev];
        if (group.length === 0) return;
        const meta = SEVERITY_META[sev];
        html += `<div style="margin-bottom:14px;">
            <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">${meta.label}</div>`;
        group.forEach(a => {
            html += `<div style="
                display:flex;gap:14px;align-items:flex-start;
                padding:14px 16px;border-radius:var(--radius);
                background:${meta.bg};
                border:1px solid ${meta.border};
                margin-bottom:8px;">
                <div style="font-size:20px;flex-shrink:0;">${a.icon}</div>
                <div>
                    <div style="font-weight:600;font-size:13px;color:var(--text-primary);margin-bottom:4px;">${a.title}</div>
                    <div style="font-size:12px;color:var(--text-secondary);line-height:1.5;">${a.message}</div>
                </div>
            </div>`;
        });
        html += '</div>';
    });

    panel.innerHTML = html;
}


/* ── Transaction History Renderer ───────────────────────────────── */
function renderTransactionHistory(txns) {
    const container = document.getElementById('txnHistoryBody');
    if (!container) return;

    if (txns.length === 0) {
        container.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:20px;">No transactions yet.</td></tr>';
        return;
    }

    container.innerHTML = txns.map(t => {
        const date = t.date && t.date.toDate ? t.date.toDate() : new Date(t.date);
        const dateStr = date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        const typeBadge = t.type === 'buy' ? '🟢 Buy' : t.type === 'sell' ? '🔴 Sell' : '🔵 SIP';
        return `<tr>
            <td style="font-size:12px;color:var(--text-muted);">${dateStr}</td>
            <td style="font-size:12px;">${typeBadge}</td>
            <td style="font-size:12px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${t.schemeName}">${t.schemeName}</td>
            <td style="font-size:12px;">₹${Number(t.amount).toLocaleString('en-IN')}</td>
            <td style="font-size:12px;">${Number(t.units).toFixed(4)}</td>
            <td style="text-align:right;">
                <button onclick="deleteTxnAndRefresh('${t.id}')"
                    style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);color:#ef4444;padding:4px 10px;border-radius:6px;font-size:11px;cursor:pointer;">
                    ✕ Delete
                </button>
            </td>
        </tr>`;
    }).join('');
}

async function deleteTxnAndRefresh(txnId) {
    if (!confirm('Delete this transaction?')) return;
    try {
        await deleteTransaction(txnId);
        showToast('Transaction deleted.', 'success');
        loadPortfolioView();
    } catch (e) {
        showToast('Failed to delete transaction.', 'error');
    }
}

/* ── Expose to global scope ─────────────────────────────────────── */
window.openPortfolioTxnModal = openPortfolioTxnModal;
window.closePortfolioTxnModal = closePortfolioTxnModal;
window.onTxnTypeChange = onTxnTypeChange;
window.onSipStatusChange = onSipStatusChange;
window.onStepUpToggleChange = onStepUpToggleChange;
window.handlePfFundSearch = handlePfFundSearch;
window.selectPfFund = selectPfFund;
window.autofetchPfNav = autofetchPfNav;
window.recomputePfUnits = recomputePfUnits;
window.saveNewTransaction = saveNewTransaction;
window.deleteTxnAndRefresh = deleteTxnAndRefresh;
window.loadAlertSettings = loadAlertSettings;
window.saveAlertSettings = saveAlertSettings;
window.loadAutomationRules = loadAutomationRules;
window.saveAutomationRules = saveAutomationRules;
window.openAutomationModal = openAutomationModal;
window.closeAutomationModal = closeAutomationModal;
window.computeXIRR = computeXIRR;
window.buildCashFlows = buildCashFlows;
window.runInsightAlerts = runInsightAlerts;
window.renderInsightAlerts = renderInsightAlerts;
window.renderTransactionHistory = renderTransactionHistory;
window.renderAllocationDonut = renderAllocationDonut;

