const fs = require('fs');

// Mock browser objects
global.window = {};
global.fetch = async (url) => {
    try {
        const response = await import('node-fetch').then(m => m.default(url));
        return response;
    } catch (e) {
        // use native fetch if node > 18
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

// Simple mock for CacheManager
global.CacheManager = {
    get: async () => null,
    set: async () => { },
    isCacheValid: () => false
};

// Evaluate the scripts
eval(normCode);
eval(apiCode);

async function run() {
    try {
        const res = await aggregateFundDetails('120586', 'ICICI Prudential Midcap Fund');
        console.log("Success:", !!res);
        if (!res) console.log("Returned null!");
        if (res && (!res.nav || !res.nav.history)) console.log("Missing nav.history!");
    } catch (e) {
        console.error("Error:", e);
    }
}
run();
