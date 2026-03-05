const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  
  // Go to the local app
  await page.goto('http://localhost:8081', { waitUntil: 'networkidle0' });
  
  // Wait for portfolio to load
  try {
      await page.waitForFunction(() => {
          const el = document.getElementById('portfolioEmptyState');
          return el && el.style.display === 'none';
      }, { timeout: 10000 });
  } catch (e) {
      console.log('Timeout waiting for portfolio to load');
  }
  
  // Click suggestions tab
  await page.click('#tabSuggestions');
  
  // Wait for diagnosis content to stop loading
  try {
      await page.waitForFunction(() => {
          const el = document.getElementById('swapDiagnosisContent');
          return el && !el.textContent.includes('Loading analysis');
      }, { timeout: 10000 });
      // wait a bit for charts
      await new Promise(r => setTimeout(r, 1000));
  } catch (e) {
      console.log('Timeout waiting for robo advisor');
  }
  
  await page.screenshot({ path: 'robo_fix_ss.png', fullPage: true });
  await browser.close();
  console.log('Screenshot saved to robo_fix_ss.png');
})();
