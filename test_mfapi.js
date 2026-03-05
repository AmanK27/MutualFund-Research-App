const codes = [127042, 119619, 120465, 120716, 118272, 119062, 118989, 120505, 120586, 118778, 118834, 118536, 118550, 118672, 120152, 119775, 120272, 120822, 119598, 121008];
async function test() {
    const promises = codes.map(c => fetch('https://api.mfapi.in/mf/' + c).then(r => r.ok));
    const res = await Promise.all(promises);
    console.log("Successes: ", res.filter(x => x).length, "/", codes.length);
}
test();
