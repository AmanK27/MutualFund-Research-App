const keyword = "Equity Scheme - Mid Cap Fund"
        .replace(/Equity Scheme\s*-?\s*/ig, '')
        .replace(/Hybrid Scheme\s*-?\s*/ig, '')
        .replace(/Debt Scheme\s*-?\s*/ig, '')
        .replace(/Other Scheme\s*-?\s*/ig, '')
        .replace(/Open Ended Schemes/ig, '')
        .replace(/\bFund\b/ig, '')
        .trim();
        
console.log(`Keyword extracted: "${keyword}"`);

const allMfFunds = [
    { schemeCode: 120586, schemeName: "ICICI Prudential Midcap Fund - Direct Plan - Growth" },
    { schemeCode: 151527, schemeName: "Motilal Oswal Midcap Fund - Direct Plan - Growth" },
    { schemeCode: 118989, schemeName: "HDFC Mid-Cap Opportunities Fund - Direct Plan - Growth Option" }
];

const rawPool = allMfFunds.filter(f => {
    if (!f.schemeName) return false;
    const n = f.schemeName.toUpperCase();
    if (!n.includes(keyword.toUpperCase())) return false;
    if (n.includes('BONUS') || n.includes('ETF') || n.includes('INDEX')) return false;
    return true;
});

console.log(`Raw pool length: ${rawPool.length}`);
