const axios = require('axios');

function sanitizeForGroww(name) {
    if (!name) return '';
    let s = name.replace(/-?\s*(Direct|Regular)\s*Plan\s*-?\s*Growth\s*(Option)?/ig, '')
               .replace(/-?\s*Direct\s*Growth/ig, '')
               .replace(/-?\s*Growth\s*Option/ig, '')
               .replace(/Fund/ig, '')
               .replace(/-/g, ' ')
               .replace(/\s+/g, ' ')
               .trim();
    // Use maximum 4 words to ensure broad match instead of over-constraining
    return s.split(' ').slice(0, 4).join(' ');
}

console.log(sanitizeForGroww('BAJAJ FINSERV SMALL CAP FUND - DIRECT - GROWTH'));
console.log(sanitizeForGroww('Axis Nifty Smallcap 50 Index Fund'));

