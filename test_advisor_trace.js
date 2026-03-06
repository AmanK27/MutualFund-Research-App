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

const normCode = fs.readFileSync('js/normalizer.js', 'utf8');
const apiCode = fs.readFileSync('js/api.js', 'utf8');
const utilsCode = fs.readFileSync('js/utils.js', 'utf8');

global.CacheManager = {
    get: async () => null,
    set: async () => {},
    isCacheValid: () => false
};

eval(utilsCode);
eval(normCode);
eval(apiCode);

const advCode = fs.readFileSync('js/advisor.js', 'utf8');
global.document = {
    getElementById: () => ({ style: {}, textContent: '', classList: { add:()=>{}, remove:()=>{} }, innerHTML: '', value: '' })
};
global.NIFTY_50_CODE = '120716';
eval(advCode);

async function run() {
    console.log("Loading all live AMFI funds...");
    await fetchLiveAmfiCategories();
    
    console.log("Analyzing Loss for 151527...");
    
    // Override calculate52WeekDrawdown to avoid undefined errors
    global.calculate52WeekDrawdown = () => -17.91; 
    
    // Override getPeerRanking temporarily to trace its arguments
    const originalGetPeerRanking = getPeerRanking;
    global.getPeerRanking = async (cat, code, subCat) => {
        console.log("==== getPeerRanking CALLED WITH ====");
        console.log("categoryString:", cat);
        console.log("currentSchemeCode:", code);
        console.log("targetSubCategory:", subCat);
        console.log("====================================");
        return originalGetPeerRanking(cat, code, subCat);
    };

    const diagnosis = await analyzeLoss('151527', -17.91);
    console.log("\n\nFINAL RESULT:", JSON.stringify(diagnosis.bestPeer || "N/A", null, 2));
}

run();
