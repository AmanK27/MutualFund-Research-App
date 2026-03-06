const fs = require('fs');
global.window = {};

const normCode = fs.readFileSync('js/normalizer.js', 'utf8');
const apiCode = fs.readFileSync('js/api.js', 'utf8');
const utilsCode = fs.readFileSync('js/utils.js', 'utf8');

global.CacheManager = { get: async () => null, set: async () => {}, isCacheValid: () => false };
eval(utilsCode);
eval(normCode);
eval(apiCode);

global.fetch = async (url) => {
    return { ok: true, json: async () => {
        if (url.includes('search')) {
            return [{ schemeCode: 120586, schemeName: "ICICI Prudential Midcap Fund - Direct Plan - Growth" }];
        }
        return {
            meta: { scheme_category: "Equity Scheme - Mid Cap Fund", scheme_name: "ICICI Prudential Midcap Fund - Direct Plan - Growth" },
            data: [{date: "01-01-2023", nav: "100"}, {date: "01-01-2024", nav: "125"}]
        }
    }};
};

window.allMfFunds = [
    { schemeCode: 120586, schemeName: "ICICI Prudential Midcap Fund - Direct Plan - Growth" },
];
global.getNavHistory = async (code) => {
    return [
        { date: new Date('2023-01-01'), nav: 100 },
        { date: new Date('2024-01-01'), nav: 125 } 
    ]; 
};
global.getCAGR = () => 0.25;

async function run() {
    console.log("Calling getPeerRanking...");
    const peers = await getPeerRanking("Equity", "151527", "Mid Cap Fund");
    console.log("RESULT:", peers.length, "peers");
}
run();
