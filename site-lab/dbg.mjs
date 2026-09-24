import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://127.0.0.1:4500/?for=me', { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
const tops = () => page.evaluate(() => [...document.querySelectorAll('main > section')].map(s => (s.id || s.className.split(' ')[0]) + ':' + Math.round(s.getBoundingClientRect().top + scrollY) + '/' + Math.round(s.offsetHeight)).join('  '));
console.log('me top   ', await tops());
await page.evaluate(() => { const el = document.querySelector('#price'); scrollTo({ top: el.getBoundingClientRect().top + scrollY, behavior: 'instant' }); });
await page.waitForTimeout(800);
console.log('y', await page.evaluate(() => scrollY));
await page.click('[data-aud="co"]');
for (const t of [0, 50, 200, 500, 1000, 1500]) { await page.waitForTimeout(t ? 100 : 0); }
await page.waitForTimeout(800);
console.log('y after', await page.evaluate(() => scrollY));
console.log('co tops  ', await tops());
await b.close();
