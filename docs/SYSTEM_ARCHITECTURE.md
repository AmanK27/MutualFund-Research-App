# SYSTEM_ARCHITECTURE.md
> **MutualFund Research App — v1.6.2**
> *Architecture document for incoming engineering teams. Generated: 2026-03-08.*

---

## 1. Executive Overview

The MutualFund Research App is a **client-side-only, vanilla JavaScript Single-Page Application (SPA)** for Indian mutual fund research and portfolio tracking. There is no backend server. All data is sourced from public REST APIs via the browser, with persistence via **IndexedDB** (cached market data) and **localStorage** (user portfolio, watchlist, automation rules).

A secondary micro-app — the **Robo-Advisor** (`advisor-app/`) — runs as an isolated sub-page with its own Web Worker computation engine, and communicates back with the main app via shared IndexedDB.

---

## 2. Directory Structure

```
MutualFund Research App/
├── index.html                  ← Main SPA entry point (~95 KB; inlined CSS overrides, full DOM)
├── package.json                ← Only dependency: `serve` (dev server)
├── serve.js                    ← LAN dev server with auto-browser-open
├── .gitignore
├── .github/
│   └── workflows/
│       └── deploy-pages.yml.disabled   ← CI/CD pipeline (manually disabled)
│
├── css/
│   └── styles.css              ← 57 KB of global CSS (dark theme, glassmorphism)
│
├── js/                         ← Main app JavaScript modules
│   ├── database.js             ← IndexedDB v2 (MFDB) — funds, peers, sync metadata
│   ├── normalizer.js           ← Anti-corruption layer — StandardFundObject contract
│   ├── api.js                  ← All network fetch logic (AMFI, Groww, Kuvera, GitHub)
│   ├── utils.js                ← Pure math helpers (CAGR, volatility, Sharpe, SIP ledger)
│   ├── data-manager.js         ← SWR ETL orchestrator — background sync engine
│   ├── app.js                  ← Core app state, UI orchestration, Chart.js (~3450 lines)
│   ├── portfolio.js            ← Portfolio tracking, XIRR engine, alerts (~815 lines)
│   ├── ui.js                   ← State machine, toast system, peer ranking UI
│   ├── bridge.js               ← Navigation guard between main app and advisor-app
│   └── dev-diagnostics.js      ← localhost-only DOM health checker
│
├── advisor-app/                ← Robo-Advisor micro-app (separate HTML page)
│   ├── index.html              ← Advisor entry point
│   ├── styles.css
│   └── js/
│       ├── app.js              ← Advisor UI controller (Web Worker client)
│       ├── advisor-db.js       ← Isolated AdvisorDB + bridge to main app MFDB
│       └── engine-worker.js    ← Web Worker: risk metrics + recommendation engine
│
├── data/
│   └── mf_portfolio_export_2026-03-08.json   ← Sample export file
│
└── changelog/                  ← Versioned changelogs (v1.0.0 → v1.6.2)
```

---

## 3. Module Dependency Graph

```
index.html
  └── loads (in order):
        database.js      → exposes window.MFDB
        normalizer.js    → exposes window.Normalizer
        utils.js         → exposes window.generateSipLedger, math helpers
        api.js           → exposes fetch functions (depends on MFDB, Normalizer, utils)
        data-manager.js  → exposes runBackgroundSync, syncSingleFund (depends on api, MFDB)
        app.js           → core SPA (depends on ALL above)
        portfolio.js     → portfolio UI (depends on app.js globals)
        ui.js            → exposes window.showToast, window.showState
        bridge.js        → advisor navigation guard
        dev-diagnostics.js → health check (localhost only)

advisor-app/index.html
  └── loads:
        database.js      → shared MFDB (reads main app's IndexedDB)
        advisor-db.js    → AdvisorDB
        app.js           → UI thread (spawns engine-worker.js)
        engine-worker.js → spawned as Web Worker
```

**Critical load-order dependency**: All modules use the global `window` object as their export mechanism. JavaScript must be loaded in the order shown above or the app will crash at runtime.

---

## 4. Data Sources (External APIs)

| API | Usage | CORS Strategy |
|-----|-------|---------------|
| `api.mfapi.in/mf` | NAV history, fund metadata, search | Direct (CORS-enabled) |
| `amfiindia.com/spages/NAVAll.txt` | Live category→fund mapping | `corsproxy.io` proxy |
| `groww.in/v1/api/...` | AUM, expense ratio, holdings | `allorigins.win` proxy |
| `api.kuvera.in/mf/api/v4/...` | Asset allocation, plan/option type | Direct (3s timeout) |
| `raw.githubusercontent.com/InertExpert2911/...` | AUM CSV backup | Direct |
| `raw.githubusercontent.com/captn3m0/india-mutual-fund-ter-tracker/...` | TER/Expense Ratio CSV | Direct |

---

## 5. Storage Architecture

### IndexedDB: `MFAppDB` (v2) — Main App
| Object Store | Key | Contents |
|---|---|---|
| `funds` | `schemeCode` | Full StandardFundObject (NAV history + metadata) |
| `category_peers` | `categoryId` | Peer rankings per AMFI category, with `updated_at` timestamp |
| `sync_metadata` | `'latest'` | Sync date, status (`IN_PROGRESS` / `COMPLETE` / `FAILED`) |

### IndexedDB: `AdvisorDB` (v1) — Advisor App
| Object Store | Key | Contents |
|---|---|---|
| `analysisLogs` | auto-increment | Full analysis results from the recommend engine |

### localStorage
| Key | Contents |
|-----|----------|
| `mf_watchlist` | Array of `{code, name, momentum}` |
| `mf_portfolio_txns` | Array of transaction objects (buy, sell, sip_config) |
| `mf_automation_rules` | Alert/automation rule thresholds |

---

## 6. StandardFundObject Schema

All internal data flows through a single canonical data shape (`normalizer.js`) that acts as an **Anti-Corruption Layer** (ACL) between raw third-party API responses and all consuming UI/algorithm code:

```
StandardFundObject:
  identifiers:         { schemeCode, isin, slug }
  meta:                { cleanName, fundHouse, category, subCategory, planType, optionType }
  nav:                 { current, date, history: [{date: Date, nav: number}] }
  details:             { aum, expenseRatio, exitLoad }
  risk:                { volatility, sharpe, sortino, alpha, beta }
  portfolio:           { equityPct, debtPct, cashPct, topHoldings: [{name, weight}] }
  returns:             { '1Y', '3Y', '5Y' }
  
  # Legacy aliases (for backward compat — to be removed):
  fund.data            → fund.nav.history
  fund.meta.scheme_name → fund.meta.cleanName
  fund.portfolio.equity_percentage → fund.portfolio.equityPct
  fund.portfolio.expense_ratio     → fund.details.expenseRatio
```

---

## 7. Authentication Architecture

The app has a **stubbed/mocked Firebase Auth** layer:

```
Firebase Config (hardcoded in app.js lines 1694-1701):
  projectId: "mutualfund-research-app"
  appId: "1:587243977915:web:d9c49156f5e194f85cfd9e"

Runtime:
  const firebaseApp = { name: "[DEFAULT]-MOCK" };  // ← mock, NOT real Firebase
  const auth = { onAuthStateChanged: cb => {}, signOut: () => Promise.resolve() };
  const db = null;  // ← Firestore disabled
```

- **Google Sign-In**: Code calls `firebase.auth.GoogleAuthProvider()` — **this will throw a runtime error** unless the Firebase SDK is loaded.
- **Guest Mode**: Fully functional. Sets `currentUser` to a mock object, sets `window.isGuestMode = true`. Portfolio persists to `localStorage`.
- **Real auth flow**: Dead code path — Firebase SDK not imported in `index.html`.

---

## 8. Data Flow: User Searches for a Fund

```
User types scheme code → loadFund(code)
  │
  ├─[Cache Hit]──▶ MFDB.getFund(code) → returns StandardFundObject
  │
  └─[Cache Miss]──▶ syncSingleFund(code)
                      └▶ aggregateFundDetails(code)
                           ├── fetchFundData(code)           → mfapi.in (NAV + meta)
                           ├── fetchAUMFromGithub(code)      → GitHub CSV
                           ├── fetch TER CSV                 → GitHub CSV
                           └── fetch kuvera.in fund_schemes  → Kuvera API
                      └▶ Normalizer.createStandardFund(amfi, kuvera, extras)
                      └▶ MFDB.setFund(standardFund)
  │
  ▼
displayFundData()
  ├── Renders NAV chart (Chart.js)
  ├── Renders CAGR / Volatility stats
  ├── renderFundHealthScore()
  ├── updateSIPCalculator()
  ├── UI.initPeerRanking(fund)           ← async, from IndexedDB
  └── window.retryHoldingsFetch()        ← async, Groww holdings via proxy
```

---

## 9. SWR (Stale-While-Revalidate) Architecture

The app follows a SWR pattern where:
1. UI always renders from **IndexedDB cache first** (instant)
2. `runBackgroundSync()` is triggered on app boot with today's portfolio codes
3. Fresh API data is merged incrementally (new NAV entries appended only)
4. Sync state logged as `COMPLETE` in `sync_metadata` store

The bridge check (`bridge.js`) **blocks advisor access** until sync state is `COMPLETE`.

---

## 10. Robo-Advisor Architecture

```
advisor-app/index.html
  │
  ├── Reads portfolio from localStorage (mf_portfolio_txns)
  ├── Reads fund data from MFAppDB (shared IndexedDB, read-only)
  ├── Reads peers from MFAppDB category_peers store
  │
  └── Spawns Worker: engine-worker.js
        ├── computeCAGR(1Y, 3Y, 5Y)
        ├── computeVolatility(252-day)
        ├── computeSharpe()
        ├── computeMaxDrawdown()
        ├── rankPeers(peersData)
        └── generateRecommendation()
              → scoring: peer rank + Sharpe + drawdown + CAGR consistency
              → output: HOLD / MONITOR / SWITCH recommendation
              → saved to AdvisorDB.analysisLogs
```

Current advisor UI renders results as **raw JSON** (`JSON.stringify(strategy, null, 2)`) — the results rendering is a stub, not a finished UI.
