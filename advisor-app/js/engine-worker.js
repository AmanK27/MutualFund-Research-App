/**
 * engine-worker.js
 * 
 * Web Worker for the Robo-Advisor micro-app.
 * Offloads heavy algorithmic calculations from the main UI thread.
 */

self.onmessage = function (e) {
    const { action, payload } = e.data;

    if (action === 'ANALYZE_FUND') {
        const { targetSchemeCode, targetFundData, peersData } = payload;

        console.log(`[Worker] Received analysis request for ${targetSchemeCode}`);

        // Mock algorithmic delay (e.g., Monte Carlo simulations, complex sorting)
        let progress = 0;
        const heavyComputation = setInterval(() => {
            progress += 20;

            // We can send progress updates back to the UI
            self.postMessage({
                status: 'PROGRESS',
                progress: progress,
                message: `Crunching data... ${progress}%`
            });

            if (progress >= 100) {
                clearInterval(heavyComputation);

                // Construct a mock strategy response
                const strategyResult = {
                    analyzedFund: targetSchemeCode,
                    current1YReturn: targetFundData ? calculateMockReturn(targetFundData) : 'N/A',
                    recommendedSwap: findMockBestPeer(peersData),
                    confidenceScore: 85,
                    reasoning: "Based on 1Y historical risk-adjusted returns and category momentum."
                };

                // Send the final result back to the main thread
                self.postMessage({
                    status: 'COMPLETE',
                    result: strategyResult
                });
            }
        }, 500); // 500ms * 5 = 2.5s simulated delay
    }
};

// --- Mock Helper Functions ---

function calculateMockReturn(fundData) {
    // In a real scenario, this would compute CAGR based on nav history
    // For now, if we have data, just return a dummy percentage
    if (fundData && fundData.data && fundData.data.length > 0) {
        return "12.5%";
    }
    return "Unknown";
}

function findMockBestPeer(peersData) {
    // In a real scenario, this would sort peers by CAGR and filter IDs
    if (peersData && peersData.length > 0) {
        // Just return the first peer as a mock suggestion
        return {
            schemeCode: peersData[0].schemeCode,
            schemeName: peersData[0].schemeName,
            expectedReturn: "15.2%"
        };
    }
    return {
        schemeCode: "000000",
        schemeName: "Generic Index Fund",
        expectedReturn: "14.0%"
    };
}
