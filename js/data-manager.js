/* ═══════════════════════════════════════════════════════════════════
   data-manager.js — The SWR ETL Orchestrator
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Silent Background Sync Engine for SWR Architecture.
 * Catches all errors to prevent crashing the main thread.
 */
async function runBackgroundSync(portfolioCodes, categories, onProgress = () => { }) {
    const todayDate = new Date().toISOString().split('T')[0];

    try {
        console.log("[DataManager] Starting Background SWR Sync...");
        onProgress("🔄 Syncing latest market data...");

        // 0. Ensure Global Context is loaded
        await fetchGlobalFundList();
        await MFDB.setSyncState(todayDate, 'IN_PROGRESS');

        // 1. Sync Categories (Peers) silently
        for (let i = 0; i < categories.length; i++) {
            const cat = categories[i];
            try {
                const peers = await fetchCategoryPeers(cat);
                if (peers && peers.length > 0) {
                    await MFDB.setPeers(cat, peers);
                }
            } catch (peerErr) {
                console.warn(`[DataManager] Failed to sync category ${cat}:`, peerErr);
            }
        }

        // 2. Sync Portfolio Funds (Incremental Merge)
        for (let i = 0; i < portfolioCodes.length; i++) {
            const code = portfolioCodes[i];
            try {
                const existingFund = await MFDB.getFund(code);
                const freshFund = await aggregateFundDetails(code);

                if (!freshFund) continue;

                if (existingFund && existingFund.nav && existingFund.nav.history && freshFund.nav && freshFund.nav.history) {
                    // Incremental Merge: Find highest date in existing DB
                    let maxDate = 0;
                    for (const entry of existingFund.nav.history) {
                        const ts = new Date(entry.date).getTime();
                        if (ts > maxDate) maxDate = ts;
                    }

                    // Append only newer dates
                    const newEntries = freshFund.nav.history.filter(e => new Date(e.date).getTime() > maxDate);

                    if (newEntries.length > 0) {
                        console.log(`[DataManager] Incremental merge for ${code}: adding ${newEntries.length} new NAV entries.`);
                        freshFund.nav.history = [...existingFund.nav.history, ...newEntries].sort((a, b) => new Date(a.date) - new Date(b.date));
                        freshFund.data = freshFund.nav.history; // legacy alias
                    } else {
                        // Preserves existing history if no new dates
                        freshFund.nav.history = existingFund.nav.history;
                        freshFund.data = existingFund.data;
                    }
                }
                await MFDB.setFund(freshFund);

            } catch (fundErr) {
                console.warn(`[DataManager] Failed to sync fund ${code}:`, fundErr);
            }
        }

        // 3. Mandatory Explicit Sync (Nifty 50)
        try { await syncSingleFund('120716'); } catch (e) { /* ignore */ }

        // 4. Mark Sync as Complete
        await MFDB.setSyncState(todayDate, 'COMPLETE');
        console.log("[DataManager] Background SWR Sync Completed Successfully.");
        onProgress("✅ Market data updated. Refresh to see changes.");

    } catch (criticalErr) {
        console.error('[DataManager] Critical Sync failure:', criticalErr);
        await MFDB.setSyncState(todayDate, 'FAILED');
        onProgress("⚠️ Background sync failed. Retry later.");
    }
}

async function syncSingleFund(code) {
    const freshFund = await aggregateFundDetails(code);
    if (freshFund) {
        await MFDB.setFund(freshFund);
        return true;
    }
    return false;
}

window.runBackgroundSync = runBackgroundSync;
window.syncSingleFund = syncSingleFund;
