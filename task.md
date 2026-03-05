# Advisor Two-Pass Scoring Engine & UI Cleanup

- [x] Step 1: Pre-Filter and Fetch Top 10 (advisor.js)
    - [x] Filter live category peers for Direct-Growth, excluding IDCW/Bonus.
    - [x] Sort by 1Y CAGR descending.
    - [x] Slice top 10 into `candidatePool`.
    - [x] Commit and await approval.

- [x] Step 2: Implement the Deep Comparison Engine
    - [x] Score candidates by 1Y CAGR subtracting Penalty (ExpenseRatio * 2).
    - [x] Score current targetFund with the same logic.
    - [x] Sort `candidatePool` by QualityScore descending.
    - [x] Commit and await approval.

- [x] Step 3: Output the Single Best Recommendation
    - [x] Extract #1 scored fund and update `topPeer` in `analyzeLoss`.
    - [x] Strategy uses new QualityScore logic.
    - [x] Commit and await approval.

- [x] Step 4: Remove 1D Chart Filter
    - [x] Remove "1D" button in `index.html`.
    - [x] Remove "1D" case `app.js`.
    - [x] Commit and await approval.
