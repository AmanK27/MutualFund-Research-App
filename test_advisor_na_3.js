const fs = require('fs');

global.window = {
    allMfFunds: [
        { schemeCode: 120586, schemeName: "ICICI Prudential Midcap Fund - Direct Plan - Growth" },
        { schemeCode: 151527, schemeName: "Motilal Oswal Midcap Fund - Direct Plan - Growth" },
        { schemeCode: 118989, schemeName: "HDFC Mid-Cap Opportunities Fund - Direct Plan - Growth Option" }
    ]
};

global.fetch = async (url) => {
    try {
        console.log("Fetching:", url);
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
const utilsCode = fs.readFileSync('js/utils.js', 'utf8');

global.CacheManager = {
    get: async () => null,
    set: async () => {},
    isCacheValid: () => false
};

eval(utilsCode);
eval(normCode);
eval(apiCode);

async function run() {
    console.log("Starting test...");
    const peers = await getPeerRanking("Equity Scheme - Mid Cap Fund", "151527", "Equity Scheme - Mid Cap Fund");
    console.log("Peers found:", peers.length);
}
run().then(() => console.log("Done")).catch(e => console.error(e));
