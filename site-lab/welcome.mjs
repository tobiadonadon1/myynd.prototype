import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errs = [];
for (const [w, h] of [[1440, 900], [390, 844]]) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://127.0.0.1:4500/welcome.html', { waitUntil: 'networkidle' });
  await p.waitForTimeout(900);
  await p.screenshot({ path: `shots/welcome-${w}.png` });
  console.log(w, 'scrollW', await p.evaluate(() => document.documentElement.scrollWidth));
}
console.log('errors', errs.length ? errs : 'none');
await b.close();
