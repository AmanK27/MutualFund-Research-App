# FEATURE_FLOW_MAP.md
> **MutualFund Research App — v1.6.2**
> *Feature execution flows for engineering handover. Generated: 2026-03-08.*

---

## Feature 1: Fund Search & Research Dashboard

**Status**: ✅ Complete

**User Action**: Types a scheme code or fund name into the search bar.

```
Search Flow:
  searchInput → searchBtn click
    │
    ├── handleSearch() → reads searchInput.value
    │     └── if scheme code (numeric) → loadFund(code)
    │     └── if text → fuzzy filter on window.allMfFunds → show dropdown
    │
    └── loadFund(code)
          ├── [1] MFDB.getFund(code)           → IndexedDB cache check
          ├── [2] syncSingleFund(code)          → on cache miss, fetch from APIs
          │       └── aggregateFundDetails()    → mfapi.in + Kuvera + GitHub CSV
          ├── [3] displayFundData()             → renders header, stats, chart
          ├── [4] retryHoldingsFetch()          → async: Groww holdings/AUM
          └── [5] UI.initPeerRanking(fund)      → async: peer list from MFDB

UI Rendered Elements:
  - fundName, fundHouse, fundCategory, fundType (header)
  - statNAV, statNAVDate, statCAGR1Y, statVolatility (stat strip)
  - navChart (Chart.js line chart with time-range buttons)
  - healthScoreValue (weighted formula: 40% CAGR + 20% vol + 20% Sharpe + 20% efficiency)
  - SIP Calculator (sipAmount, sipDuration → simulates monthly SIP with XIRR)
  - analysisCard (AUM, expense ratio, exit load, top 10 holdings)
  - peerRankingCard (top 5 peers + current fund rank)
```

**Missing**: No deep-link support (URL does not update with scheme code). Browser back button resets state.

---

## Feature 2: Category Browser (Live Fund Table)

**Status**: ✅ Complete (data pipeline) | ⚠️ Dependent on AMFI proxy uptime

**User Action**: Clicks a category item in the sidebar nav.

```
Category Click Flow:
  .category-item click → loadCategory(categoryName)
    ├── fetchLiveAmfiCategories()    → corsproxy.io + NAVAll.txt parse
    │     └── Builds window.LIVE_FUNDS[category] = [{code, name, nav}]
    ├── Compute CAGR for each fund   → getCAGR() per fund in category
    ├── Sort by 1Y CAGR (desc)
    └── renderCategoryTable()        → showState('table')

Table Rendering:
  - tableView element with fund rows
  - Each row: rank, fund name, NAV, 1Y/3Y CAGR, volatility, Sharpe
  - Clickable rows → loadFund(schemeCode)
  - SIP card shown in table state
```

**Risk**: `corsproxy.io` third-party CORS proxy is a single point of failure. If it goes down, all category pages fail.

---

## Feature 3: Portfolio Tracker

**Status**: ✅ Substantially Complete

**User Action**: Clicks "Portfolio" nav button, adds transactions.

```
Portfolio Load Flow:
  portfolioNavBtn click → loadPortfolioView()
    ├── Read localStorage['mf_portfolio_txns']
    ├── For each SIP config entry:
    │     └── generateSipLedger(code, amount, startDate, endDate, stepUpConfig)
    │           → fetches real NAV from mfapi.in for each monthly instalment
    │           → builds transaction ledger with step-up calculation
    ├── Compute per-holding totals: totalUnits, totalInvested, currentValue, XIRR
    ├── Compute portfolio-level: totalValue, totalInvested, overallXIRR
    ├── renderAllocationDonut(equityPct, debtPct, cashPct)   → Chart.js doughnut
    ├── renderTransactionHistory(txns)
    └── runInsightAlerts(holdings, alertSettings, analyticsData)

Alerts Engine (runInsightAlerts):
  Rule A: Asset Allocation Drift  (vs. user target equity %)
  Rule B: Market Timing           (Nifty 50 drop from 52-wk peak via MFDB)
  Rule C: Tax Loss Harvesting     (LTCG units with unrealised loss)
  Rule D: Peer Underperformance   (1Y gap vs top peer from MFDB cache)
  Rule E: Stop-Loss / Take-Profit  (configurable % thresholds)

Portfolio Persistence:
  - Transactions in localStorage (mf_portfolio_txns)
  - Export/Import as JSON (TestData/ sample file format)
  - addTransaction() / deleteTransaction() functions in app.js
```

---

## Feature 4: Fund Comparison

**Status**: ✅ Complete

**User Action**: Clicks "Compare" nav button, enters two fund names/codes.

```
Compare Flow:
  compareNavBtn → showState('compare')
  compareInputA/B → onCompareSearch(side) → fuzzy search on allMfFunds
  runCompareBtn click → runCompare()
    ├── aggregateFundDetails(codeA)   → full StandardFundObject
    ├── aggregateFundDetails(codeB)   → full StandardFundObject
    ├── renderCompareTable()          → side-by-side metrics
    └── renderCompareChart()          → normalised NAV overlay chart

Compare Tabs (COMPARE_ROWS):
  - Returns: YTD, 1D, 1W, 1M, 3M, 6M, 1Y, 2Y, 3Y, 5Y, 10Y
  - Risk: Volatility, Sharpe, Sortino, Beta, Alpha
  - Assets: Equity%, Debt%, Cash%
  - Details: AUM, Expense Ratio, Exit Load
```

---

## Feature 5: SIP Forecast Tool

**Status**: ✅ Complete

**User Action**: Clicks "Forecast" nav button.

```
Forecast Flow:
  forecastNavBtn → showState('sip-forecast')
  User enters: schemeCode, monthly amount, start date, horizon years
  runForecastBtn click → generateSipLedger()
    ├── Fetches real historical NAVs from mfapi.in
    ├── Simulates month-by-month SIP execution
    ├── Optional Step-Up: annual/half-yearly SIP amount increases
    └── Renders: chart of corpus growth, total invested, projected value
```

---

## Feature 6: Watchlist

**Status**: ✅ Complete

**Storage**: `localStorage['mf_watchlist']`

```
Add → addToWatchlist(code, name)       → saves to localStorage, re-renders
Remove → removeFromWatchlist(code)     → filters, saves
Momentum → calculateWatchlistMomentum()
    ├── Fetches 30-day return for each fund from MFDB
    └── Badges top momentum fund (> 5% 30-day return) with 🔥 MOMENTUM
```

---

## Feature 7: Automation Rules & Alerts

**Status**: ✅ Complete

**Storage**: `localStorage['mf_automation_rules']`

```
Configurable Rules:
  - Stop-Loss threshold (default: -5%)
  - Take-Profit threshold (default: +15%)
  - Asset Drift Alert (equity target %)
  - Peer Underperformance tolerance (% gap)
  - Market Timing (Nifty 50 52-week drop threshold)
  - Tax Harvest Alert (LTCG unrealised losses)

Rendered in: portfolioInsightsPanel (when portfolio is loaded)
Badge: alertsBadge shows alert count
```

---

## Feature 8: Robo-Advisor (engine-worker.js)

**Status**: ⚠️ Backend complete, UI incomplete

```
Advisor Full Flow:
  bridge.js preflight check:
    ├── Portfolio not empty? (localStorage)
    ├── MFDB initialized? 
    └── Sync state === 'COMPLETE'?
  → navigate to advisor-app/index.html

advisor-app/app.js:
  ├── Input: targetSchemeCode (text input)
  ├── AdvisorDB.getMarketData(code)   → reads MFAppDB.funds
  ├── MFDB.getPeers(subCategory)      → reads MFAppDB.category_peers
  └── engine.postMessage(ANALYZE_FUND)
        → engine-worker.js computes:
             CAGR(1Y, 3Y, 5Y), Volatility, Sharpe, MaxDrawdown
             Peer ranking, Score (0-100)
             Recommendation: HOLD / MONITOR / SWITCH
        → returns result object

MISSING: renderResults() renders raw JSON (JSON.stringify)
         No styled result UI, no fund-swap deep link, no history view
```

---

## Feature 9: Daily Background Sync

**Status**: ✅ Complete (orchestration), ⚠️ Relies on user staying on page

```
Trigger: bootApp() → runBackgroundSync(portfolioCodes, categories)
  1. fetchGlobalFundList()             → all AMFI funds (mfapi.in/mf)
  2. fetchCategoryPeers(cat)           → for each portfolio fund's category
  3. aggregateFundDetails(code)        → for each portfolio fund (incremental merge)
  4. syncSingleFund('120716')          → mandatory UTI Nifty 50 sync
  5. MFDB.setSyncState(today, 'COMPLETE')

Cache invalidation: 24 hours per category_peers record (updated_at check)
```

**Missing**: No service worker. No background sync (Page must be open). No push notification on sync failure.

---

## Feature 10: Fund Health Score

**Status**: ✅ Complete

```
getFundHealthScore(navData, expenseRatio):
  - 40% weight: CAGR (normalized against 15% benchmark)
  - 20% weight: Volatility (penalised above 25%)
  - 20% weight: Sharpe ratio (normalized to 1.0)
  - 20% weight: Expense efficiency (penalised above 2.5%)
  Weights redistribute when components unavailable (no data)
  Output: 0–100 score → Excellent / Good / Average / Underperformer

Limitation: Expense ratio is scraped asynchronously via Groww proxy.
Health score renders twice: once without TER, once with (if fetch succeeds).
```

---

## Partially Implemented / Disconnected Features

| Feature | Status | Issue |
|---------|--------|-------|
| Google Sign-In | ❌ Dead code | Firebase SDK not loaded; `firebase` global not defined |
| Firestore persistence | ❌ Dead code | `db = null`; all portfolio data uses `localStorage` |
| CI/CD Deployment | 🔒 Disabled | `deploy-pages.yml.disabled` — not a valid GitHub Actions file |
| Advisor Results UI | ⚠️ Stub | Renders raw JSON; no styled cards, no fund-swap links |
| AdvisorDB logs | ⚠️ Write-only | Logs saved but no UI to read/review past analyses |
| Rolling Returns | ⚠️ Implemented, not rendered | `calcRollingReturns()` in utils.js is never called in UI |
