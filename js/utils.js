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
 * Generates a full SIP transaction ledger from historical NAVs.
 *
 * @param {string} schemeCode   - mfapi.in scheme code
 * @param {number} monthlyAmount - Monthly SIP amount in ₹
 * @param {string} startDate    - ISO date string 'YYYY-MM-DD' (first SIP month)
 * @param {string|null} endDate - ISO date string (last month). Pass null for "today".
 * @returns {Promise<{ instalments: Array, totalUnits: number, totalInvested: number }>}
 */
async function generateSipLedger(schemeCode, monthlyAmount, startDate, endDate) {
    // 1. Fetch full NAV history
    const res = await fetch(`https://api.mfapi.in/mf/${schemeCode}`);
    if (!res.ok) throw new Error(`Failed to fetch NAVs for scheme ${schemeCode}`);
    const json = await res.json();

    if (!json.data || json.data.length === 0) {
        throw new Error(`No NAV data available for scheme ${schemeCode}`);
    }

    // mfapi returns newest-first; build a Map of "YYYY-MM-DD" → nav for O(1) lookup
    // and an ascending sorted array for forward-scan holiday skipping
    const navMap = new Map();
    const navDates = []; // ascending Date objects

    json.data.forEach(entry => {
        // entry.date is "DD-MM-YYYY"
        const [dd, mm, yyyy] = entry.date.split('-');
        const isoKey = `${yyyy}-${mm}-${dd}`;
        const navVal = parseFloat(entry.nav);
        if (!isNaN(navVal) && navVal > 0) {
            navMap.set(isoKey, navVal);
        }
    });

    // Build sorted ascending date list from the map keys
    const sortedKeys = Array.from(navMap.keys()).sort(); // lexicographic sort works for YYYY-MM-DD

    // 2. Determine iteration bounds
    const start = new Date(startDate);
    start.setDate(1); // always start on 1st of the selected month
    const end = endDate ? new Date(endDate) : new Date(); // today if In Progress

    // 3. Month-by-month loop
    const instalments = [];
    let totalUnits = 0;
    let totalInvested = 0;

    let current = new Date(start);

    while (current <= end) {
        // Find the closest valid trading day on or after current (1st of month)
        let targetIso = toIsoDateString(current);
        let foundKey = null;

        // Forward scan: find the first navMap key >= targetIso within the same month (+10 days buffer)
        for (const key of sortedKeys) {
            if (key >= targetIso) {
                // Make sure we don't overshoot into next month by more than 10 days
                const keyDate = new Date(key);
                const daysDiff = (keyDate - current) / (1000 * 60 * 60 * 24);
                if (daysDiff <= 10) {
                    foundKey = key;
                }
                break;
            }
        }

        if (foundKey) {
            const nav = navMap.get(foundKey);
            const units = monthlyAmount / nav;
            totalUnits += units;
            totalInvested += monthlyAmount;
            instalments.push({
                date: foundKey,          // YYYY-MM-DD of actual execution
                nav,
                units,
                amount: monthlyAmount
            });
        }

        // Advance to 1st of next month
        current.setMonth(current.getMonth() + 1);
        current.setDate(1);
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
