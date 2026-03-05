const fs = require('fs');
const code = fs.readFileSync('js/api.js', 'utf8');
const appcode = fs.readFileSync('js/app.js', 'utf8');
// Just manually see what 'LIVE_FUNDS' has if it is defined anywhere.
let live_str = "Not found";
try {
  const data = fs.readFileSync('js/all_mf_funds.json', 'utf8');
  live_str = "all_mf_funds length: " + JSON.parse(data).length;
} catch(e) { live_str = e.message; }
console.log(live_str);
