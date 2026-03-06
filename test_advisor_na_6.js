const fs = require('fs');
global.window = {
    allMfFunds: [
        { schemeCode: 120586, schemeName: "ICICI Prudential Midcap Fund - Direct Plan - Growth" },
        { schemeCode: 151527, schemeName: "Motilal Oswal Midcap Fund - Direct Plan - Growth" },
        { schemeCode: 118989, schemeName: "HDFC Mid-Cap Opportunities Fund - Direct Plan - Growth Option" }
    ]
};
global.CacheManager = { get: async()=>null, set: async()=>{}, isCacheValid: ()=>false };

const apiCode = fs.readFileSync('js/api.js', 'utf8');
const normCode = fs.readFileSync('js/normalizer.js', 'utf8');
const utilsCode = fs.readFileSync('js/utils.js', 'utf8');

eval(utilsCode);
eval(normCode);
eval(apiCode);

global.getNavHistory = async (code) => {
    return [
        { date: new Date('2023-01-01'), nav: 100 },
        { date: new Date('2024-01-01'), nav: code === '120586' ? 125 : 120 } // ICICI wins
    ]; 
};
global.getCAGR = (history, years) => history[1].nav === 125 ? 0.25 : 0.20;

global.fetch = async (url) => {
    if (url.includes('search?q=')) {
        return {
            ok: true,
            json: async () => ([
                { schemeCode: 120586, schemeName: "ICICI Prudential Midcap Fund - Direct Plan - Growth" },
                { schemeCode: 118989, schemeName: "HDFC Mid-Cap Opportunities Fund - Direct Plan - Growth Option" }
            ])
        };
    }
    
    return { 
        ok: true, 
        json: async () => ({ 
            meta: { 
                scheme_category: "Equity Scheme - Mid Cap Fund", 
                scheme_name: url.includes('120586') ? "ICICI Prudential Midcap Fund - Direct Plan - Growth" : "Other Fund" 
            }, 
            data: [{date: "01-01-2023", nav: "100"}, {date: "01-01-2024", nav: "125"}] 
        }) 
    };
};

async function run() {
    const peers = await getPeerRanking("Equity Scheme - Mid Cap Fund", "151527", "Mid Cap Fund");
    console.log("Result:", peers);
}
run();
