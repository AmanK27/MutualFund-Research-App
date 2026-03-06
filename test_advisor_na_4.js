const fs = require('fs');
global.window = {
    allMfFunds: [
        { schemeCode: 120586, schemeName: "ICICI Prudential Midcap Fund - Direct Plan - Growth" },
        { schemeCode: 151527, schemeName: "Motilal Oswal Midcap Fund - Direct Plan - Growth" },
        { schemeCode: 118989, schemeName: "HDFC Mid-Cap Opportunities Fund - Direct Plan - Growth Option" }
    ]
};
global.CacheManager = { get: async()=>null, set: async()=>{} };

const apiCode = fs.readFileSync('js/api.js', 'utf8');
const normCode = fs.readFileSync('js/normalizer.js', 'utf8');

eval(normCode);
eval(apiCode);

// mock getNavHistory to instantly return fake data
global.getNavHistory = async (code) => {
    return [
        { date: new Date('2023-01-01'), nav: 100 },
        { date: new Date('2024-01-01'), nav: 120 }
    ]; // 20% CAGR
};
// mock getCAGR
global.getCAGR = (history, years) => 0.20;

global.fetch = async (url) => {
    console.log("Mock fetching:", url);
    return { ok: true, json: async () => ({ meta: { scheme_category: "Equity Scheme - Mid Cap Fund", scheme_name: "Mocked Fund - Direct - Growth" }, data: [{nav:"100", date:"01-01-2024"}] }) };
};

async function run() {
    const peers = await getPeerRanking("Equity Scheme - Mid Cap Fund", "151527", "Mid Cap Fund");
    console.log("Result:", peers);
}
run();
