/* ═══════════════════════════════════════════════════════════════════
   utils.js — Pure math helpers and string utilities
   No DOM access. No fetch calls. Safe to use anywhere.
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Parse the API date format "dd-mm-yyyy" → JS Date
 */
function parseDate(str) {
    const [d, m, y] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
}

/**
 * Prepare the raw data array from the API:
 *  - Sort oldest → newest
 *  - Parse NAV as float
 */
function prepareNavData(rawData) {
    return rawData
        .map(d => ({
            date: parseDate(d.date),
            nav: parseFloat(d.nav)
        }))
        .filter(d => !isNaN(d.nav) && d.nav > 0)
        .sort((a, b) => a.date - b.date);
}

/**
 * CAGR = (endNAV / startNAV) ^ (1 / years) - 1
 */
function calcCAGR(startNAV, endNAV, startDate, endDate) {
    const diffMs = endDate - startDate;
    const years = diffMs / (365.25 * 24 * 60 * 60 * 1000);
    if (years <= 0 || startNAV <= 0) return null;
    return Math.pow(endNAV / startNAV, 1 / years) - 1;
}

/**
 * Get CAGR for a specific lookback period (in years).
 * Pass null for "max" (full data range).
 */
function getCAGR(data, yearsBack) {
    if (data.length < 2) return null;

    const endEntry = data[data.length - 1];

    if (yearsBack === null) {
        const startEntry = data[0];
        return calcCAGR(startEntry.nav, endEntry.nav, startEntry.date, endEntry.date);
    }

    const cutoff = new Date(endEntry.date);
    cutoff.setFullYear(cutoff.getFullYear() - yearsBack);

    let startEntry = null;
    for (let i = 0; i < data.length; i++) {
        if (data[i].date >= cutoff) { startEntry = data[i]; break; }
    }

    if (!startEntry || startEntry === endEntry) return null;
    return calcCAGR(startEntry.nav, endEntry.nav, startEntry.date, endEntry.date);
}

/**
 * Get CAGR for exactly N years back from latest data point.
 */
function getCagrForYears(data, years) {
    if (data.length < 252 * years) return null;
    const latestDate = data[data.length - 1].date;
    const targetDate = new Date(latestDate);
    targetDate.setFullYear(latestDate.getFullYear() - years);

    let pastData = data[0];
    for (let i = data.length - 1; i >= 0; i--) {
        if (data[i].date <= targetDate) { pastData = data[i]; break; }
    }
    return calcCAGR(pastData.nav, data[data.length - 1].nav, pastData.date, data[data.length - 1].date);
}

/**
 * Annualised Standard Deviation of daily log-returns.
 * σ_annual = σ_daily × √252
 */
function calcVolatility(data) {
    if (data.length < 30) return null;

    const logReturns = [];
    for (let i = 1; i < data.length; i++) {
        if (data[i - 1].nav > 0 && data[i].nav > 0) {
            logReturns.push(Math.log(data[i].nav / data[i - 1].nav));
        }
    }

    if (logReturns.length < 2) return null;

    const mean = logReturns.reduce((s, v) => s + v, 0) / logReturns.length;
    const variance = logReturns.reduce((s, v) => s + (v - mean) ** 2, 0) / (logReturns.length - 1);
    const dailyStd = Math.sqrt(variance);
    return dailyStd * Math.sqrt(252);
}

/**
 * Sharpe Ratio = (CAGR - RiskFreeRate) / Volatility
 * Risk-free rate ≈ 6.5% (approximate Indian T-bill rate)
 */
function calcSharpe(cagr, volatility) {
    const RISK_FREE = 0.065;
    if (volatility === null || volatility === 0) return null;
    return (cagr - RISK_FREE) / volatility;
}

/**
 * XIRR Calculation using Newton-Raphson method
 * Cashflows: [{ amount: -5000, date: Date }, { amount: 15000, date: Date }]
 */
function calcXIRR(cashflows) {
    if (!cashflows || cashflows.length < 2) return null;

    const xnpv = (rate, cfs) => {
        let pv = 0;
        const d0 = cfs[0].date.getTime();
        for (let i = 0; i < cfs.length; i++) {
            const t = (cfs[i].date.getTime() - d0) / (1000 * 3600 * 24 * 365);
            pv += cfs[i].amount / Math.pow(1 + rate, t);
        }
        return pv;
    };

    const xnpvPrime = (rate, cfs) => {
        let pvPrime = 0;
        const d0 = cfs[0].date.getTime();
        for (let i = 0; i < cfs.length; i++) {
            const t = (cfs[i].date.getTime() - d0) / (1000 * 3600 * 24 * 365);
            pvPrime -= (t * cfs[i].amount) / Math.pow(1 + rate, t + 1);
        }
        return pvPrime;
    };

    let rate = 0.1;
    let iteration = 0;
    let err = 1e+100;

    while (err > 0.00001 && iteration < 100) {
        const f = xnpv(rate, cashflows);
        const df = xnpvPrime(rate, cashflows);
        const nextRate = rate - f / df;
        err = Math.abs(nextRate - rate);
        rate = nextRate;
        iteration++;
    }

    return (iteration >= 100 || isNaN(rate)) ? null : rate;
}

/**
 * Calculate Rolling Returns (Avg, Min, Max for a specific period)
 */
function calcRollingReturns(data, years) {
    if (!data || data.length < 252 * years) return null;

    const returns = [];
    for (let i = 0; i < data.length; i++) {
        const startDate = new Date(data[i].date);
        const targetDate = new Date(startDate);
        targetDate.setFullYear(startDate.getFullYear() + years);

        let endIdx = -1;
        for (let j = i + 200 * years; j < data.length; j++) {
            if (data[j] && data[j].date >= targetDate) { endIdx = j; break; }
        }

        if (endIdx !== -1) {
            const ret = calcCAGR(data[i].nav, data[endIdx].nav, data[i].date, data[endIdx].date);
            if (ret !== null) returns.push(ret);
        }
    }

    if (returns.length === 0) return null;
    return {
        avg: returns.reduce((a, b) => a + b, 0) / returns.length,
        min: Math.min(...returns),
        max: Math.max(...returns)
    };
}

/**
 * Clean up fund name for display (strip plan/growth suffixes)
 */
function formatFundName(name) {
    if (!name) return '';
    return name
        .replace(/\s*-?\s*Direct Plan\s*-?\s*Growth\s*(Option)?/ig, '')
        .replace(/\s*-?\s*Growth\s*Option/ig, '')
        .replace(/\s*-?\s*Direct Growth/ig, '')
        .trim();
}

/**
 * Sanitize fund name for Groww search API
 */
function sanitizeForGroww(name) {
    if (!name) return '';
    return name.replace(/-?\s*(Direct|Regular)\s*Plan\s*-?\s*Growth\s*(Option)?/ig, '')
        .replace(/-?\s*Direct\s*Growth/ig, '')
        .replace(/-?\s*Growth\s*Option/ig, '')
        .replace(/-/g, ' ')
        .trim();
}

/**
 * Escape HTML special characters to prevent XSS
 */
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Format a decimal return value as a percentage string
 */
function formatPercent(value) {
    if (value === null || value === undefined) return '—';
    const pct = (value * 100).toFixed(2);
    return (value >= 0 ? '+' : '') + pct + '%';
}

/**
 * Return CSS class for positive/negative values
 */
function getPercentClass(value) {
    if (value === null || value === undefined) return '';
    return value >= 0 ? 'stat-positive' : 'stat-negative';
}

/**
 * Strict data formatting for the Compare UI
 * Returns "-" for null, undefined, NaN, or empty strings.
 */
function formatCompareData(value, suffix = '') {
    if (value === null || value === undefined || String(value).trim() === '' || (typeof value === 'number' && isNaN(value))) {
        return '-';
    }
    return String(value) + suffix;
}

/* ═══════════════════════════════════════════════════════════════════
   SIP LEDGER GENERATOR
   Simulates a monthly SIP from startDate → endDate using historical
   NAVs from mfapi.in. Skips holidays by advancing to the next
   available trading day.
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Generates a full SIP transaction ledger from historical NAVs,
 * with optional Step-Up support.
 *
 * @param {string}      schemeCode     - mfapi.in scheme code
 * @param {number}      monthlyAmount  - Base monthly SIP amount (₹)
 * @param {string}      startDate      - 'YYYY-MM-DD' — first SIP month
 * @param {string|null} endDate        - 'YYYY-MM-DD' last month, or null for today
 * @param {object}      [stepUpConfig] - Optional step-up parameters:
 *   @param {boolean} stepUpConfig.isStepUp          - Whether step-up is enabled
 *   @param {number}  stepUpConfig.stepUpAmount       - Amount to add per interval (₹)
 *   @param {string}  stepUpConfig.stepUpStartDate    - 'YYYY-MM-DD' when step-ups begin
 *   @param {string}  stepUpConfig.stepUpFrequency    - 'annually' | 'half-yearly'
 * @returns {Promise<{ instalments: Array, totalUnits: number, totalInvested: number }>}
 */
async function generateSipLedger(schemeCode, monthlyAmount, startDate, endDate, stepUpConfig = {}) {
    // 1. Fetch full NAV history
    const res = await fetch(`https://api.mfapi.in/mf/${schemeCode}`);
    if (!res.ok) throw new Error(`Failed to fetch NAVs for scheme ${schemeCode}`);
    const json = await res.json();

    if (!json.data || json.data.length === 0) {
        throw new Error(`No NAV data available for scheme ${schemeCode}`);
    }

    // 2. Build YYYY-MM-DD → nav lookup map + sorted ascending key list
    const navMap = new Map();
    json.data.forEach(entry => {
        const [dd, mm, yyyy] = entry.date.split('-');
        const isoKey = `${yyyy}-${mm}-${dd}`;
        const navVal = parseFloat(entry.nav);
        if (!isNaN(navVal) && navVal > 0) navMap.set(isoKey, navVal);
    });
    const sortedKeys = Array.from(navMap.keys()).sort();

    // 3. Determine iteration bounds (always snap to 1st of month)
    const start = new Date(startDate);
    start.setDate(1);
    const end = endDate ? new Date(endDate) : new Date();

    // 4. Step-up pre-computation
    const {
        isStepUp = false,
        stepUpAmount = 0,
        stepUpFrequency = 'annually'
    } = stepUpConfig;

    const stepUpMonths = stepUpFrequency === 'half-yearly' ? 6 : 12; // interval in months
    const sipStartOrigin = new Date(startDate);
    sipStartOrigin.setDate(1);

    // 5. Month-by-month loop
    const instalments = [];
    let totalUnits = 0;
    let totalInvested = 0;
    let current = new Date(start);

    while (current <= end) {
        // ── Compute this month's SIP amount ─────────────────────────
        let currentMonthlyAmount = monthlyAmount;

        if (isStepUp && stepUpAmount > 0 && current >= sipStartOrigin) {
            // How many complete step-up intervals have elapsed since sip start?
            // We subtract 1 month to account for standard AMC mandate registration delay 
            // where the first payment is immediate but the mandate cycle starts month 2.
            const monthsElapsed =
                (current.getFullYear() - sipStartOrigin.getFullYear()) * 12 +
                (current.getMonth() - sipStartOrigin.getMonth());

            const intervalsElapsed = Math.max(0, Math.floor((monthsElapsed - 1) / stepUpMonths));
            currentMonthlyAmount = monthlyAmount + intervalsElapsed * stepUpAmount;
        }

        // ── Find nearest valid trading day (holiday-aware) ───────────
        const targetIso = toIsoDateString(current);
        let foundKey = null;

        for (const key of sortedKeys) {
            if (key >= targetIso) {
                const daysDiff = (new Date(key) - current) / (1000 * 60 * 60 * 24);
                if (daysDiff <= 10) foundKey = key;
                break;
            }
        }

        if (foundKey) {
            const nav = navMap.get(foundKey);
            const units = currentMonthlyAmount / nav;
            totalUnits += units;
            totalInvested += currentMonthlyAmount;
            instalments.push({
                date: foundKey,          // YYYY-MM-DD of actual execution
                nav,
                units,
                amount: currentMonthlyAmount,
                baseAmount: monthlyAmount  // for traceability
            });
        }

        // Advance to 1st of next month (safe: set day=1 first, then month++)
        current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
    }

    return { instalments, totalUnits, totalInvested };
}


/** Helper: format a Date as 'YYYY-MM-DD' */
function toIsoDateString(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/* ── Expose to global scope ─────────────────────────────────────── */
window.generateSipLedger = generateSipLedger;
window.toIsoDateString = toIsoDateString;
