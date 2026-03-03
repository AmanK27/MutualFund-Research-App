# Mutual Fund Research App Changelog

## Latest Major Changes

### UI & Layout Overhaul
- **Global Theme Transition:** Converted the app to a premium dark-mode aesthetic with an emerald/teal color palette (`#10B981`) and large radial gradient glows.
- **Glassmorphism Panels:** Successfully implemented translucent dark backgrounds, aggressive background blurs, and delicate borders for cards to achieve a modern frosted glass effect.
- **Grid Layout Refactoring:** Reestructured the main dashboard layout into a CSS Grid format:
  - Top search bar perfectly aligned.
  - Middle section dynamically sized for NAV Chart (70%) and Top 5 Funds column (30%).
  - KPI stat cards neatly organized at the bottom in a responsive 3-column grid layout.
- **Top 5 Performing Funds:** Designed a tall, vertical glass panel showcasing top performers with circular avatars for initials, a sleek centralized fund title, and right-aligned return percentage badges.
- **KPI Cards Modernization:** Remodeled the CAGR, Volatility, and Expense Ratio stat cards, stripping out old identifiers and aligning labels gracefully to the left of stark, large white primary values.
- **Minimalist Sidebar Navigation:** Modernized sidebar active states to feature soft, rounded glowing backgrounds with consistent emerald theme accenting.

### Bug Fixes & Stability
- **Null Pointer Eradication:** Identified and patched critical `Cannot set properties of null` unhandled exceptions in the dashboard and chart data processing scripts (`displayFundData()`, `updateSIPCalculator()`). Defensive rendering null checks effectively prevented load failures after the KPI components restructuring.

### Search Functionality Upgrades
- **Search Results View State:** Converted the search mechanism to provide real-time dropdown listings instead of enforcing immediate auto-selection on the Enter key.
- **Trending Funds Dropdown:** Added a new state revealing the top trending active Direct-Growth funds automatically upon input focus.
- **Name Decoupling:** Replaced displaying the raw scheme code with the fully formatted scheme name directly in the primary search input on selection.
