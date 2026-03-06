const fs = require('fs');

// Mock browser objects
global.window = {
    allMfFunds: [
        { schemeCode: 120586, schemeName: "ICICI Prudential Midcap Fund - Direct Plan - Growth" },
        { schemeCode: 151527, schemeName: "Motilal Oswal Midcap Fund - Direct Plan - Growth" },
        { schemeCode: 118989, schemeName: "HDFC Mid-Cap Opportunities Fund - Direct Plan - Growth Option" }
    ]
};

global.fetch = async (url) => {
    try {
        const response = await import('node-fetch').then(m => m.default(url));
        return response;
    } catch(e) {
        if (typeof process !== 'undefined' && process.versions && process.versions.node) {
             const [major] = process.versions.node.split('.');
             if (parseInt(major) >= 18) {
                 return fetch(url);
             }
        }
        throw e;
    }
};

const apiCode = fs.readFileSync('js/api.js', 'utf8');
const normCode = fs.readFileSync('js/normalizer.js', 'utf8');

global.CacheManager = {
    get: async () => null,
    set: async () => {},
    isCacheValid: () => false
};

eval(normCode);
eval(apiCode);

async function run() {
    try {
        console.log("Starting test...");
        // Motilal Oswal Midcap Fund is 151527
        // Let's call getPeerRanking directly for "Equity Scheme - Mid Cap Fund"
        const peers = await getPeerRanking("Equity Scheme - Mid Cap Fund", "151527", "Equity Scheme - Mid Cap Fund");
        console.log("Peers found:", peers.length);
        console.log(JSON.stringify(peers, null, 2));
    } catch (e) {
        console.error("Error:", e);
    }
}
run();
