# MF Insight — Developer Task Board
> Architecture Audit v1.6.2 · March 2026 · Personal-Use Edition  
> Security tasks excluded — app is for personal use only.

---

## Summary

| Priority | Count | Focus |
|----------|-------|-------|
| P0 — Immediate | 4 | App-breaking bugs & data correctness |
| P1 — This Sprint | 6 | Boot reliability & everyday performance |
| P2 — This Month | 6 | Portfolio accuracy & UX correctness |
| P3 — Backlog | 6 | Architecture & long-term maintainability |

---

## P0 — Immediate (Fix Before Next Session)

Bugs that actively break the app or corrupt financial data.

---

### TASK-01: Replace window.onerror alert() with Console Logging + Toast

| Field | Detail |
|-------|--------|
| **Priority** | P0 |
| **Complexity** | Low |
| **Effort** | 30 minutes |
| **Files Impacted** | `index.html` (window.onerror handler), `ui.js` (showToast already exists) |

**Description**

A blocking `alert()` is wired to `window.onerror` in `index.html`. Any uncaught JS error — such as a failed API call — fires a modal dialog that freezes the browser tab. Since the app makes many third-party requests that can fail intermittently, this is triggered regularly and makes the app unusable until the popup is dismissed.

**Implementation Plan**

1. Open `index.html` and locate the `window.onerror` handler.
2. Remove the `alert(message)` call entirely.
3. Replace with `console.error('[onerror]', message, source, lineno)` for logging.
4. Call the existing `showToast()` with a generic user-friendly message.
5. Wrap the toast call in its own try-catch so a toast error can't re-trigger `onerror`.
6. Test: throw an intentional error in the console, confirm no blocking popup appears.

---

### TASK-02: Fix Double-Escaped Regex Breaking Compare Fund Input

| Field | Detail |
|-------|--------|
| **Priority** | P0 |
| **Complexity** | Low |
| **Effort** | 5 minutes |
| **Files Impacted** | `app.js` — runCompareBtn click handler |

**Description**

In `app.js`, the `runCompareBtn` click handler uses `/^\\d+$/` (double-escaped), which never matches any numeric input. The fallback path for typing a scheme code directly into the compare field is permanently broken — it always falls through to the wrong branch.

**Implementation Plan**

1. Search `app.js` for `/^\\d+$/` near the `runCompareBtn` handler.
2. Change the regex from `/^\\d+$/` to `/^\d+$/`.
3. Type a 6-digit scheme code in the compare input and confirm the fund loads correctly.
4. Add a comment explaining the intent: checks whether input is a raw numeric scheme code.

---

### TASK-03: Fix isLoading Flag Reset on Failed Fetch and goHome() Navigation

| Field | Detail |
|-------|--------|
| **Priority** | P0 |
| **Complexity** | Low |
| **Effort** | 15 minutes |
| **Files Impacted** | `app.js` — `loadFund()`, `goHome()` / `showState('welcome')` |

**Description**

The `isLoading` guard is set to `true` when a fund fetch begins but is only reset on success. A failed fetch (network error, timeout, bad response) permanently locks the flag. Any subsequent attempt to load a fund is silently dropped — the app appears frozen until a full page reload. This is a frequent failure mode given the app's reliance on third-party CORS proxies.

**Implementation Plan**

1. In `loadFund()`, locate the catch block or error handling path.
2. Add `isLoading = false` in the catch/finally block so the lock is always released.
3. In `goHome()` or wherever `showState('welcome')` is called, add `isLoading = false` as a safety reset.
4. Optionally add a 30-second timeout failsafe that resets `isLoading` automatically.
5. Test: disable network, trigger a fund load, re-enable network, attempt another load — confirm it works without refreshing.

---

### TASK-04: Fix Tax Liability Calculation — Use Unrealised Gain, Not Current Value

| Field | Detail |
|-------|--------|
| **Priority** | P0 |
| **Complexity** | Medium |
| **Effort** | 1 hour |
| **Files Impacted** | `app.js` — `loadPortfolioView()` tax bucketing section |

**Description**

The STCG/LTCG tax bucketing in `loadPortfolioView()` computes tax on `units × currentNav` (total current value). The correct base is the unrealised gain: `currentValue − costBasis`. This dramatically overstates tax liability — a ₹1L investment now worth ₹1.1L would show ₹1.1L as taxable instead of the correct ₹10,000 gain. As a personal finance tool, this is a critical data correctness issue.

**Implementation Plan**

1. Locate the STCG/LTCG computation block inside `loadPortfolioView()`.
2. For each holding compute: `unrealisedGain = (units × currentNav) − costBasis`. Floor at 0.
3. Replace the taxable amount variable with `unrealisedGain`.
4. Apply STCG (20%) and LTCG (12.5% above ₹1.25L exemption) rates to the corrected base.
5. Update display labels to read "Estimated Tax on Gains" to be unambiguous.
6. Verify manually: ₹50K invested, now worth ₹60K, held > 1 year → taxable LTCG gain = ₹10K, within exemption → tax = ₹0.

---

## P1 — Next Sprint (This Week)

High-impact fixes that affect everyday usage — data correctness, boot reliability, and session performance.

---

### TASK-05: Fix localStorage Parsing — Add Null Guards to Prevent Blank Boot Screen

| Field | Detail |
|-------|--------|
| **Priority** | P1 |
| **Complexity** | Low |
| **Effort** | 30 minutes |
| **Files Impacted** | `app.js` — `bootApp()` and all `localStorage.getItem` / `JSON.parse` call sites |

**Description**

In `app.js`, `guestTxns` and `WATCHLIST_KEY` are parsed with `JSON.parse()` without null-guards. If localStorage holds partial or corrupt JSON from a previous session crash, the entire boot sequence throws and the app renders a blank screen with no error message visible.

**Implementation Plan**

1. Search `app.js` for all `JSON.parse(localStorage.getItem(...))` patterns.
2. Wrap each in a try-catch with a fallback to an empty array or default value.
3. Example pattern:
   ```js
   let guestTxns = [];
   try {
     guestTxns = JSON.parse(localStorage.getItem('mf_portfolio_txns')) || [];
   } catch(e) {
     console.warn('Corrupt txns, resetting', e);
   }
   ```
4. Apply the same pattern to `WATCHLIST_KEY`, automation rules, and any other localStorage reads at boot.
5. Test: manually corrupt a localStorage value in DevTools, reload — confirm the app boots normally instead of going blank.

---

### TASK-06: Cache Parsed AMFI NAVAll.txt in IndexedDB with Daily TTL

| Field | Detail |
|-------|--------|
| **Priority** | P1 |
| **Complexity** | Medium |
| **Effort** | 2 hours |
| **Files Impacted** | `api.js` — `fetchLiveAmfiCategories()`, `js/database.js` — MFDB sync_metadata store |

**Description**

`fetchLiveAmfiCategories()` downloads the full ~2MB AMFI `NAVAll.txt` on every app boot and parses it synchronously on the main thread, causing ~300ms of UI jank. Since category data changes at most once daily, this is entirely wasted work on every reload after the first.

**Implementation Plan**

1. Add a new entry type to MFDB's `sync_metadata` store: `{ key: 'amfi_categories', parsedData, fetchedAt }`.
2. At the start of `fetchLiveAmfiCategories()`, query MFDB for this entry.
3. If it exists and `fetchedAt` is within the last 24 hours, return `parsedData` immediately — skip the download.
4. If stale or absent, download and parse as before, then write back to MFDB with `Date.now()`.
5. To reduce main-thread blocking during parsing, consider chunking the line-by-line parse with `setTimeout(fn, 0)` batches.
6. Test: boot the app twice in quick succession — confirm no AMFI network request on the second load.

---

### TASK-07: Cache AUM GitHub CSV in Memory and IndexedDB

| Field | Detail |
|-------|--------|
| **Priority** | P1 |
| **Complexity** | Low |
| **Effort** | 1 hour |
| **Files Impacted** | `api.js` — `fetchAUMFromGithub()` |

**Description**

`fetchAUMFromGithub()` downloads a ~500KB CSV from GitHub on every individual fund load, then does a linear string search through it. For a typical session with 10 fund loads, this is 5MB of redundant downloads and parsing. The AUM data changes at most monthly.

**Implementation Plan**

1. Add a module-level variable `let aumCache = null` at the top of `api.js`.
2. On first call, download the CSV, parse into a `Map<schemeCode, aum>`, and assign to `aumCache`.
3. Also persist the Map (serialised as JSON) to IndexedDB with a 7-day TTL.
4. On subsequent calls within the session: return directly from `aumCache` (in-memory O(1) lookup).
5. On page reload with a warm IndexedDB: rehydrate `aumCache` from DB, skip the download.
6. Test: load 5 funds in one session and confirm the GitHub CSV is fetched only once.

---

### TASK-08: Remove Dead portfolioModal HTML and saveTransaction() Dead Code

| Field | Detail |
|-------|--------|
| **Priority** | P1 |
| **Complexity** | Low |
| **Effort** | 30 minutes |
| **Files Impacted** | `index.html` (old modal HTML block), `app.js` (`saveTransaction`, `openPortfolioModal`, old input event listeners) |

**Description**

The original 3-field `portfolioModal` (txnDate, txnAmount, txnUnits) and its `saveTransaction()` handler still exist alongside the newer, full-featured `portfolioTxnModal`. The old modal is unreachable from any current UI button — dead weight that creates confusion when debugging the portfolio flow.

**Implementation Plan**

1. Identify the old portfolio modal in `index.html` — the simpler 3-field version.
2. Delete the entire HTML block for the old modal.
3. In `app.js`, delete: `saveTransaction()`, `openPortfolioModal()`, and event listeners for `txnDate`, `txnAmount`, `txnUnits`.
4. Grep the codebase for any remaining references to the removed identifiers and clean up.
5. Confirm portfolio add/edit flows still work via the newer modal.
6. Confirm no console errors about missing elements on load.

---

### TASK-09: Fix Sharpe Ratio Inconsistency Between Table Rows and Utils

| Field | Detail |
|-------|--------|
| **Priority** | P1 |
| **Complexity** | Low |
| **Effort** | 30 minutes |
| **Files Impacted** | `app.js` — `fetchRowStats()`, `js/utils.js` — `calcSharpe()` |

**Description**

`fetchRowStats()` in `app.js` computes Sharpe using a different formula (raw `vol × 100` in the denominator) compared to `calcSharpe()` in `utils.js`. This produces different Sharpe values for the same fund depending on where you look — the fund detail view vs. the comparison table — which is misleading when making investment decisions.

**Implementation Plan**

1. Open `fetchRowStats()` and locate the inline Sharpe calculation.
2. Delete the inline formula entirely.
3. Replace with a call to the shared `calcSharpe(cagr, vol)` from `utils.js`.
4. Confirm both functions agree on the risk-free rate used — document it in a comment.
5. Open a fund, compare its Sharpe in the table row vs. the detail view — confirm they now match.

---

### TASK-10: Consolidate Duplicate derivePlanType / inferPlanType Functions

| Field | Detail |
|-------|--------|
| **Priority** | P1 |
| **Complexity** | Low |
| **Effort** | 30 minutes |
| **Files Impacted** | `api.js`, `normalizer.js`, `js/utils.js` (consolidation target) |

**Description**

`derivePlanType()` in `api.js` and `inferPlanType()` in `normalizer.js` are functionally identical. Same duplication exists for `deriveOptionType()` and `inferOptionType()`. Two independent implementations risk silently diverging when one is updated but the other is missed — leading to inconsistent fund metadata across views.

**Implementation Plan**

1. Add `planTypeFromName(name)` and `optionTypeFromName(name)` to `utils.js`, combining logic from both existing implementations.
2. Update `api.js` to use the shared functions instead of its local versions.
3. Update `normalizer.js` to use the same shared functions.
4. Delete the four now-redundant local functions.
5. Load a Direct Growth and a Regular IDCW fund — confirm plan/option types are detected correctly.

---

## P2 — This Month

Portfolio accuracy and UX correctness issues worth a focused weekend session.

---

### TASK-11: Fix CAGR Display Heuristic in Peer Ranking — Always Multiply by 100

| Field | Detail |
|-------|--------|
| **Priority** | P2 |
| **Complexity** | Medium |
| **Effort** | 30 minutes |
| **Files Impacted** | `ui.js` — `initPeerRanking()`, `api.js` — CAGR computation output, `js/database.js` — stored CAGR format |

**Description**

`initPeerRanking()` in `ui.js` uses a conditional: `if rawCagr <= 5, multiply by 100`. This incorrectly inflates genuine low-CAGR funds — a Liquid fund with 3% CAGR displays as 300%. The root cause is inconsistent CAGR storage format across write paths.

**Implementation Plan**

1. Audit all places where CAGR is written to MFDB — check `getCAGR()` and `processAndRankPeers()` return values.
2. Standardise: all stored CAGR values must be fractional (0.28 = 28%). Update any write path storing percentage integers.
3. In `ui.js` `initPeerRanking()`, remove the conditional heuristic entirely. Always use: `(rawCagr * 100).toFixed(2) + '%'`.
4. Clear the peer cache in IndexedDB (or bump DB version) to force re-population with correct values.
5. Test: open peer ranking for a Liquid fund category — confirm a ~7% fund shows as 7%, not 700%.

---

### TASK-12: Fix toggleWatchlist() — Add Remove Branch to Primary CTA Button

| Field | Detail |
|-------|--------|
| **Priority** | P2 |
| **Complexity** | Low |
| **Effort** | 30 minutes |
| **Files Impacted** | `app.js` — `toggleWatchlist()`, `renderWatchlist()` |

**Description**

`toggleWatchlist()` only ever adds a fund. Clicking the same button a second time does nothing. The remove path exists but is only wired to a separate X button inside `renderWatchlist()`. The primary watchlist button never reflects current watchlist state.

**Implementation Plan**

1. In `toggleWatchlist(code)`, check if `code` already exists in the current watchlist array.
2. If present: remove it, update localStorage, update button label/icon to "Add to Watchlist".
3. If absent: add it, update localStorage, update button label/icon to "Remove from Watchlist".
4. Ensure button state is set correctly when a fund is first loaded (reflect existing watchlist status on render).
5. Test: add a fund, confirm button changes; click again, confirm it's removed and button reverts.

---

### TASK-13: Fix Sell Transaction Cost-Basis Deduction for Accurate P&L

| Field | Detail |
|-------|--------|
| **Priority** | P2 |
| **Complexity** | High |
| **Effort** | 3 hours |
| **Files Impacted** | `app.js` / `portfolio.js` — sell transaction handler and holdings display logic |

**Description**

When a sell transaction is recorded, cost-basis deduction is computed in-memory using a live average-cost calculation that is not persisted. After navigating away and returning, the average buy NAV recalculates incorrectly because the sell reduced units but the invested-amount deduction was never stored. This produces wrong XIRR and P&L figures for any partial-sell position.

**Implementation Plan**

1. When saving a sell transaction, compute and persist the cost basis at save time: `soldCostBasis = (soldUnits / totalUnits) × totalInvestedAmount`.
2. Store `soldCostBasis` as a field on the sell transaction object in localStorage/IndexedDB.
3. When recalculating holdings, subtract `soldCostBasis` from `totalInvestedAmount` — do not recompute dynamically from remaining units.
4. Verify XIRR still calculates correctly by including sell transactions as positive cashflows at the correct amounts.
5. Test: buy 100 units at ₹10, sell 50 units at ₹12, navigate away and return — confirm average buy NAV and invested amount remain correct.

---

### TASK-14: Rate-Limit loadTopPerformers() to Prevent 429 Empty Cards

| Field | Detail |
|-------|--------|
| **Priority** | P2 |
| **Complexity** | Medium |
| **Effort** | 2 hours |
| **Files Impacted** | `app.js` — `loadTopPerformers()` |

**Description**

`loadTopPerformers()` fires up to 30 parallel `mfapi.in` requests via `Promise.all()` on every home screen load. This saturates the connection pool, frequently returns 429 Too Many Requests, and causes top performer cards to render silently empty with no indication to the user.

**Implementation Plan**

1. Write a batch helper:
   ```js
   async function batchFetch(codes, limit = 5) {
     const results = [];
     for (let i = 0; i < codes.length; i += limit) {
       const batch = codes.slice(i, i + limit);
       results.push(...await Promise.all(batch.map(fetchFundData)));
     }
     return results;
   }
   ```
2. Replace the existing `Promise.all(codes.map(...))` with `batchFetch(codes, 5)`.
3. Check MFDB cache first for each fund — skip network fetch if data was synced today.
4. Add a basic retry (max 2 attempts, 1s delay) for 429 responses.
5. Test: load the home screen and confirm all top performer cards populate without network errors.

---

### TASK-15: Fix Advisor App Context Handoff via localStorage Bridge

| Field | Detail |
|-------|--------|
| **Priority** | P2 |
| **Complexity** | Medium |
| **Effort** | 2 hours |
| **Files Impacted** | `js/bridge.js`, advisor-app entry JS, `app.js` |

**Description**

The Smart Bridge navigates to `./advisor-app/index.html`, but the advisor depends on `window.currentUserPortfolio` which lives in `app.js` memory and does not survive page navigation. The advisor always launches with an empty portfolio context, making the smart bridge feature effectively non-functional.

**Implementation Plan**

1. Before navigating, serialise the required context to localStorage:
   ```js
   localStorage.setItem('bridge_context', JSON.stringify({
     holdings, fundUniverse, syncState, timestamp: Date.now()
   }));
   ```
2. In the advisor app's boot JS, on `DOMContentLoaded`: read `bridge_context`, parse and initialise state, then `localStorage.removeItem('bridge_context')`.
3. Add a fallback: if `bridge_context` is missing or older than 5 minutes, show "Please return to MF Insight and try again".
4. Test: add 3 holdings, open Smart Bridge, confirm the advisor launches with those holdings pre-loaded.

---

### TASK-16: Fix SIP Pause Edge Case — Off-by-One Extra Instalment

| Field | Detail |
|-------|--------|
| **Priority** | P2 |
| **Complexity** | Medium |
| **Effort** | 1.5 hours |
| **Files Impacted** | `js/utils.js` — `generateSipLedger()` |

**Description**

`generateSipLedger()` iterates month-by-month from `startDate` to `endDate`. If a SIP is paused mid-month, the entire month is still included and `lastSipDate` snaps to the 1st of that month internally — potentially counting one extra instalment. This causes incorrect invested amount totals and XIRR inputs for paused SIPs.

**Implementation Plan**

1. In `generateSipLedger()`, add a check: if the computed instalment date for a month falls after `pauseDate`, skip that instalment.
2. Ensure `lastSipDate` stored is the actual last executed instalment date, not the 1st of the pause month.
3. Handle the edge case where `pauseDate` is exactly the 1st of a month — that instalment should be included.
4. Add test cases in comments:
   - SIP on 5th, paused on 3rd → last instalment is the 5th of prior month.
   - SIP on 5th, paused on 6th → last instalment is the 5th of pause month.
5. Re-verify total invested amount and instalment count for a sample paused SIP.

---

## P3 — Backlog / Architecture

Foundational work that improves long-term maintainability and offline capability.

---

### TASK-17: Implement AppState Singleton to Replace 15+ Global Variables

| Field | Detail |
|-------|--------|
| **Priority** | P3 |
| **Complexity** | High |
| **Effort** | 4 hours |
| **Files Impacted** | `app.js` (all global declarations), new `js/state.js`, `portfolio.js`, `ui.js` |

**Description**

The app uses 15+ `window.*` globals for cross-module communication (`currentFund`, `currentCode`, `fullNavData`, `compareState`, `guestTxns`, `allMfFunds`, `isLoading`, etc.). This makes state changes hard to trace and will become increasingly error-prone as features grow. A lightweight AppState singleton consolidates everything into one auditable object.

**Implementation Plan**

1. Create `js/state.js`:
   ```js
   const AppState = {
     fund:  { current: null, code: null, navData: [] },
     compare: { fundA: {}, fundB: {}, range: 'MAX', tab: 'returns' },
     table: { sub: null, data: [], page: 1, sort: {} },
     ui:    { loading: false, sipListeners: false },
     cache: { allFunds: [], liveFunds: {}, activeCodes: new Set() }
   };
   window.AppState = AppState; // temporary until ES modules (TASK-20)
   ```
2. In `app.js`, remove all top-level global variable declarations and replace every read/write with `AppState.*` references.
3. Do the same in `portfolio.js` and `ui.js` for any globals they consume.
4. Run the full flow — boot, fund load, compare, portfolio, watchlist — confirm no regressions.
5. This is a prerequisite for TASK-19 (app.js split).

---

### TASK-18: Add Offline Detection Banner and Graceful Degradation

| Field | Detail |
|-------|--------|
| **Priority** | P3 |
| **Complexity** | Medium |
| **Effort** | 2 hours |
| **Files Impacted** | `index.html` (offline banner), `app.js` (navigator.onLine + event listeners), `ui.js` (banner helpers) |

**Description**

The app has no offline detection. When `mfapi.in`, AMFI, or a proxy is unreachable, the table shows placeholder dashes forever and the momentum scanner spins indefinitely. As a solo user, knowing immediately that you're offline vs. data loading avoids frustration and wasted time.

**Implementation Plan**

1. Add a hidden fixed-top banner to `index.html`: "You're offline — showing cached data".
2. In `app.js` boot, register: `window.addEventListener('offline', showOfflineBanner)` and `window.addEventListener('online', hideOfflineBanner)`.
3. On boot, check `navigator.onLine` immediately and show the banner if false.
4. In all fetch catch blocks, detect `TypeError` (network failure) and call `showOfflineBanner()`.
5. When offline, skip non-cached fetches silently and serve IndexedDB data with a "cached" badge.
6. Test via DevTools offline toggle — confirm banner appears and cached fund data remains accessible.

---

### TASK-19: Split app.js Into Feature Modules

| Field | Detail |
|-------|--------|
| **Priority** | P3 |
| **Complexity** | High |
| **Effort** | 2 days |
| **Files Impacted** | `js/app.js` → `js/search.js`, `js/compare.js`, `js/top-performers.js`, `js/glossary.js`, `js/sip-forecast.js`, `js/boot.js` |

**Description**

`app.js` is ~1,800 lines covering authentication, watchlist, SIP calculator, search/autocomplete, table filters, compare, top performers, forecast, glossary, portfolio actions, and boot. Any regression fix requires scanning the entire file. **Prerequisite: TASK-17 (AppState).**

**Implementation Plan**

1. Identify the 6 cohesive feature areas: search/autocomplete, compare, top performers, glossary, SIP forecast, automation rules.
2. Extract one module at a time — move all related functions and event listeners into the new file.
3. After each extraction, run the full app to confirm no regressions before moving to the next.
4. The remaining `app.js` → `boot.js` should contain only: DB init, guest login, `fetchGlobalFundList`, `runBackgroundSync`, and the boot sequence (~150 lines).
5. Update `index.html` script tags to include the new module files.

---

### TASK-20: Introduce Vite Build Tool with ES Modules

| Field | Detail |
|-------|--------|
| **Priority** | P3 |
| **Complexity** | High |
| **Effort** | 1 day |
| **Files Impacted** | New: `vite.config.js`, `package.json`. All JS files (add import/export). `index.html` (module script tag). |

**Description**

The project loads raw JS files via script tags with manual `?v=N` cache-busting. No dead code elimination, no module system, cache invalidation requires manual version bumps. Vite provides instant dev server, ES module imports, tree-shaking, and content-hash filenames with near-zero config. **Prerequisite: TASK-19 (app.js split).**

**Implementation Plan**

1. Run: `npm install vite --save-dev`. Add `"dev": "vite"` and `"build": "vite build"` to `package.json`.
2. Create a minimal `vite.config.js`.
3. Convert each JS file to use ES `import`/`export`, starting with `utils.js` (no dependencies) and working up the dependency graph.
4. Update `index.html` to use a single `<script type="module" src="/js/boot.js">`.
5. Remove all `?v=N` cache-busting strings — Vite handles this with content-hash filenames.
6. Run `npm run build` and verify `dist/` loads correctly in the browser.

---

### TASK-21: Add Runtime Schema Validation for StandardFundObject

| Field | Detail |
|-------|--------|
| **Priority** | P3 |
| **Complexity** | Medium |
| **Effort** | 3 hours |
| **Files Impacted** | `js/normalizer.js`, `js/utils.js` (optional shared validator) |

**Description**

`normalizer.js` defines a clear `StandardFundObject` contract in JSDoc but nothing enforces it at runtime. When any upstream API changes its response format, the normalizer silently produces objects with missing fields that propagate deeply into charts and XIRR calculations before causing a cryptic error. As a self-maintained personal app, catching these regressions early is essential.

**Implementation Plan**

1. Define the required schema: string fields (`schemeCode`, `schemeName`, `fundHouse`, `category`), numeric fields (`latestNav`, `returns1Y`).
2. Write `validateStandardFund(obj)` returning `{ valid: boolean, errors: string[] }`.
3. Call it at the end of each normalizer adapter. On failure: `console.warn` with specific errors, return a safe fallback object.
4. Test by temporarily removing a required field from a mock API response — confirm the validator catches it with a clear log message.

---

### TASK-22: Add Workbox Service Worker for True Offline Support

| Field | Detail |
|-------|--------|
| **Priority** | P3 |
| **Complexity** | High |
| **Effort** | 2 days |
| **Files Impacted** | New: `sw.js`, `vite.config.js` (Workbox plugin), `index.html` (SW registration). **Prerequisite: TASK-20.** |

**Description**

After the first session the app should work fully offline using cached data — especially useful when reviewing portfolio performance without internet. The existing SWR IndexedDB architecture maps perfectly to a service worker cache strategy.

**Implementation Plan**

1. Prerequisite: complete TASK-20 (Vite build).
2. Install: `npm install workbox-window vite-plugin-pwa --save-dev`.
3. Configure `vite-plugin-pwa` to precache the HTML/CSS/JS shell.
4. Add a `NetworkFirst` strategy for `mfapi.in` requests: serve from IndexedDB cache when offline.
5. Add a `CacheFirst` strategy for static assets (AMFI CSV, AUM CSV) with 24-hour maxAge.
6. Register in `boot.js`: `navigator.serviceWorker.register('/sw.js')`.
7. Test: load the app, go offline in DevTools, reload — confirm the full UI and cached fund data are available.

---

*Generated from MF Insight Architecture Audit v1.6.2 · March 2026*
