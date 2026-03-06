const fs = require('fs');

global.window = {};

// Mock fetch
global.fetch = async (url) => {
    try {
        const response = await import('node-fetch').then(m => m.default(url));
        return response;
    } catch (e) {
        if (typeof process !== 'undefined' && process.versions && process.versions.node) {
            const [major] = process.versions.node.split('.');
            if (parseInt(major) >= 18) {
                return fetch(url);
            }
        }
        throw e;
    }
};

const normCode = fs.readFileSync('js/normalizer.js', 'utf8');
const apiCode = fs.readFileSync('js/api.js', 'utf8');
const utilsCode = fs.readFileSync('js/utils.js', 'utf8');
const advCode = fs.readFileSync('js/advisor.js', 'utf8');

global.CacheManager = {
    get: async () => null,
    set: async () => { },
    isCacheValid: () => false
};

global.document = {
    getElementById: () => ({ style: {}, textContent: '', classList: { add: () => { }, remove: () => { } }, innerHTML: '', value: '' })
};
global.NIFTY_50_CODE = '120716';

eval(utilsCode);
eval(normCode);
eval(apiCode);
eval(advCode);

window.allMfFunds = [
    { schemeCode: 120586, schemeName: "ICICI Prudential Midcap Fund - Direct Plan - Growth" },
    { schemeCode: 151527, schemeName: "Motilal Oswal Midcap Fund - Direct Plan - Growth" },
    { schemeCode: 118989, schemeName: "HDFC Mid-Cap Opportunities Fund - Direct Plan - Growth Option" }
];

// Provide empty function for the UI part so it doesn't crash on document.createElement mock, etc.
global.calculate52WeekDrawdown = () => -17.91;

async function run() {
    try {
        console.log("Mocking getNavHistory for speed...");
        global.getNavHistory = async (code) => {
            return [
                { date: new Date('2023-01-01'), nav: 100 },
                { date: new Date('2024-01-01'), nav: code === '120586' ? 125 : 120 }
            ];
        };
        global.getCAGR = (history, years) => history[1].nav === 125 ? 0.25 : 0.20;

        console.log("Analyzing...");
        const diagnosis = await analyzeLoss('151527', -17.91);
        console.log("Best Peer:", diagnosis?.bestPeer);
    } catch (e) {
        console.error("Error:", e);
    }
}
run();
