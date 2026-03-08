/* ═══════════════════════════════════════════════════════════════════
   data-manager.js — The ETL Orchestrator
   ═══════════════════════════════════════════════════════════════════ */

async function runDailySync(portfolioCodes, categories, onProgress) {
    const todayDate = new Date().toISOString().split('T')[0];

    try {
        // 1. Mark Sync as In Progress
        await MFDB.setSyncState(todayDate, 'IN_PROGRESS');
        if (onProgress) onProgress('Sync started...');

        // 2. Sync Categories (Peers)
        for (let i = 0; i < categories.length; i++) {
            const cat = categories[i];
            if (onProgress) onProgress(`Syncing category peers: ${cat} (${i + 1}/${categories.length})`);

            // fetchCategoryPeers from api.js directly
            const peers = await fetchCategoryPeers(cat);
            if (peers && peers.length > 0) {
                await MFDB.setPeers(cat, peers);
            }
        }

        // 3. Sync Portfolio Funds (Incremental Merge)
        for (let i = 0; i < portfolioCodes.length; i++) {
            const code = portfolioCodes[i];
            if (onProgress) onProgress(`Syncing fund: ${code} (${i + 1}/${portfolioCodes.length})`);

            // Read existing from DB
            const existingFund = await MFDB.getFund(code);

            // Fetch fresh from API
            const freshFund = await aggregateFundDetails(code);

            if (!freshFund) {
                console.warn(`[DataManager] Failed to fetch fresh data for ${code}`);
                continue;
            }

            // Incremental Merge logic for NAV history
            if (existingFund && existingFund.nav && existingFund.nav.history && freshFund.nav && freshFund.nav.history) {
                // Find highest date in existing History
                let maxDate = 0;
                for (const entry of existingFund.nav.history) {
                    const ts = new Date(entry.date).getTime();
                    if (ts > maxDate) maxDate = ts;
                }

                // Filter fresh dates that are newer than maxDate
                const newEntries = freshFund.nav.history.filter(e => new Date(e.date).getTime() > maxDate);

                if (newEntries.length > 0) {
                    console.log(`[DataManager] Incremental merge for ${code}: adding ${newEntries.length} new NAV entries.`);
                    freshFund.nav.history = [...existingFund.nav.history, ...newEntries].sort((a, b) => new Date(a.date) - new Date(b.date));
                    // Update legacy data array alias
                    freshFund.data = freshFund.nav.history;
                } else {
                    // No new dates, but we keep the fresh metadata/portfolio
                    freshFund.nav.history = existingFund.nav.history;
                    freshFund.data = existingFund.data;
                }
            }

            // Save merged object back to DB
            await MFDB.setFund(freshFund);
        }

        // 4. Mark Sync as Complete
        await MFDB.setSyncState(todayDate, 'COMPLETE');
        if (onProgress) onProgress('Sync completed successfully!');

        return true;

    } catch (error) {
        console.error('[DataManager] Sync failed:', error);
        await MFDB.setSyncState(todayDate, 'FAILED');
        if (onProgress) onProgress(`Sync failed: ${error.message}`);
        throw error;
    }
}

export async function syncSingleFund(code) {
    console.log(`[DataManager] On-demand sync for ${code}`);
    const freshFund = await aggregateFundDetails(code);
    if (freshFund) {
        await MFDB.setFund(freshFund);
        return true;
    }
    return false;
}

window.runDailySync = runDailySync;
window.syncSingleFund = syncSingleFund;
