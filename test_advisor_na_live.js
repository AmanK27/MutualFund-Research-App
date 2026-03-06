const fs = require('fs');

global.window = {};

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
    console.log("Loading all live AMFI funds...");
    await fetchLiveAmfiCategories();
    
    console.log("allMfFunds size:", window.allMfFunds.length);
    console.log("Calling fetchCategoryPeers...");
    // The target subcategory format we used (from Normalizer) is "Mid Cap Fund"
    // Motilal Oswal Midcap is 151527
    const result = await fetchCategoryPeers("Mid Cap Fund", 151527, "Mid Cap Fund");
    console.log("FINAL RESULT:", JSON.stringify(result, null, 2));
}

run();
