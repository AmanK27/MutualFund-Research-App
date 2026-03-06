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

// We must also include advisor.js logic
const advCode = fs.readFileSync('js/advisor.js', 'utf8');
// Mocking DOM for advisor
global.document = {
    getElementById: () => ({ style: {}, textContent: '', classList: { add:()=>{}, remove:()=>{} }, innerHTML: '', value: '' })
};
global.NIFTY_50_CODE = '120716';

eval(advCode);

async function run() {
    console.log("Loading all live AMFI funds...");
    await fetchLiveAmfiCategories();
    console.log("allMfFunds size:", window.allMfFunds.length);

    try {
        console.log("Running analyzeLoss(151527)...");
        const diagnosis = await analyzeLoss('151527', -17.91);
        console.log("Diagnosis Result:");
        console.log(JSON.stringify({
            bestPeer: diagnosis.bestPeer
        }, null, 2));
    } catch (e) {
        console.error("Advisor Error:", e);
    }
}
run();
