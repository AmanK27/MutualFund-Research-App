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
        const sipCard = document.querySelector('.sip-calculator-card');

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
    }
};

window.showToast = UI.showToast;
window.showState = UI.showState;
