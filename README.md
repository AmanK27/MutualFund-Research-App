# 📈 MF Insight — Mutual Fund Research App

> 🚀 **Live Demo:** Zero-setup. Open instantly in any modern browser:
> **[https://amank27.github.io/MutualFund-Research-App/](https://amank27.github.io/MutualFund-Research-App/)**

[![License](https://img.shields.io/badge/license-Private-red.svg)]()
[![Status](https://img.shields.io/badge/status-Active-brightgreen.svg)]()
[![Stack](https://img.shields.io/badge/stack-HTML%20%7C%20CSS%20%7C%20Vanilla%20JS-yellow.svg)]()
[![Data](https://img.shields.io/badge/data-mfapi.in%20%7C%20AMFI-blue.svg)]()

---

## 🎯 What It Does

**MF Insight** is a personal mutual fund research workbench — a privacy-first, zero-backend tool for Indian investors that runs entirely in your browser. It combines real-time AMFI/MFAPI data with advanced math to surface insights you'd normally need a paid Bloomberg terminal for.

---

## ✨ Features

### 🔍 Smart Search
- Real-time autocomplete by fund name or code
- Trending Direct Growth funds shown on focus
- Selects fund name (not raw scheme code) in input field

### 📊 Fund Dashboard
- **NAV Chart** — interactive, zoomable Chart.js with 1Y / 3Y / 5Y / Max range toggles
- **Performance KPIs** — 1Y, 3Y, 5Y, Max CAGR computed client-side from raw NAV data
- **Volatility (σ)** — annualised standard deviation of daily returns
- **Sharpe Ratio** — risk-adjusted return score (uses 6% risk-free rate)
- **Fund Health Score** — composite 0–100 score blending CAGR, Volatility, Sharpe, and Expense Ratio
- **52-Week Drawdown** — max peak-to-trough loss over the last year
- **AUM** — fetched from a community-maintained AMFI CSV mirror
- **Top 10 Holdings** — from Groww's public API with retry fallback
- **Expense Ratio & Category** — resolved from the AMFI master list

### 🏆 Category Peer Ranking
- Sidebar panel ranking the top funds in the same AMFI category by 1Y CAGR
- Powered by `fetchCategoryPeers()` — an IndexedDB-cached smart fetcher (12-hour TTL)
- Highlights the current fund's position vs. its peers
- Updates Category Rank KPI (`#N of M`)

### 📋 Fund Comparison
- Dynamic side-by-side comparison for 2–4 funds simultaneously
- Shared time range selector with Chart.js multi-line overlay
- Per-fund CAGR badges rendered inline

### 💼 My Portfolio
- Add / delete transactions (Buy / SIP) per fund scheme
- Real-time P&L: invested vs. current value, absolute return %, overall XIRR
- Portfolio holdings table with per-fund "Analyze Loss" smart triggers
- **Insights & Alerts** panel — automated alerts for consecutive-loss streaks, tracking error, and more

### 🤖 Multi-Layer Loss Recovery Advisor
The flagship AI-style diagnostic tool:
1. **Drawdown Analysis** — fund's 52-week max drawdown
2. **Market Comparison** — benchmarked against Nifty 50 (UTI proxy)
3. **Category Peer Analysis** — uses `fetchCategoryPeers()` with IndexedDB cache to identify the best-performing Direct Growth peer fund via a **Pure Exclusion Filter** (removes IDCW, Bonus, Regular plan variants)
4. **Recommendation Engine** — outputs one of three strategies: **HOLD**, **COST AVERAGE**, or **SWITCH FUND**
5. **"With Swap" Simulation** — Chart.js projection of portfolio if switched to the recommended fund

### 📱 SIP Calculator & Forecast
- Configurable amount and duration
- Real compounding simulation on actual NAV history

### 📱 Mobile Handoff
- QR code generation of the live session URL for seamless cross-device use

### 📖 MF Glossary
- Built-in glossary of common mutual fund terms

---

## 🏗️ Architecture

```
MutualFund Research App/
├── index.html          # Full app shell — auth, modals, layout markup
├── css/
│   └── styles.css      # Premium dark-mode UI, glassmorphism, CSS variables
├── js/
│   ├── utils.js        # Math engine: CAGR, XIRR, Volatility, Sharpe, formatting
│   ├── cache.js        # IndexedDB CacheManager (get / set / isCacheValid — 12-hr TTL)
│   ├── api.js          # Network layer: AMFI, mfapi.in, Groww, AUM CSV
│   │                   #   └── fetchCategoryPeers() — smart IndexedDB-backed peer fetcher
│   ├── app.js          # Core orchestration, state, dashboard, portfolio, peer ranking UI
│   ├── advisor.js      # Loss Recovery Advisor engine (diagnostic + recommendation)
│   ├── robo.js         # Robo-advisor / SIP simulation helpers
│   ├── ui.js           # Advisor modal, openLossAdvisor(), chart rendering
│   └── portfolio.js    # Portfolio logic, XIRR engine, alert rules
├── package.json        # Metadata / dependency tracking
├── changelog/          # Iterative version notes (v1.0.0 → v1.6.1)
└── README.md
```

### Key Architectural Decisions

| Decision | Rationale |
|---|---|
| **Zero backend** | No server to maintain; all logic runs in the browser |
| **IndexedDB cache (12-hr TTL)** | Avoids rate-limiting from mfapi.in; peer data fetched once/day |
| **`fetchCategoryPeers()` centralized** | Both the sidebar UI and Loss Advisor share one smart, cached fetch function — no state threading |
| **Pure Exclusion Filter** | Excludes Regular / IDCW / Bonus / Dividend by name rather than requiring "Direct + Growth" keywords — handles abbreviated fund names |
| **Firebase Auth + Firestore** | Lightweight, free-tier identity and portfolio persistence without any custom backend |
| **Client-side math** | XIRR, CAGR, Sharpe, Volatility — all computed offline on raw NAV data arrays |

---

## 🚀 Running Locally

The app runs on any static file server. The included Python server is recommended:

```bash
cd "MutualFund Research App"
python3 -m http.server 8082
```

Then open `http://localhost:8082` in your browser.

> ⚠️ **Note:** CORS restrictions from AMFI endpoints may cause some data fetches to fail when running fully offline. The GitHub Pages deployment handles proxy routing automatically. For local dev, use the **Guest Mode** bypass to skip Firebase login.

---

## 📦 Tech Stack

| Layer | Technology |
|---|---|
| Structure | HTML5, Semantic DOM |
| Styling | Vanilla CSS — CSS Variables, Glassmorphism, Dark Mode |
| Logic | Vanilla ES6+ JavaScript (no framework) |
| Charts | Chart.js v4.4.1 + `chartjs-adapter-date-fns` |
| Storage | Firebase Firestore (portfolio), IndexedDB (NAV + peer cache) |
| Auth | Firebase Authentication (Google Sign-In + Guest Mode) |
| Data | `mfapi.in`, AMFI master list CSV, Groww public API |
| CI/CD | GitHub Actions → GitHub Pages auto-deploy |

---

## 📋 Changelog Summary

| Version | Highlights |
|---|---|
| **v1.6.1** | Fix: Critical JS syntax error breaking Google Sign-In |
| **v1.6.0** | Modular refactor: extracted `utils.js`, `api.js`, `cache.js`; Guest Mode added |
| **v1.5.x** | Loss Recovery Advisor: Cascading filter, CAGR fix, Pure Exclusion Filter, IndexedDB peer cache |
| **v1.4.0** | Fund Comparison module |
| **v1.2.0** | Category Peer Ranking sidebar |
| **v1.1.0** | Portfolio tracking, XIRR, alerts |
| **v1.0.0** | Core dashboard: search, NAV chart, CAGR KPIs, Sharpe, SIP calculator |

> Full version notes in [`/changelog`](./changelog/)

---

## 📄 License & Restrictions

Private repository. All intellectual and structural rights reserved.  
Do not clone, distribute, or deploy without explicit authorization.
