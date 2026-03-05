# Advisor Cascading Filter Refactor

- [ ] Step 1: Force Numerical Sorting
    - [ ] Locate the peer array in `advisor.js`.
    - [ ] Map and cast `1Y_CAGR` as Float.
    - [ ] Sort array descending mathematically.
    - [ ] Commit and await approval.

- [ ] Step 2: Implement the Cascading "3-Strike" Filter
    - [ ] Implement Pass 1: Strict Direct/Growth + No IDCW/Bonus.
    - [ ] Implement Pass 2: Loose Direct/Growth only.
    - [ ] Implement Pass 3: Raw sorted block.
    - [ ] Slice top 3 peers.
    - [ ] Commit and await approval.

- [ ] Step 3: Output the Guaranteed Best Peer
    - [ ] Remove the old QualityScore math (`ExpenseRatio * 2`).
    - [ ] Extract `topThreePeers[0]` as the final `targetFund` / `bestPeerReturn`.
    - [ ] Update strategy return object for UI consumption.
    - [ ] Commit and await approval.
