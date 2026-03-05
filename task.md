# Advisor Cascading Filter Refactor

- [x] Step 1: Force Numerical Sorting
    - [x] Locate the peer array in `advisor.js`.
    - [x] Map and cast `1Y_CAGR` as Float.
    - [x] Sort array descending mathematically.
    - [x] Commit and await approval.

- [x] Step 2: Implement the Cascading "3-Strike" Filter
    - [x] Implement Pass 1: Strict Direct/Growth + No IDCW/Bonus.
    - [x] Implement Pass 2: Loose Direct/Growth only.
    - [x] Implement Pass 3: Raw sorted block.
    - [x] Slice top 3 peers.
    - [x] Commit and await approval.

- [x] Step 3: Output the Guaranteed Best Peer
    - [x] Remove the old QualityScore math (`ExpenseRatio * 2`).
    - [x] Extract `topThreePeers[0]` as the final `targetFund` / `bestPeerReturn`.
    - [x] Update strategy return object for UI consumption.
    - [x] Commit and await approval.
