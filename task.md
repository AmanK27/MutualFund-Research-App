# Advisor Bug Fix & Chart Upgrade

- [x] Step 1: Synchronize Advisor Peer Data
    - [x] Update `advisor.js` to replace `FUND_UNIVERSE` fallback.
    - [x] Fetch live category peers using `getPeerRanking` or UI equivalent logic.
    - [x] Sort array by 1Y CAGR (b.cagr - a.cagr) and pick the absolute #1.
    - [x] Assign to `targetFund` and `bestPeerReturn` in `analyzeLoss`.
    - [x] Commit, Push, and await approval.

- [x] Step 2: Update Advisor Strategy Thresholds
    - [x] Update `advisor.js` decision tree.
    - [x] If true Top Peer is positive and fund is negative, ensure `SWITCH_FUND` is triggered.
    - [x] Commit, Push, and await approval.

- [x] Step 3: Implement Chart Time-Range HTML/CSS
    - [x] Add 1D, 1W, 1M, 3M, 6M, 1Y, 3Y, 5Y, 10Y, MAX buttons in `index.html`.
    - [x] Style buttons with active state highlighting.
    - [x] Commit, Push, and await approval.

- [x] Step 4: Implement Chart Data Slicing Logic
    - [x] Create `updateChartRange(range, fullNavArray)` in `ui.js` or `app.js`.
    - [x] Filter dataset based on cutoff date.
    - [x] Call `Chart.js` `.update()` to animate.
    - [x] Commit, Push, and await approval.
