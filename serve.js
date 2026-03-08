const { spawn, execSync } = require('child_process');
const os = require('os');

// Function to find the LAN IP address
function getLanIp() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            // Skip over internal (i.e. 127.0.0.1) and non-ipv4 addresses
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost'; // Fallback
}

const ip = getLanIp();
const port = 3000;
const url = `http://${ip}:${port}`;

console.log(`\n🌐 Serving on LAN IP: ${url}\n`);

// Start the server using 'serve' module
const server = spawn('npx', ['serve', '-l', port.toString()], { stdio: 'inherit' });

// Wait a brief moment for the server to start, then automatically open the browser
setTimeout(() => {
    console.log(`🚀 Opening browser at ${url}...`);
    let command;
    switch (process.platform) {
        case 'darwin': command = `open ${url}`; break;   // Mac
        case 'win32': command = `start ${url}`; break;   // Windows
        default: command = `xdg-open ${url}`; break;     // Linux
    }
    try {
        execSync(command);
    } catch (e) {
        console.error('Failed to open browser automatically.');
    }
}, 1000);

// Handle process exit
process.on('SIGINT', () => {
    server.kill('SIGINT');
    process.exit();
});
