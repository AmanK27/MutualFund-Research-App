/**
 * ui.js - Dedicated UI handlers, modals, and rendering logic.
 */

const UI = {
    /**
     * Show a transient toast message
     */
    showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        if (!container) {
            console.warn("Toast container not found, fallback to alert:", message);
            alert(message);
            return;
        }

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;

        container.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 10);

        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    },

    /**
     * Switch between app states (dashboard, loading, welcome, etc.)
     */
    showState(state) {
        // When navigating away from the fund dashboard, clear stale async data
        const fundDashboard = document.getElementById('fundDashboard');
        const currentlyOnDashboard = fundDashboard && fundDashboard.style.display === 'block';

        if (currentlyOnDashboard && state !== 'dashboard') {
            if (typeof resetDashboardState === 'function') {
                resetDashboardState();
            }
        }

        // List of all possible state elements
        const states = {
            'welcome': 'welcomeState',
            'loading': 'loadingState',
            'dashboard': 'fundDashboard',
            'table': 'tableView',
            'portfolio': 'portfolioView',
            'compare': 'compareView',
            'sip-forecast': 'sipForecastState',
            'searchResults': 'searchResultsState'
        };

        Object.keys(states).forEach(s => {
            const el = document.getElementById(states[s]);
            if (el) el.style.display = (s === state) ? 'block' : 'none';
        });

        // Feature Toggle: show topFunds panel only on welcome screen
        const topFunds = document.querySelector('.top-funds-panel');
        const sipCard = document.querySelector('.sip-card');

        if (state === 'welcome') {
            if (topFunds) topFunds.style.display = 'block';
            if (sipCard) sipCard.style.display = 'none';
        } else if (state === 'table') {
            if (topFunds) topFunds.style.display = 'none';
            if (sipCard) sipCard.style.display = 'flex';
        } else {
            if (topFunds) topFunds.style.display = 'none';
            if (sipCard) sipCard.style.display = 'none';
        }

        // Toggle search bar visibility
        const searchBar = document.getElementById('searchBar');
        if (searchBar) {
            searchBar.style.display = (['welcome', 'dashboard'].includes(state)) ? 'flex' : 'none';
        }

        // Manage active state of special nav buttons
        const pfBtn = document.getElementById('portfolioNavBtn');
        const compBtn = document.getElementById('compareNavBtn');
        const forecastBtn = document.getElementById('forecastNavBtn');

        if (state === 'portfolio') {
            if (pfBtn) pfBtn.classList.add('active');
            if (compBtn) compBtn.classList.remove('active');
            if (forecastBtn) forecastBtn.classList.remove('active');
            document.querySelectorAll('.category-item').forEach(el => el.classList.remove('active'));
        } else if (state === 'compare') {
            if (compBtn) compBtn.classList.add('active');
            if (pfBtn) pfBtn.classList.remove('active');
            if (forecastBtn) forecastBtn.classList.remove('active');
            document.querySelectorAll('.category-item').forEach(el => el.classList.remove('active'));
        } else if (state === 'sip-forecast') {
            if (forecastBtn) forecastBtn.classList.add('active');
            if (pfBtn) pfBtn.classList.remove('active');
            if (compBtn) compBtn.classList.remove('active');
            document.querySelectorAll('.category-item').forEach(el => el.classList.remove('active'));
        } else {
            if (pfBtn) pfBtn.classList.remove('active');
            if (compBtn) compBtn.classList.remove('active');
            if (forecastBtn) forecastBtn.classList.remove('active');
        }
    },

    /**
     * Restore Category Peers & Rank UI logic
     */
    async initPeerRanking(fund) {
        const card = document.getElementById('peerRankingCard');
        const listEl = document.getElementById('peerRankingList');
        const loading = document.getElementById('peerRankingLoading');
        const label = document.getElementById('peerCategoryLabel');
        const rankValueEl = document.getElementById('categoryRankValue');

        if (!card || !listEl || !loading) return;

        // Reset UI
        card.style.display = 'flex';
        listEl.innerHTML = '';
        loading.style.display = 'block';
        if (rankValueEl) rankValueEl.textContent = '—';

        const category = fund?.meta?.subCategory;
        const currentCode = String(fund?.identifiers?.schemeCode || '');

        if (label) {
            label.textContent = (window.Normalizer)
                ? Normalizer.formatSubCategory(category)
                : (category || '—');
        }

        try {
            // Fetch peers from IndexedDB using strict sub-category
            const peers = await MFDB.getPeers(category) || [];
            loading.style.display = 'none';

            if (peers.length === 0) {
                listEl.innerHTML = '<div style="color:var(--text-muted);font-size:12px;text-align:center;padding:10px;">No peer data available.</div>';
                if (rankValueEl) rankValueEl.textContent = 'Not Ranked';
                return;
            }

            // Sort by 1Y CAGR (descending)
            peers.sort((a, b) => (parseFloat(b.cagr1y) || 0) - (parseFloat(a.cagr1y) || 0));

            // Calculate current fund rank
            let myRank = peers.findIndex(p => String(p.schemeCode) === currentCode);

            // Fallback: If cache completely misses the current fund, approximate it using known app session data
            if (myRank === -1 && typeof window.getCAGR === 'function' && window.fullNavData) {
                const fundCagr = getCAGR(window.fullNavData, 1);
                if (fundCagr !== null) {
                    peers.push({ schemeCode: currentCode, cagr1y: fundCagr, schemeName: fund.meta?.cleanName || 'Current Fund' });
                    peers.sort((a, b) => (parseFloat(b.cagr1y) || 0) - (parseFloat(a.cagr1y) || 0));
                    myRank = peers.findIndex(p => String(p.schemeCode) === currentCode);
                }
            }

            if (rankValueEl) {
                rankValueEl.textContent = (myRank !== -1) ? `#${myRank + 1} in Category` : 'Not Ranked';
            }

            // Render top 5 peers
            const top5 = peers.slice(0, 5);
            let html = '';

            top5.forEach((peer, idx) => {
                const isCurrent = String(peer.schemeCode) === currentCode;
                const highlightClass = isCurrent ? 'peer-highlight' : '';

                const rawCagr = parseFloat(peer.cagr1y) || 0;
                // Scale fractional values up to percentage if they are decimals
                const cagr = (rawCagr <= 5 && rawCagr >= -5) ? rawCagr * 100 : rawCagr;

                html += `
                    <div class="peer-item ${highlightClass}" onclick="loadFund('${peer.schemeCode}')" title="Click to view details">
                        <div class="peer-info">
                            <span class="peer-rank">#${idx + 1}</span>
                            <span class="peer-name">${escapeHtml(peer.schemeName || 'Unknown')}</span>
                        </div>
                        <div class="peer-metric">
                            <span class="peer-metric-value ${cagr >= 0 ? 'stat-positive' : 'stat-negative'}">
                                ${cagr.toFixed(2)}%
                            </span>
                        </div>
                    </div>
                `;
            });

            // If current fund is not in top 5, append it at the bottom
            if (myRank >= 5) {
                const rawCagr = parseFloat(peers[myRank].cagr1y) || 0;
                const myCagr = (rawCagr <= 5 && rawCagr >= -5) ? rawCagr * 100 : rawCagr;

                html += `
                    <div style="text-align:center;color:var(--text-muted);font-size:14px;margin:4px 0;">⋮</div>
                    <div class="peer-item peer-highlight" onclick="loadFund('${currentCode}')">
                        <div class="peer-info">
                            <span class="peer-rank">#${myRank + 1}</span>
                            <span class="peer-name">${escapeHtml(fund.meta?.cleanName || 'Current Fund')}</span>
                        </div>
                        <div class="peer-metric">
                            <span class="peer-metric-value ${myCagr >= 0 ? 'stat-positive' : 'stat-negative'}">${myCagr.toFixed(2)}%</span>
                        </div>
                    </div>
                `;
            }

            listEl.innerHTML = html;

        } catch (err) {
            console.error("Peer rendering failed:", err);
            loading.style.display = 'none';
            listEl.innerHTML = '<div style="color:var(--red);font-size:12px;text-align:center;">Error loading.</div>';
        }
    }
};

window.showToast = UI.showToast;
window.showState = UI.showState;
