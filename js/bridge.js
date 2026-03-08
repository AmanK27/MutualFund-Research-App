/**
 * bridge.js - Isolated Smart Bridge navigation logic
 * This file handles pre-flight verification before moving from Research App to Advisor App.
 */

document.addEventListener('DOMContentLoaded', () => {
    const navBtn = document.getElementById('nav-to-advisor');
    if (!navBtn) return;

    navBtn.addEventListener('click', async (e) => {
        e.preventDefault();

        // 1. Check Session / Portfolio ID
        const portfolioData = localStorage.getItem('mf_portfolio_txns');
        if (!portfolioData || JSON.parse(portfolioData).length === 0) {
            showBridgeError("Cannot launch Advisor: Your portfolio is empty or missing. Please add funds to your portfolio first.");
            return;
        }

        // 2. Data Integrity Check (MFDB)
        if (typeof MFDB === 'undefined') {
            showBridgeError("Cannot launch Advisor: MFDB is missing. System may be corrupted.");
            return;
        }

        try {
            console.log("Smart Bridge: Initiating pre-flight verification...");
            await MFDB.init();

            // Check if we have any synced data
            const state = await MFDB.getSyncState();
            if (!state || state.status !== 'COMPLETE') {
                showBridgeError("Cannot launch Advisor: Market data is not yet synced for today. Please run Daily Sync first.");
                return;
            }

            console.log("Smart Bridge: MFDB Integrity Check Passed.");

            // Short delay to ensure browser doesn't block the rapid context change
            setTimeout(() => {
                window.location.href = './advisor-app/index.html';
            }, 150);
        } catch (err) {
            console.error("Smart Bridge Integrity Check Failed:", err);
            showBridgeError("Cannot launch Advisor: Core market data is missing or corrupted. Please refresh your portfolio first.");
        }
    });
});

function showBridgeError(messageMsg) {
    const modal = document.getElementById('bridge-error-modal');
    const msgEl = document.getElementById('bridge-error-msg');

    if (modal && msgEl) {
        msgEl.textContent = messageMsg;
        modal.classList.add('show');
    } else {
        // Fallback to standard toast if modal fails
        if (typeof showToast === 'function') {
            showToast(messageMsg, 'error');
        } else {
            alert(messageMsg);
        }
    }
}

// Expose to global if needed
window.showBridgeError = showBridgeError;
