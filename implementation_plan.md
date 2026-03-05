# Advisor Cascading Filter Refactor

Rewrite the peer-extraction logic in `/js/advisor.js` for the Multi-Layer Loss Recovery Advisor. Replace the old "Quality Score" formula with a resilient 3-tier cascading filter to guarantee the absolute best historical performer is selected regardless of data naming anomalies.

## Proposed Changes

### [js]
#### [MODIFY] [advisor.js](file:///Users/Haither/Desktop/MutualFund%20Research%20App/js/advisor.js)
- **Step 1:** Modify the list returned by `getPeerRanking` to actively ensure `cagr1y` values are parsed as Floats (treating nulls as `-999`) and sort the global pool descending.
- **Step 2:** Implement a cascading selection lock:
  - `Pass 1`: Filter for `.includes('DIRECT') && .includes('GROWTH') && !.includes('IDCW') && !.includes('BONUS') && !.includes('DIVIDEND')`
  - `Pass 2`: Fallback to `.includes('DIRECT') && .includes('GROWTH')` if Pass 1 is empty.
  - `Pass 3`: Fallback to the raw top of the sorted list if Pass 2 is empty.
  - Capture `topThreePeers`.
- **Step 3:** Strip out the old `(fund1yCAGR * 100) - (targetER * 2)` math. Simply assign `topThreePeers[0]` as the `topPeer` object to be passed down into the `strategy` string and modal logic.

## Verification Plan
1. Ensure the code commits strictly adhere to the 3-step CI/CD protocol.
2. In the browser, verify that funds with complex variant names correctly hit Pass 1 or Pass 2 and surface a guaranteed positive return as the Top Peer.
