# **Project Full Audit Report**
*(Updated: 2026-03-08 — Full source-code deep-dive pass)*

---

## **1. Executive Summary**

This audit provides a comprehensive technical review of the MutualFund-Research-App repository. The project is a vanilla JavaScript-based web application designed for mutual fund analysis, featuring a main user application and a separate advisor-app.

While the project demonstrates a functional separation of concerns (e.g., dedicated API, DB, and UI modules), the repository suffers from poor version control practices, a lack of modern build tooling, duplicated logic, hardcoded dead code, completely absent automated testing, and several concrete runtime bugs discovered through direct source-code analysis.

---

## **2. Repository Structure Review**

* **CRITICAL: node_modules/ in Version Control:** The entire `node_modules` folder is tracked in git. This severely bloats the git history, slows down cloning, and causes merge conflicts.
  * **Status: .gitignore NOW ALREADY INCLUDES `node_modules/`** — the directory is listed in `.gitignore` (line 1). The real issue is that it was committed *before* the rule was added. The fix is to run `git rm -r --cached node_modules/` to untrack.
* **Inconsistent Changelog Naming (Dead Files):** The `changelog/` directory has two incompatible naming conventions:
  * `v1.0.0.md`, `v1.1.0.md`, `v1.2.0.md`, `v1.4.0.md`, `v1.5.0.md` (prefixed with `v`)
  * `1.5.0.md`, `1.5.1.md`, `1.5.2.md`, `1.5.3.md`, `1.5.4.md`, `1.5.5.md`, `1.6.0.md`, `1.6.1.md` (un-prefixed)
  * Both `v1.5.0.md` and `1.5.0.md` exist simultaneously — a clear release documentation breakdown.
* **Static Test Data in Root:** `TestData/mf_portfolio_export_2026-03-08.json` exists with a hardcoded date. If this contains real positions/user data, it is a severe data exposure risk.
* **Split Application Architecture:** Root contains the main app while `advisor-app/` is a completely separate application with its own HTML, CSS, and JS.
* **Missing Version Alignment:** `package.json` declares `"version": "1.5.0"` but the changelog contains entries up to `1.6.1.md`.

---

## **3. Bugs and Logical Errors** *(NEW findings from code review)*

### **3.1 — `api.js`: Dead/Zombie Cache Layer (Lines 361–384)**
* **Location:** `findTrueBestPeer()` function, lines 361–384
* **Description:** There is an empty `try {} catch {}` block containing only a stale comment:
  ```js
  try {
      // Deprecated: Cache layer removed.
      // ...
  } catch (_) { /* cache miss is fine */ }
  ```
  This block does literally nothing. It was a cache-lookup that got gutted but the try/catch scaffolding was left behind.
* **Severity:** P2 — Dead code, misleads future developers.
* **Fix:** Remove the empty try/catch entirely.

### **3.2 — `api.js`: Stub Function Leaks into Production (`fetchTERFromGithub`)**
* **Location:** `api.js` lines 625–641
* **Description:** `fetchTERFromGithub(isin)` is a function that fetches, parses text, and then returns `null` unconditionally regardless of any processing. A comment reads *"Implementation pending precise string mapping"*. This is an unfinished stub silently called by `aggregateFundDetails()`.
* **Severity:** P2 — Dead code; the network fetch happens but its result is discarded.
* **Fix:** Either implement the ISIN-to-TER matching logic, or remove the function and its call-site in `aggregateFundDetails`.

### **3.3 — `api.js`: Double CSV Download for TER Data (Lines 673–699)**
* **Location:** `aggregateFundDetails()`, lines 673–699
* **Description:** The function body directly re-fetches the TER CSV from GitHub (the same `captn3m0` URL) even though `fetchTERFromGithub()` already exists specifically for this purpose. The two implementations are divergent — the inline one attempts string matching while the helper function stub always returns `null`. This is duplicated logic that is also inconsistent.
* **Severity:** P2 — Code duplication; extra network round-trip per fund lookup.
* **Fix:** Consolidate into `fetchTERFromGithub` and implement it properly, then call it from `aggregateFundDetails`.

### **3.4 — `api.js`: `fetchCategoryPeers` Has a Vestigial Cache Layer Comment**
* **Location:** `fetchCategoryPeers()`, lines 576–583
* **Description:** The function body contains only two section headers with comments but no actual cache read/write logic:
  ```js
  // ── 1. Network Fetch via getPeerRanking ───────────
  // ── 2. Network Fallback: Full MFAPI Waterfall via getPeerRanking ───────────
  ```
  Both sections funnel to the same single call: `getPeerRanking(...)`. The `cacheKey` variable on line 574 is computed but **never used**.
* **Severity:** P1 — The `cacheKey` is dead code; the intended IndexedDB cache layer for peers was never wired up. Every call hits the network.
* **Fix:** Wire the `cacheKey` to `MFDB.getPeers()` (read-before-fetch) and `MFDB.setPeers()` (write-after-fetch), which are already implemented in `database.js`.

### **3.5 — `api.js`: `SCHEME_CATEGORY_TO_LIVE_FUNDS` Contains a Reverse-Mapping Comment but No Guard**
* **Location:** `api.js`, line 267
* **Description:** The mapping object has the entry `'Index Funds - Other Scheme': 'Index Funds'` with the comment `// Reverse mapping for some API variations`. This is semantically invalid — no AMFI API returns a category formatted this way. It's a speculative guard with no documented evidence of occurring.
* **Severity:** P3 — Minor confusion, likely harmless but dead weight.

### **3.6 — `api.js`: Category Mismatch — `'Large & Mid Cap'` Bucketed into `'Large Cap'`**
* **Location:** `api.js`, line 244: `'Equity Scheme - Large & Mid Cap Fund': 'Large Cap'`
* **Description:** Large & Mid Cap funds are a distinct SEBI-regulated category. Mapping them to `'Large Cap'` will cause these funds to appear in the wrong category in the explorer table and peer rankings.
* **Severity:** P1 — Logical/data correctness bug.
* **Fix:** Add `'Large & Mid Cap'` as a separate category in `window.LIVE_FUNDS` or map it to a more accurate bucket.

### **3.7 — `api.js`: `getPeerRanking` Discovery Loop Has a Hardcoded 80ms Delay**
* **Location:** `getPeerRanking()`, line 514: `await new Promise(r => setTimeout(r, 80));`
* **Description:** A deliberate 80ms sleep is inserted between each fund fetch in the peer discovery loop. With a pool cap of 120 funds, this means the worst-case execution time for peer discovery is **120 × 80ms = ~9.6 seconds** of purely artificial delay (before accounting for actual network latency). There is no exponential backoff or actual rate-limit response from the API.
* **Severity:** P1 — Performance bug; adds unnecessary seconds to peer loading.
* **Fix:** Remove the fixed delay. If rate-limiting is a concern, implement proper retry-after logic.

### **3.8 — `advisor-app/js/advisor-db.js`: Stale Schema Reference**
* **Location:** `advisor-db.js`, lines 12–14
* **Description:** The advisor DB file references the **old V1 schema** of the main app's IndexedDB:
  ```js
  const MFAPP_DB_NAME = 'MFAppDB';
  const MFAPP_DB_VERSION = 1;           // ← V1 (stale)
  const MFAPP_STORE = 'marketData';     // ← deleted in V2 upgrade
  ```
  The main `database.js` has since been upgraded to **V2** which (a) bumps `DB_VERSION` to `2` and (b) **deletes** the `marketData` object store, replacing it with `funds`, `sync_metadata`, and `category_peers`. The advisor's `getMarketData()` is dead code — it delegates to `MFDB.getFund()` anyway, but the constants it declares are never used anywhere.
* **Severity:** P1 — The stale constants are dead code and a ticking time bomb for future developers who might try to re-use them.
* **Fix:** Remove the `MFAPP_DB_NAME`, `MFAPP_DB_VERSION`, `MFAPP_STORE` constants from `advisor-db.js`. The `getMarketData()` method correctly delegates to `MFDB` already.

### **3.9 — `advisor-app/js/engine-worker.js`: Entirely Mock/Stub Implementation Shipped as Production Code**
* **Location:** `engine-worker.js`, entire file
* **Description:** The Web Worker that was meant to run heavy Robo-Advisor computations is **100% placeholder code**. The analysis result is a hardcoded constant (`confidenceScore: 85, expectedReturn: "15.2%"`). The "progress reporting" is a fake `setInterval` incrementing a counter by 20 every 500ms. Neither `calculateMockReturn` nor `findMockBestPeer` perform any real calculation.
* **Severity:** P0 — This is the core feature of the advisor app and it returns hardcoded/fabricated data. Any user relying on the advisor's output would see fictional recommendations.
* **Fix:** Implement real CAGR computation and peer comparison using the `peersData` and `targetFundData` already passed in via `postMessage`.

### **3.10 — `utils.js`: `getCagrForYears` Uses a Magic Number (252 Trading Days)**
* **Location:** `utils.js`, line 88: `if (data.length < 252 * years) return null;`
* **Description:** The check uses `252` (approximate trading days/year) to guard against insufficient history. However, this is applied to a raw `data.length` which is the count of NAV data points from the mfapi.in response. mfapi.in returns data for every calendar day it has a record, **not** only trading days. This means the guard may reject funds with 2+ years of genuine history simply because they have fewer than 504 entries.
* **Severity:** P1 — Can cause `getCagrForYears` to return `null` (rendering '—' in the UI) for valid funds, particularly newer ones or those with data gaps.
* **Fix:** Use a calendar-day approximation (e.g., `365 * years`) instead of `252 * years`, or count date ranges instead of array lengths.

### **3.11 — `utils.js`: XIRR Newton-Raphson Derivative Has Division-by-Zero Condition**
* **Location:** `utils.js`, `xnpvPrime` function (line 178–186)
* **Description:** The `xnpvPrime` function computes `Math.pow(1 + rate, t + 1)` where `rate` is iterated via Newton-Raphson. If `rate` converges near `-1`, `(1 + rate)` approaches `0`, and the power term will produce `Infinity` or `NaN`. The outer `calcXIRR` function only guards against `isNaN(rate)` after convergence, not during intermediate iterations. This can cause silent `NaN` propagation.
* **Severity:** P2 — Can crash the XIRR calculation for certain cashflow patterns (e.g., very early redemptions).
* **Fix:** Add a guard inside the iteration loop: `if (rate <= -1) rate = -0.999;`. Note: this guard exists in the second XIRR implementation in `portfolio.js` (`computeXIRR`, line 446) but is **missing** from `utils.js`'s `calcXIRR`.

### **3.12 — `portfolio.js`: Duplicate XIRR Implementation**
* **Location:** `utils.js` has `calcXIRR()` and `portfolio.js` has `computeXIRR()`
* **Description:** Two independent Newton-Raphson XIRR implementations exist in the codebase. They are functionally equivalent but differ subtly: `computeXIRR` in `portfolio.js` has a `-0.999` clamp guard (correct) while `calcXIRR` in `utils.js` does not (see bug 3.11). Both are exposed globally, causing confusion about which to call.
* **Severity:** P2 — Violates DRY; the one missing the guard is the dangerous one.
* **Fix:** Remove `calcXIRR` from `utils.js`, replace all call-sites with `computeXIRR` from `portfolio.js`.

### **3.13 — `ui.js`: XSS Vulnerability in Peer Ranking Renderer**
* **Location:** `ui.js`, line 169: `` `<span class="peer-name">${peer.schemeName || 'Unknown'}</span>` ``
* **Description:** `peer.schemeName` is directly interpolated into `innerHTML` without HTML-escaping. This data ultimately comes from third-party API responses (mfapi.in). While mutual fund names are unlikely to contain `<script>` tags, the `escapeHtml()` utility function already exists in `utils.js` and is not being used here.
* **Severity:** P2 — Latent XSS attack surface.
* **Fix:** Wrap all user/API-sourced strings injected via `innerHTML` with `escapeHtml()`.

### **3.14 — `portfolio.js`: `buildCashFlows` Incorrectly Filters SIP Transactions**
* **Location:** `portfolio.js`, line 456: `.filter(t => t.type === 'buy' || t.type === 'sip')`
* **Description:** Portfolio transactions of type `sip` are stored as `sip_config` objects (see `saveNewTransaction()` line 351: `type: 'sip_config'`). The `buildCashFlows()` function filters for `t.type === 'sip'`, which will **never match** a `sip_config` entry. As a result, SIP investments are silently excluded from XIRR calculations.
* **Severity:** P0 — Critical financial calculation bug. XIRR is computed without SIP cashflows, producing a meaningfully wrong result for any portfolio that uses SIPs.
* **Fix:** Change the filter to include `'sip_config'`: `.filter(t => t.type === 'buy' || t.type === 'sip' || t.type === 'sip_config')`.

### **3.15 — `portfolio.js`: `renderTransactionHistory` — SIP Entries Show `undefined` Units**
* **Location:** `portfolio.js`, line 753: `` `<td>${Number(t.units).toFixed(4)}</td>` ``
* **Description:** `sip_config` transaction objects (which represent SIP registrations) do not have a `units` field — they only carry `amount`, `startDate`, `sipStatus`, etc. Rendering `Number(undefined).toFixed(4)` yields `NaN.toFixed()` which produces the string `"NaN"` in the UI.
* **Severity:** P1 — Broken visual display in the transaction history table for SIP entries.
* **Fix:** Guard with `t.units != null ? Number(t.units).toFixed(4) : '—'`.

### **3.16 — `bridge.js`: Authentication Bypass via LocalStorage Tampering**
* **Location:** `bridge.js`, lines 14–18
* **Description:** The pre-flight check before launching the Advisor reads directly from `localStorage.getItem('mf_portfolio_txns')`. LocalStorage is fully writable by any JavaScript on the page (or by the user via DevTools). Any person could inject a fake portfolio entry like `[{"type":"buy"}]` to bypass the "portfolio is empty" gate.
* **Severity:** P2 — Security check is bypassable, though the risk is primarily self-inflicted by the user since the advisor runs client-side.
* **Fix:** The check should additionally validate that the portfolio has synced data in MFDB (which it does on line 31), not just that LocalStorage is non-empty. The current flow does check MFDB sync state afterwards, which mitigates the impact, but the LocalStorage check is still misleading.

### **3.17 — `portfolio.js`: `runInsightAlerts` Rule D (Peer Lag) Uses Stale/Unavailable Data**
* **Location:** `portfolio.js`, lines 651–671
* **Description:** Rule D accesses `fundMeta.category` and `fundMeta.returns1Y` directly from `window.allMfFunds`. However, `allMfFunds` is the raw AMFI global list from `mfapi.in/mf` which only contains `schemeCode` and `schemeName` fields — **`category` and `returns1Y` are never included in this response**. Both fields will always be `undefined`, making the peer lag alert permanently non-functional.
* **Severity:** P0 — An entire rule in the insights engine silently never fires.
* **Fix:** Use the IndexedDB-cached fund data (`MFDB.getFund()`) which does contain rich metadata, or use `window.LIVE_FUNDS` for category peer lookups.

---

## **4. Dead Code Inventory**

| File | Dead Code | Notes |
|------|-----------|-------|
| `api.js:361–365` | Empty try/catch block in `findTrueBestPeer` | Removed cache layer, scaffolding left behind |
| `api.js:574` | `const cacheKey = ...` (never used) | Unused variable in `fetchCategoryPeers` |
| `api.js:625–641` | `fetchTERFromGithub()` body | Always returns `null`; stub never implemented |
| `advisor-db.js:12–14` | `MFAPP_DB_VERSION`, `MFAPP_DB_NAME`, `MFAPP_STORE` constants | Reference V1/deleted schema |
| `utils.js` | `calcXIRR()` | Superseded by `computeXIRR()` in portfolio.js |
| `engine-worker.js` | `calculateMockReturn()`, `findMockBestPeer()` | Return hardcoded strings; no real computation |
| `data-manager.js:95` | `window.runDailySync = runBackgroundSync` | Alias to same function; `runDailySync` never called |
| `dev-diagnostics.js` (entire file) | Production ship of dev health-check script | Should be gated behind `NODE_ENV !== 'production'` |

---

## **5. Missing Connections**

* **Broken CI/CD Pipeline:** `.github/workflows/deploy-pages.yml.disabled` indicates that automated deployments to GitHub Pages are currently broken or abandoned.
* **Peer Cache Never Written:** `MFDB.setPeers()` and `MFDB.getPeers()` are fully implemented in `database.js` but **never called from `fetchCategoryPeers`** (see Bug 3.4). The cache is dead.
* **`fetchCategoryPeers` Referenced by `data-manager.js`:** `runBackgroundSync` calls `fetchCategoryPeers` to warm the peer cache (line 24), but since `fetchCategoryPeers` doesn't write to the DB, the advisor's `UI.initPeerRanking()` reads from `MFDB.getPeers()` and gets `null` every time.

---

## **6. Code Quality Issues**

* **Lack of Build Step:** CSS and JS files are shipped raw without minification.
* **No Code Formatter/Linter:** No `.eslintrc.json` or `.prettierrc` in the root.
* **No Type Safety:** Heavy data manipulation in `normalizer.js`, `portfolio.js`, `data-manager.js` is done without TypeScript or JSDoc.
* **`package.json` Missing Dependencies:** The `dependencies` field is absent. `serve.js` uses `npx serve` but the `serve` package is not listed in `devDependencies`. Any fresh install will fail silently.

---

## **7. Security Issues**

* **Data Exposure:** `TestData/mf_portfolio_export_2026-03-08.json` may contain real user portfolio data.
* **Missing CSP Headers:** No `Content-Security-Policy` meta tag, opening the app to XSS.
* **XSS via Peer Name:** `peer.schemeName` injected raw into `innerHTML` (see Bug 3.13).
* **Vulnerable Dependencies:** By committing `node_modules`, Dependabot cannot scan for CVEs.

---

## **8. Performance Issues**

* **Artificial 80ms Delay per Peer Fund:** See Bug 3.7. Adds up to ~9.6 seconds of pure synthetic wait time.
* **Global Scripts Blocking DOM:** Multiple `<script src="js/...">` tags block DOM parsing.
* **Peer Cache Not Implemented:** Every advisor/sidebar peer load hits the network (see Bug 3.4).
* **TER CSV Downloaded Twice:** Both `fetchTERFromGithub()` (unused) and the inline code in `aggregateFundDetails()` would download the same CSV (see Bug 3.3).

---

## **9. Architecture Problems**

* **`engine-worker.js` is Placeholder-Only:** The Advisor's core computing feature is fake (see Bug 3.9). The worker communicates via `postMessage` correctly, but the payload is mocked data.
* **Backend/Frontend Mixing:** `serve.js` + `package.json` sit in the same root as all frontend HTML/CSS/JS.
* **Missing Monorepo Tooling:** Sharing `MFDB`, `utils.js`, etc. across the main app and advisor-app is done via global `window.*` variables, which only works when both apps are on the same origin/page.

---

## **10. DevOps / Deployment Issues**

* `.gitignore` correctly lists `node_modules/` but the folder is already committed (`git rm -r --cached` needed).
* Deployment is manual (`.github/workflows/deploy-pages.yml.disabled`).
* No `.env.example` file; no environment variable handling.
* `package.json` has **no `dependencies` or `devDependencies` field** — running `npm install` in a fresh environment will install nothing, and `node serve.js` will fail because `serve` is invoked via `npx` but is not listed.
* `package.json` version (`1.5.0`) is behind the changelog which goes up to `1.6.1`.

---

## **11. Testing Gaps**

* **ZERO Tests Found:** No spec/test files, no Jest/Vitest/Mocha in `package.json`.
* The most critical financial logic (`calcCAGR`, `calcXIRR`/`computeXIRR`, `generateSipLedger`, `calcRollingReturns`) is completely untested.
* The XIRR duplicate bug (3.12) and the SIP cashflow exclusion bug (3.14) would have been caught immediately by a single unit test.

---

## **12. Incomplete / Planned Features**

* **Automated Deployments:** `.github/workflows/deploy-pages.yml.disabled`
* **Advisor Worker:** `engine-worker.js` is entirely mocked. Real Monte Carlo / CAGR logic is absent.
* **TER Fetching:** `fetchTERFromGithub()` is a named function that always returns `null`.
* **Peer Cache:** Write-path in `fetchCategoryPeers` was designed but never wired to IndexedDB.

---

## **13. Improvement Recommendations**

### **Short-term Fixes (Next 48 Hours)**

1. Run `git rm -r --cached node_modules/` — the `.gitignore` rule already exists; just purge the history.
2. **Fix Bug 3.14 (XIRR SIP exclusion)** — one-line filter change, highest-severity financial correctness bug.
3. **Fix Bug 3.17 (Peer Lag alert)** — Alerts engine Rule D silently never fires.
4. **Fix Bug 3.15 (SIP `units` NaN)** — Cosmetic broken display in transaction history.
5. Align `package.json` version to `1.6.1` to match changelog.

### **Medium-term Improvements (Next Sprint)**

1. Wire `MFDB.getPeers()` and `MFDB.setPeers()` into `fetchCategoryPeers()` (Bug 3.4).
2. Remove empty try/catch and unused `cacheKey` dead code.
3. Consolidate the two XIRR implementations into one (Bug 3.12).
4. Remove or implement `fetchTERFromGithub()`.
5. Implement a real computation in `engine-worker.js` — replace the mock with actual CAGR/peer ranking.
6. Add `escapeHtml()` to all `innerHTML` assignments sourcing from API data.
7. Fix the 80ms per-fund delay (Bug 3.7).

### **Long-term Architecture Improvements**

1. Introduce Vite as a bundler to enable ES Modules, tree-shaking, and minification.
2. Add Jest/Vitest, write unit tests for `calcXIRR`, `calcCAGR`, `generateSipLedger`, and `runInsightAlerts`.
3. Convert to TypeScript, starting with the `StandardFundObject` schema in `normalizer.js`.
4. Separate into a proper monorepo (`packages/frontend`, `packages/advisor-app`, `packages/server`).
5. Fix and re-enable `.github/workflows/deploy-pages.yml.disabled`.

---

## **14. Priority Fix List (Updated)**

| Priority | Category | Issue | File | Action Required |
| :---- | :---- | :---- | :---- | :---- |
| **P0** | Financial Bug | XIRR excludes SIP cashflows | `portfolio.js:456` | Change type filter to include `sip_config` |
| **P0** | Bug | Advisor Rule D (Peer Lag) never fires | `portfolio.js:651` | Use `MFDB.getFund()` instead of `allMfFunds` |
| **P0** | Feature | Engine Worker is entirely mocked | `advisor-app/js/engine-worker.js` | Implement real CAGR/peer computation |
| **P0** | Git Hygiene | `node_modules` tracked in git | `.git` | `git rm -r --cached node_modules/` |
| **P1** | Cache Bug | Peer DB cache never written | `api.js:fetchCategoryPeers` | Wire `MFDB.setPeers()` / `MFDB.getPeers()` |
| **P1** | Data Bug | Large & Mid Cap funds mapped to Large Cap | `api.js:244` | Add correct category bucket |
| **P1** | UI Bug | SIP entries show `NaN` units in history | `portfolio.js:753` | Guard with `t.units != null` |
| **P1** | Runtime Bug | `getCagrForYears` rejects valid funds | `utils.js:88` | Use calendar-day count, not 252 |
| **P1** | DevOps | `package.json` missing `dependencies` | `package.json` | Add `serve` to dependencies |
| **P1** | Testing | Financial math zero test coverage | — | Add Jest/Vitest unit tests |
| **P2** | Dead Code | Empty try/catch in `findTrueBestPeer` | `api.js:361` | Remove dead block |
| **P2** | Dead Code | `fetchTERFromGithub` always returns null | `api.js:625` | Implement or remove |
| **P2** | Dead Code | `cacheKey` variable unused | `api.js:574` | Remove or wire to DB |
| **P2** | Dead Code | Stale V1 constants in `advisor-db.js` | `advisor-db.js:12-14` | Remove unused constants |
| **P2** | Perf | Hardcoded 80ms delay per peer fetch | `api.js:514` | Remove artificial sleep |
| **P2** | Security | XSS: `peer.schemeName` raw in innerHTML | `ui.js:169` | Wrap with `escapeHtml()` |
| **P2** | Bug | Duplicate XIRR implementations diverge | `utils.js`, `portfolio.js` | Remove `calcXIRR` from `utils.js` |
| **P2** | Bug | XIRR guard missing from `calcXIRR` | `utils.js:192` | Add `-0.999` clamp to inner loop |
| **P3** | Code Quality | Leaked dev diagnostics in production | `dev-diagnostics.js` | Gate behind `NODE_ENV` |
| **P3** | Code Quality | `window.runDailySync` unused alias | `data-manager.js:95` | Remove alias |
