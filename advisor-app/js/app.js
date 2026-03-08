/**
 * app.js (Advisor Micro-App)
 * 
 * Main UI thread controller. Wires the DOM to the background engine worker
 * and handles isolated data storage.
 */

document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize DBs and Worker
    const engine = new Worker('./js/engine-worker.js');
    AdvisorDB.init().catch(console.error);

    // DOM Elements
    const input = document.getElementById('targetSchemeCode');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const loadingDiv = document.getElementById('loading');
    const resultsDiv = document.getElementById('advisor-results');
    const loadingText = loadingDiv.querySelector('p');

    // 2. Handle Worker Messages
    engine.onmessage = async (e) => {
        const { status, progress, message, result } = e.data;

        if (status === 'PROGRESS') {
            loadingText.textContent = message;
        } else if (status === 'COMPLETE') {
            // Hide loading
            loadingDiv.classList.add('hidden');
            analyzeBtn.disabled = false;

            // Render Results
            renderResults(result);

            // Save log to AdvisorDB
            try {
                await AdvisorDB.saveLog(result);
                console.log("Analysis saved to AdvisorDB.");
            } catch (err) {
                console.error("Failed to save log:", err);
            }
        } else if (status === 'ERROR') {
            loadingDiv.classList.add('hidden');
            analyzeBtn.disabled = false;
            resultsDiv.innerHTML = `<p style="color:#ef4444;padding:16px;">⚠ ${message}</p>`;
        }
    };

    engine.onerror = (err) => {
        console.error("Worker error:", err);
        loadingDiv.classList.add('hidden');
        analyzeBtn.disabled = false;
        resultsDiv.innerHTML = `<p style="color: #ef4444;">Engine failed to complete analysis.</p>`;
    };

    // 3. Handle User Input
    analyzeBtn.addEventListener('click', async () => {
        const code = input.value.trim();
        if (!code) {
            alert("Please enter a scheme code.");
            return;
        }

        // Reset UI
        analyzeBtn.disabled = true;
        resultsDiv.innerHTML = '';
        loadingText.textContent = 'Engine Analyzing...';
        loadingDiv.classList.remove('hidden');

        try {
            // Attempt to grab market data from the main app's cache (MFAppDB)
            console.log(`Fetching market data for ${code} from MFAppDB...`);
            const targetFundData = await AdvisorDB.getMarketData(code);

            // Fetch real category peers from MFDB cache
            let peersData = [];
            const subCategory = targetFundData?.meta?.subCategory;
            if (subCategory && typeof MFDB !== 'undefined') {
                try {
                    peersData = (await MFDB.getPeers(subCategory)) || [];
                    console.log(`Loaded ${peersData.length} peers for category: "${subCategory}"`);
                } catch (e) {
                    console.warn('Could not load peers from MFDB — proceeding without peer comparison:', e);
                }
            } else {
                console.warn('No subCategory on fund or MFDB unavailable. Peer ranking will be skipped.');
            }

            // 4. Dispatch job to worker
            engine.postMessage({
                action: 'ANALYZE_FUND',
                payload: {
                    targetSchemeCode: code,
                    targetFundData: targetFundData,
                    peersData: peersData
                }
            });

        } catch (error) {
            console.error("Failed to dispatch job:", error);
            loadingDiv.classList.add('hidden');
            analyzeBtn.disabled = false;
            resultsDiv.innerHTML = `<p style="color: #ef4444;">Internal error dispatching analysis job.</p>`;
        }
    });

    // --- Helper ---
    function renderResults(strategy) {
        // Minimal rendering
        resultsDiv.innerHTML = `
            <div class="result-card">
                <h3 style="margin-bottom:12px;color:var(--text-primary);">Diagnosis Complete</h3>
                <pre>${JSON.stringify(strategy, null, 2)}</pre>
            </div>
        `;
    }

    /* ═══════════════════════════════════════════════════════════
       SMART BRIDGE NAVIGATION (ADVISOR -> RESEARCH)
       ═══════════════════════════════════════════════════════════ */
    const navToResearchBtn = document.getElementById('nav-to-research');
    if (navToResearchBtn) {
        navToResearchBtn.addEventListener('click', async (e) => {
            e.preventDefault();

            try {
                // 1. Ping local AdvisorDB
                await AdvisorDB.init();

                // 2. Verify MFAppDB connection active (by grabbing a random key or just trying open)
                // We'll use the existing getMarketData with a dummy key just to see if it rejects
                await AdvisorDB.getMarketData('ping_check_only');

                console.log("Smart Bridge: Advisor Return Checks Passed.");

                // Navigate back
                window.location.href = '../index.html';
            } catch (err) {
                console.error("Smart Bridge Integrity Check Failed:", err);
                const modal = document.getElementById('bridge-error-modal');
                if (modal) {
                    modal.classList.add('show');
                } else {
                    alert("Warning: Recent analysis failed to save to local storage.");
                }
            }
        });
    }
});
