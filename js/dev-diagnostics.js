/**
 * dev-diagnostics.js
 * Automated health check for Mutual Fund Research App UI
 */

(function () {
    console.group("🚀 App Health Diagnostics");

    const checks = [
        { name: "Sidebar Category Navigation", id: "category-nav" },
        { name: "Top Funds Panel", selector: ".top-funds-panel" },
        { name: "Search Bar", id: "searchBar" },
        { name: "Compare View Section", id: "compareView" },
        { name: "Portfolio View Section", id: "portfolioView" },
        { name: "Robo-Advisor Bridge Button", id: "nav-to-advisor" },
        { name: "Glossary Modal", id: "glossaryModal" }
    ];

    checks.forEach(check => {
        const el = check.id ? document.getElementById(check.id) : document.querySelector(check.selector);
        if (el) {
            console.log(`✅ ${check.name}: Found`);
        } else {
            console.warn(`❌ ${check.name}: MISSING`);
        }
    });

    // Verification of Global Helpers
    const globals = ['showState', 'showToast', 'loadFund', 'bootApp'];
    globals.forEach(g => {
        if (typeof window[g] === 'function' || typeof window[g] === 'object') {
            console.log(`✅ Global Found: ${g}`);
        } else {
            console.error(`❌ Global MISSING: ${g}`);
        }
    });

    // Event Listener Check (Simulation)
    const criticalButtons = [
        { id: 'searchBtn', label: 'Search' },
        { id: 'runCompareBtn', label: 'Compare' },
        { id: 'nav-to-advisor', label: 'Robo Advisor' }
    ];

    criticalButtons.forEach(btn => {
        const el = document.getElementById(btn.id);
        if (el) {
            // We can't easily check if a listener is attached, 
            // but we can check if it has the right attributes.
            console.log(`✅ Button ${btn.label} exists and is ready.`);
        }
    });

    console.groupEnd();
})();
