setTimeout(async () => {
    console.log("======================================");
    console.log("   PHASE 4: CLEARING IndexedDB CACHE  ");
    console.log("======================================");

    try {
        const db = await MFDB.init();
        const tx = db.transaction(['category_peers'], 'readwrite');
        const store = tx.objectStore('category_peers');
        store.clear();

        tx.oncomplete = async () => {
            console.log("✅ Cleared `category_peers` object store.");
            console.log("Testing new peer logic for: Equity Scheme - Mid Cap Fund...");

            try {
                // Ensure global list is loaded
                await fetchGlobalFundList();

                console.time("PeerRankingTime");
                const topPeers = await getPeerRanking("Equity Scheme - Mid Cap Fund", null);
                console.timeEnd("PeerRankingTime");

                console.log("\n📊 Phase 4 Self-Diagnostic Results (Top 5 Peers):");
                if (topPeers && topPeers.length > 0) {
                    const displayData = topPeers.slice(0, 5).map(p => ({
                        Rank: p.rank,
                        Name: p.schemeName,
                        '1Y CAGR': (p.cagr1y * 100).toFixed(2) + '%',
                        '3Y CAGR': (p.cagr3y * 100).toFixed(2) + '%',
                        'Score': p.compositeScore.toFixed(3)
                    }));
                    console.table(displayData);
                } else {
                    console.log("⚠️ No peers returned. Algorithm failed or pool was empty.");
                }

                // Regression Verification 
                console.log("\n🔍 Regression Verification Check:");
                const hasDB = typeof MFDB !== 'undefined' && typeof MFDB.init === 'function';
                const hasUtils = typeof getCAGR === 'function' && typeof formatFundName === 'function';

                console.log(`1. Global DB loaded: ${hasDB ? 'Pass ✅' : 'Fail ❌'}`);
                console.log(`2. Math Utils intact: ${hasUtils ? 'Pass ✅' : 'Fail ❌'}`);

                console.log("\n======================================");
                console.log("Please visually load the Fund Dashboard for 'Motilal Oswal Midcap Fund'");
                console.log("and verify the sidebar peer rankings.");

            } catch (err) {
                console.error("Diagnostic execution failed:", err);
            }
        };
        tx.onerror = (e) => {
            console.error("❌ Failed to clear cache:", e);
        };
    } catch (e) {
        console.error("DB Initialization error:", e);
    }
}, 3000);
