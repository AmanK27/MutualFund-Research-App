# PROJECT_FULL_AUDIT.md
> **MutualFund Research App — v1.6.2**
> *Deep forensic audit for production readiness. Generated: 2026-03-08.*

---

# Executive Summary

The MutualFund Research App is a sophisticated, feature-rich mutual fund research tool built entirely in client-side vanilla JavaScript. The core data pipeline (NAV fetching, IndexedDB caching, SWR refresh, peer ranking) is well-designed and maintainable. However, the project has **critical unresolved issues** that prevent it from being production-ready as-is:

1. **Firebase Auth is completely broken** — hardcoded config, but the SDK is never loaded; `db = null`; Google Sign-In will throw runtime errors.
2. **The Robo-Advisor UI is a stub** — the engine computes analysis but renders raw JSON.
3. **All CI/CD pipelines are disabled** — no automated deployment path exists.
4. **Multiple third-party CORS proxies** are single points of failure for core features.
5. **No test suite whatsoever** — zero automated tests.

The main JS entry point (`app.js`) is 3,450 lines — a significant maintenance risk.

---

# Repository Structure Overview

```
Root:
  index.html          95 KB — monolithic SPA entry (contains full DOM template)
  css/styles.css      57 KB — all global styles
  js/app.js          150 KB — core app logic (3450 lines, primary complexity risk)
  js/portfolio.js     37 KB — portfolio, XIRR, alerts
  js/api.js           33 KB — all API calls
  js/normalizer.js    16 KB — ACL / data schema
  js/utils.js         14 KB — math utilities + SIP ledger
  advisor-app/        separate sub-page micro-app
  changelog/          15 versioned changelogs (v1.0.0 → v1.6.2)
  data/           1 sample JSON file
  .github/workflows/  1 disabled YML pipeline
```

**Key metric**: The `js/` folder is ~270 KB of hand-authored JavaScript with no build system, no bundler, and no type safety.

---

# Architecture Analysis

## Strengths
- **Anti-Corruption Layer** (`normalizer.js`): Excellent design. All API response mapping is isolated. Third-party schema changes only require editing `normalizeAmfi()`, `normalizeKuvera()`, or `normalizeGroww()`.
- **SWR Cache-First Architecture**: Correct pattern for network-dependent data. User always sees instant results from IndexedDB.
- **Incremental NAV merge** in `data-manager.js`: Smart — only new NAV dates are appended, reducing data duplication.
- **Web Worker isolation** for advisor engine: Computation does not block the UI thread.
- **StandardFundObject**: Clear internal contract prevents UI components from coupling to raw API shapes.

## Weaknesses
- **No ES Modules** — all scripts share the global `window` namespace. Name collision risk is real.
- **app.js is a God Object** — 3450 lines. Router, state machine, rendering, data fetching, auth, and business logic all mixed together.
- **No build pipeline** — no minification, no tree-shaking, no cache-busting. Production loads raw 150 KB unminified JS.
- **No type system** — no TypeScript, no JSDoc generics, no runtime schema validation.

---

# Feature Flow Mapping

See: [FEATURE_FLOW_MAP.md](./FEATURE_FLOW_MAP.md)

---

# Bugs and Logical Errors

## BUG-01 — Google Sign-In: Runtime Crash (P0)
**File**: `js/app.js` line 1720  
**Code**: `const provider = new firebase.auth.GoogleAuthProvider();`  
**Issue**: `firebase` global is not defined. The Firebase SDK is not imported anywhere in `index.html`. This will throw `ReferenceError: firebase is not defined` immediately on click.  
**Fix**: Either (a) add Firebase SDK script tags and initialize properly, or (b) remove the `handleGoogleSignIn()` noop and simplify auth to guest-only until Firebase is properly configured.

---

## BUG-02 — Firestore Write on Null (P0)
**File**: `js/app.js` line 1783  
**Code**: `db.collection('users').doc(user.uid).set({...})`  
**Issue**: `db = null` (line 1710). Calling `.collection()` on `null` throws `TypeError: Cannot read properties of null`. This line is inside `auth.onAuthStateChanged`, which is called with a no-op callback — so the `user` branch is unreachable in current state. However, if auth is ever wired correctly, this will crash.  
**Fix**: Add a null guard: `if (db) db.collection(...)`

---

## BUG-03 — `calcXIRR` Called but Not Defined in app.js (P0)
**File**: `js/app.js` line 611  
**Code**: `const xirr = calcXIRR(cashflows);`  
**Issue**: `calcXIRR` is referenced in the SIP Calculator (`updateSIPCalculator()`), but the function is not defined in `utils.js` (a comment at line 161 explicitly notes it was removed). The XIRR implementation is `computeXIRR()` in `portfolio.js`. This will throw `ReferenceError: calcXIRR is not defined` when the SIP calculator tries to compute XIRR on the fund dashboard.  
**Fix**: Rename call to `computeXIRR(cashflows)` or define an alias `const calcXIRR = computeXIRR;` at the top of app.js.

---

## BUG-04 — `window.momentumCalculated` Never Reset (P1)
**File**: `js/app.js` line 131  
**Code**: `if (window.momentumCalculated) return;`  
**Issue**: The momentum flag is never cleared. After the first page load, momentum is calculated once and then never recalculated for that session — even if the watchlist changes. If a user adds a new fund to their watchlist mid-session, its momentum won't be evaluated.  
**Fix**: Reset `window.momentumCalculated = false` whenever `saveWatchlist()` is called.

---

## BUG-05 — SIP Ledger: Holiday Offset Up to 10 Days (P1)
**File**: `js/utils.js` line 348  
**Code**: `if (daysDiff <= 10) foundKey = key;`  
**Issue**: The holiday-skip logic accepts any trading day within 10 calendar days of the target 1st-of-month date. For markets that are closed for extended periods (holidays, weekends), this snaps to the correct date. However, if the API returns no NAV within 10 days (extremely rare but possible), the instalment is silently skipped with no warning to the user.  
**Fix**: Log a warning when `foundKey` remains null and increase cap to 15 days or fall back to the nearest available date in the sorted key list.

---

## BUG-06 — `engine-worker.js` uses `navHistory` but MFDB stores `nav.history` (P0)
**File**: `advisor-app/js/engine-worker.js` line 32  
**Code**: `const navHistory = targetFundData.navHistory || [];`  
**File**: `advisor-app/js/advisor-db.js` / MFDB fund structure  
**Issue**: The StandardFundObject stores NAV history at `fund.nav.history`, not `fund.navHistory`. The worker always receives `navHistory = []` (empty array), causing the check at line 33 (`navHistory.length < 30`) to fail immediately with "Insufficient NAV history" for every fund.  
**Fix**: Change line 32 to: `const navHistory = targetFundData?.nav?.history || targetFundData?.data || [];`  
Also note: Worker also reads `targetFundData.meta?.schemeName` (line 64) but StandardFundObject field is `meta.cleanName`.

---

## BUG-07 — `getNavHistory` in api.js Bypasses IndexedDB (P1)
**File**: `js/api.js` line 418  
**Issue**: `getNavHistory(schemeCode)` is called inside `getPeerRanking()` for every peer candidate (up to 120 funds). It **always fetches from the network** (`mfapi.in`), ignoring the existing IndexedDB cache. This generates massive numbers of redundant API calls during peer ranking.  
**Fix**: Check `MFDB.getFund(schemeCode)` first; fall back to network only on cache miss.

---

## BUG-08 — XIRR Non-Convergence Returns null Silently (P2)
**File**: `js/portfolio.js` line 448  
**Code**: `return null; // non-convergent`  
**Issue**: If XIRR fails to converge (common with erratic cash flows), `null` is returned. The UI displays `'N/A'` — but no error is surfaced to the user explaining why. This is particularly confusing for SIP+step-up combinations with complex cash flow profiles.  
**Fix**: Log the non-convergence as a warning with the cash flow summary to aid debugging.

---

# Missing Integrations

## MISSING-01 — Firebase SDK not loaded
**Impact**: Google Sign-In, Firestore persistence are dead features.  
**Files**: `index.html` (no Firebase script tags), `js/app.js` lines 1694–1727  
**Fix**: Add `<script src="https://www.gstatic.com/firebasejs/9.x/firebase-app-compat.js">` tags, OR remove auth UI entirely for a pure guest-mode app.

---

## MISSING-02 — Advisor UI never renders structured results
**File**: `advisor-app/js/app.js` line 107–115  
**Issue**: `renderResults(strategy)` outputs `JSON.stringify(strategy, null, 2)` wrapped in a `<pre>` tag. No styled recommendation card, no fund-swap CTA button, no metric visualizations.  
**Fix**: Build proper result component: recommendation badge, metric grid, peer comparison bar chart, "View recommended fund" button that deep-links back to main app.

---

## MISSING-03 — AdvisorDB logs have no read UI
**File**: `advisor-app/js/advisor-db.js`  
**Issue**: `AdvisorDB.saveLog(result)` correctly stores analysis results. But there is no UI to review past analysis history. The store grows unboundedly.  
**Fix**: Add a history panel in the advisor app with a log cleanup (keep last N analyses).

---

## MISSING-04 — `calcRollingReturns()` defined but never used
**File**: `js/utils.js` line 168  
**Issue**: `calcRollingReturns(data, years)` is a complete implementation computing avg/min/max rolling CAGR — but is never called anywhere in the UI. This is a substantial feature sitting idle.  
**Fix**: Surface rolling returns in the Fund Dashboard (Add a "Rolling Returns" card next to the chart).

---

## MISSING-05 — No deep-link / URL routing
**Issue**: The URL never changes when a user navigates between funds, categories, or views. Browser back/forward button breaks the expected UX. Sharing a link to a specific fund is impossible.  
**Fix**: Implement `history.pushState()` calls in `loadFund()` and `loadCategory()`, with a `popstate` handler to restore state.

---

## MISSING-06 — SIP Portfolio: `buildCashFlows()` omits SIP instalments
**File**: `js/portfolio.js` line 456  
**Code**: `filter(t => t.type === 'buy' || t.type === 'sip' || t.type === 'sip_config')`  
**Issue**: For `sip_config` transactions, `buildCashFlows()` only records the SIP start date as a single cash flow point. The real XIRR should use the expanded instalment ledger (all monthly cash flows). The portfolio-level XIRR is therefore **incorrectly computed** for SIP holdings — treating a SIP as a single lump sum invested on `startDate`.  
**Fix**: Before calling `buildCashFlows()`, expand each `sip_config` entry via `generateSipLedger()` and substitute the individual monthly instalments into the cash flow array.

---

# Dead Code

| Item | File | Note |
|------|------|------|
| `handleGoogleSignIn()` | `app.js:1715` | Firebase never loaded; function will throw |
| `handleSignOut()` | `app.js:1756` | `auth.signOut()` resolves immediately; sign-out never changes auth state |
| `auth.onAuthStateChanged` no-op | `app.js:1707` | Callback is empty; signed-in branch of observer is unreachable |
| Firebase config object | `app.js:1694` | Hardcoded credentials that are never used |
| `performGrowwSearch()` / `fetchAdvancedFundData()` | `api.js:155` | Both Groww endpoints often blocked by proxy; superseded by GitHub CSV approach |
| `normalizeGroww()` | `normalizer.js:227` | `growwRaw` parameter is always `null` in `createStandardFund()` calls — Groww normalizer runs on null |
| `calcRollingReturns()` | `utils.js:168` | Fully implemented, never called |
| `window.SCHEME_CATEGORY_TO_LIVE_FUNDS` | `api.js:238` | Large map defined at module load; grep confirms it is never read anywhere |

---

# Security Risks

## SEC-01 — Hardcoded Firebase Project Credentials (P1)
**File**: `js/app.js` lines 1694–1701  
```javascript
const firebaseConfig = {
    apiKey: "AIzaSyAVu...",
    projectId: "mutualfund-research-app",
    appId: "1:587243977915:web:..."
};
```
While Firebase API keys for web apps are technically designed to be public (protected by Firebase Security Rules), having them in version control with no Firebase Security Rules in place is a risk vector.  
**Fix**: If Firebase is ever re-enabled, validate that Firestore/Auth rules are locked down. Move the config to environment-specific build variables.

---

## SEC-02 — innerHTML with User-Controlled Data (P1)
**File**: `js/ui.js` line 169, `js/portfolio.js` line 564, 614  
**Issue**: `escapeHtml()` is used in most places, but several `innerHTML` assignments use unescaped fund names directly. For example, in `runInsightAlerts()` (portfolio.js line 564), `a.message` contains HTML markup with `<strong>` and `<em>` tags — and fund names are interpolated directly into the message string.  
```javascript
message: `...lags the top peer <em>${topPeer.schemeName}</em>...`
```
Since `topPeer.schemeName` comes from AMFI data (not user input), the risk is low in practice. However, if AMFI data were ever compromised or a CORS proxy served malicious content, stored XSS would be possible.  
**Fix**: Apply `escapeHtml()` to every dynamic string injected into innerHTML, including API-sourced fund names. Use `textContent` where HTML formatting is not needed.

---

## SEC-03 — CORS Proxy Dependency (P1)
**Files**: `js/api.js` lines 48, 157, 197  
**Proxies used**: `corsproxy.io`, `api.allorigins.win`  
**Issue**: Responses from `corsproxy.io` and `allorigins.win` are trusted without validation. A compromised proxy could serve malicious JSON. The app parses this JSON with `JSON.parse(wrapperJson.contents)` directly.  
**Fix**: (a) Self-host a CORS proxy on a controlled domain, (b) add response schema validation, (c) use `sanitize-html` before injecting any proxy-sourced content.

---

## SEC-04 — No Content Security Policy (P2)
**File**: `index.html`  
**Issue**: No `Content-Security-Policy` header or meta tag. CDN-loaded Chart.js and date-adapter scripts are loaded from `cdn.jsdelivr.net` without Subresource Integrity (SRI) hashes.  
**Fix**: Add SRI hashes to all CDN script tags. Add CSP header via server or meta tag.

---

# Performance Issues

## PERF-01 — getPeerRanking Makes ~120 Sequential Network Calls (P0)
**File**: `js/api.js` line 494–504  
**Issue**: The peer ranking discovery loop iterates over up to 120 funds sequentially, making one `fetch()` call per fund to `mfapi.in`. At ~200ms per call, this is **24+ seconds** of blocking network I/O on a cache miss.  
```javascript
for (const peer of rawPool) {
    const navHistory = await getNavHistory(code);  // sequential!
```
**Fix**: Use `Promise.all()` with a concurrency limiter (e.g., process in batches of 10). This would reduce wait time by ~10x.

---

## PERF-02 — SIP Ledger Always Re-fetches NAVs from Network (P1)
**File**: `js/utils.js` line 285  
**Code**: `const res = await fetch(\`https://api.mfapi.in/mf/${schemeCode}\`);`  
**Issue**: `generateSipLedger()` always fetches fresh NAV data from the network, even when the fund is fully cached in MFDB. This adds latency every time portfolio view is loaded with SIP entries.  
**Fix**: First check `MFDB.getFund(schemeCode)` and use `fund.nav.history` if available.

---

## PERF-03 — `renderAllocationDonut` Reads DOM on Every Call (P2)
**File**: `js/portfolio.js` line 527  
**Code**: `const expText = document.getElementById('fundExpense')?.textContent || '';`  
**Issue**: `renderFundHealthScore()` reads the expense ratio from the already-rendered DOM text instead of from the cached data object. This is a fragile anti-pattern — if the element is hidden or not yet populated, the score will be computed with no expense ratio.  
**Fix**: Pass `expenseRatio` as a parameter from the fund data object directly.

---

## PERF-04 — `window.allMfFunds` Loaded on Every Portfolio Modal Open (P1)
**File**: `js/portfolio.js` line 119  
**Code**: `fetchGlobalFundList().then(...)`  
**Issue**: The global fund list (~6,000 entries) is re-fetched if not in memory. Since it's loaded into `window.allMfFunds` (not persisted to IndexedDB), it must be re-fetched on every page reload. This is a 300–500 KB JSON download.  
**Fix**: Persist `window.allMfFunds` to IndexedDB (`MFDB`) or `sessionStorage` with a daily TTL.

---

# Dependency Problems

## Current `package.json` dependencies:
```json
{
  "devDependencies": {
    "serve": "^14.2.4"
  }
}
```

The production app has **zero npm dependencies**. All external libraries are loaded from CDNs in `index.html`:
- `Chart.js` (via cdn.jsdelivr.net)
- `chartjs-adapter-date-fns` (via cdn.jsdelivr.net)
- `date-fns` (via cdn.jsdelivr.net)

**Risks**:
- CDN unavailability → charts break completely
- No version pinning with SRI hashes → supply chain attack surface
- `serve@14.2.4` has known vulnerabilities in sub-dependencies (check `npm audit`)

**Run**: `npm audit` to get current vulnerability report.

---

# DevOps & Deployment Gaps

## DEV-01 — CI/CD Pipeline is Disabled (P0)
**File**: `.github/workflows/deploy-pages.yml.disabled`  
**Issue**: The GitHub Actions workflow has a `.disabled` extension — GitHub Actions ignores it. There is **no automated deployment path**. Every deployment requires manual steps.  
**Fix**: Rename to `deploy-pages.yml` to re-enable. Review if the `path: '.'` upload scope should be narrowed to exclude `node_modules/` (currently this would upload all of `node_modules` to GitHub Pages).

---

## DEV-02 — `node_modules/` would be Deployed to GitHub Pages (P1)
**File**: `.github/workflows/deploy-pages.yml.disabled`, line 34  
**Code**: `path: '.'`  
**Issue**: The artifact upload uses the entire repository root. This includes `node_modules/`, significantly bloating the deployed artifact.  
**Fix**: Either add a `.nojekyll` file and exclude node_modules via `.gitignore`/`.artifactignore`, or specify `path: './index.html'` and build a minimal deploy list.

---

## DEV-03 — No Environment Variables System (P1)
**Issue**: Firebase config, API keys, and proxy URLs are hardcoded in `js/api.js` and `js/app.js`. There is no `.env` system, no build-time substitution, and no way to have development vs production configurations.  
**Fix**: Introduce a `config.js` file that reads from build-time substituted environment variables, or at minimum create separate config objects for dev and prod environments.

---

## DEV-04 — No Error Tracking / Monitoring (P1)
**Issue**: There is no Sentry, Datadog, or equivalent error tracking. Silent failures in the API fetch chain are swallowed by `catch(e) {}` blocks in many places. Production errors are invisible.  
**Fix**: Add `window.onerror` and `window.onunhandledrejection` handlers that report to an error tracking service (or at minimum log structured error summaries).

---

## DEV-05 — No Service Worker / Offline Support (P2)
**Issue**: The app is fully network-dependent. When offline, the cached IndexedDB data is inaccessible because no service worker intercepts navigation requests. Users see a blank page or browser offline error.  
**Fix**: Add a service worker that caches `index.html`, `styles.css`, and all `js/` files so the shell loads offline, then renders from IndexedDB cache.

---

# Testing Coverage Analysis

## Current state: **Zero tests**

No test files exist. The `.gitignore` excludes `test_api.js` and `test_browser.js` (suggesting they were once created but deleted or gitignored for security reasons).

`dev-diagnostics.js` provides a localhost-only DOM health check (not a real test suite).

## Critical paths with no test coverage:
| Path | Risk |
|------|------|
| `computeXIRR()` Newton-Raphson convergence | High — math-critical, directly affects reported returns |
| `generateSipLedger()` step-up calculation | High — directly affects SIP performance display |
| `getPeerRanking()` AMFI category matching | High — drives advisor recommendations |
| `Normalizer.createStandardFund()` merge logic | Medium — any regression breaks all fund displays |
| `getCAGR()` and `calcVolatility()` | Medium — used throughout rankings and health score |
| `buildCashFlows()` cash flow construction | High — feeds XIRR; known bug (see MISSING-06) |

## Recommended testing approach:
1. **Unit tests** (Jest / Vitest): `utils.js` math functions are pure — 100% testable.
2. **Integration tests**: Mock `fetch()` in `api.js` and test `aggregateFundDetails()` with fixture data.
3. **End-to-end**: Playwright for the full user flow (search → load → portfolio → advisor).

---

# Incomplete Features / Technical Debt

## DEBT-01 — Legacy Alias Chain in aggregateFundDetails (P2)
**File**: `js/api.js` lines 718–728  
```javascript
fund.data = fund.nav.history;              // legacy: fund.data[]
fund.meta.scheme_name = fund.meta.cleanName;   // legacy alias
fund.portfolio.equity_percentage = fund.portfolio.equityPct;
```
These backward-compat aliases indicate that the codebase is mid-migration from an old data schema to the new StandardFundObject. Some consumers (Compare view, portfolio view) still use old keys.  
**Fix**: Audit all consumers of `fund.data`, `fund.meta.scheme_name`, `fund.portfolio.equity_percentage` and update to use StandardFundObject keys. Then remove the aliases.

---

## DEBT-02 — app.js Monolith (P1)
3,450 lines of JavaScript handling: auth, state machine, chart rendering, SIP calculator, fund health score, compare feature, search, watchlist, top performers, SIP forecast, rolling returns configuration, and more.  
**Fix**: Extract into modules:
- `auth.js` — Sign in/out, guest mode
- `chart.js` (or `charts.js`) — Chart rendering
- `compare.js` — Compare feature
- `search.js` — Search and autocompletion
- `forecast.js` — SIP Forecast view

---

## DEBT-03 — SCHEME_CATEGORY_TO_LIVE_FUNDS Map Never Used (P2)
**File**: `js/api.js` lines 238–267  
This large mapping object is defined at module load time but no code in the codebase reads it. It's dead configuration.  
**Fix**: Remove the map or document where it was intended to be used.

---

## DEBT-04 — Advisor App: Single Scheme Code Input (P2)
**File**: `advisor-app/index.html` / `advisor-app/js/app.js`  
The advisor requires manually entering a scheme code. There is no integration with the user's actual portfolio. The smart bridge pre-checks that the portfolio exists but never passes that portfolio data to the advisor.  
**Fix**: Pre-populate the advisor scheme input from the user's portfolio. Let users select from held funds.

---

# Recommended Improvements

## Short-Term Fixes (Sprint 1 — 1 week)

| Priority | Fix |
|----------|-----|
| **P0** | Fix BUG-03: Rename `calcXIRR` → `computeXIRR` in app.js SIP calculator |
| **P0** | Fix BUG-06: Update engine-worker.js to read `fund.nav.history` not `fund.navHistory` |
| **P0** | Add null guard: `if (db) db.collection(...)` around Firestore write |
| **P1** | Fix MISSING-06: Expand SIP cash flows in `buildCashFlows()` for accurate portfolio XIRR |
| **P1** | Fix BUG-04: Reset `window.momentumCalculated` on watchlist change |
| **P1** | Fix PERF-02: Use MFDB cache in `generateSipLedger()` before network fetch |

## Medium-Term Improvements (Sprint 2–4 — 1 month)

| Priority | Fix |
|----------|-----|
| **P0** | Build proper Advisor results UI — structured recommendation cards, peer bar chart, fund-swap CTA |
| **P1** | Fix PERF-01: Parallelize peer ranking discovery loop (batched Promise.all) |
| **P1** | Implement MISSING-05: URL routing via history.pushState for deep-links and browser navigation |
| **P1** | Add error tracking (unhandledrejection + window.onerror → logging service) |
| **P1** | Write unit tests for all `utils.js` math functions |
| **P2** | Persist `window.allMfFunds` to IndexedDB with daily TTL |
| **P2** | Surface `calcRollingReturns()` in Fund Dashboard UI |
| **P2** | Remove all legacy alias assignments from `aggregateFundDetails()` and update consumers |

## Long-Term Architecture Improvements (Quarter)

| Priority | Fix |
|----------|-----|
| **P1** | Extract app.js into ≥5 focused modules (auth, charts, compare, search, forecast) |
| **P1** | Add Service Worker for offline support and shell caching |
| **P2** | Add TypeScript or JSDoc type annotations to StandardFundObject contract and all API functions |
| **P2** | Add end-to-end tests with Playwright for the critical user paths |
| **P2** | Add Subresource Integrity (SRI) hashes to all CDN-loaded scripts |
| **P3** | Consider bundler (Vite/Rollup) for code splitting, minification, and cache-busting |

---

# Priority Fix List Summary

## P0 — Critical (must fix before production)
1. `calcXIRR` is undefined (SIP calculator broken in fund dashboard)
2. engine-worker.js reads wrong property path for NAV history (advisor always fails)
3. Firestore write on null `db` (runtime crash if auth ever re-enabled)
4. Peer ranking makes 120 sequential API calls (24+ second hangs)

## P1 — Important (fix in near term)
5. Portfolio XIRR incorrectly treats SIP configs as single lump sums
6. Firebase SDK not loaded → Google Sign-In dead
7. No error tracking / monitoring
8. URL routing missing (no deep-links, back button broken)
9. Advisor UI renders raw JSON
10. CORS proxy is single point of failure for category browsing
11. SIP ledger always re-fetches from network (ignores MFDB cache)

## P2 — Improvement (plan for roadmap)
12. app.js monolith (3450 lines)
13. Rolling Returns feature implemented but not surfaced
14. SCHEME_CATEGORY_TO_LIVE_FUNDS dead code
15. Advisor only accepts manual scheme code input, not portfolio
16. No SRI hashes on CDN scripts
17. No service worker for offline support
18. AdvisorDB logs grow unboundedly with no read UI
