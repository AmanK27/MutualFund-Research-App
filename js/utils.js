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
