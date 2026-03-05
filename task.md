# Multi-Layer Loss Recovery Advisor

- [x] Step 1: The Multi-Layer Diagnostic Engine (Layers 1-3)
    - [x] Create `/js/advisor.js` exporting `analyzeLoss`.
    - [x] Layer 1: Calculate specific fund drawdown using `CacheManager`.
    - [x] Layer 2: Fetch Nifty 50 (120716) drawdown from 52-week high.
    - [x] Layer 3: Identify category top performer from `FUND_UNIVERSE`.
    - [x] Return intermediate diagnostic object.
    - [x] Commit, Push, and await approval.

- [x] Step 2: The Strategy & Simulation Engine (Layers 4-5)
    - [x] Implement decision tree (Hold, Cost-Average, Switch).
    - [x] Generate 3-year projection simulation arrays (Do Nothing vs Strategy).
    - [x] Commit, Push, and await approval.

- [x] Step 3: UI Renderer & Portfolio Integration (Layer 6)
    - [x] Update `/js/ui.js` or portfolio view to show "🤖 Analyze Loss" button.
    - [x] Render sleek glassmorphic modal with diagnosis and charts.
    - [x] Visualize `SimulationData` via Chart.js.
    - [x] Commit, Push, and await approval.
