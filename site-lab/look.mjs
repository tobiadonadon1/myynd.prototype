// Quick look: headless Chrome, a list of scroll positions, one screenshot each,
// every console error printed, and any element wider than the viewport named.
// node look.mjs [width] [height] [mode] [outdir] [positions...]
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const [W = '1440', H = '900', MODE = 'me', OUT = 'shots/look', ...POS] = process.argv.slice(2);
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage({ viewport: { width: +W, height: +H }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto('http://127.0.0.1:4500/' + (MODE === 'co' ? '?for=company' : '?for=me'), { waitUntil: 'networkidle' });
await page.waitForTimeout(900);

const positions = POS.length ? POS : ['top', 'morning', 'demo:0.1', 'demo:0.38', 'demo:0.62', 'demo:0.9', 'trust', 'worth', 'price', 'faq', 'end'];
for (const pos of positions) {
  await page.evaluate((pos) => {
    const [name, frac] = pos.split(':');
    if (name === 'top') return scrollTo(0, 0);
    if (name === 'end') return scrollTo(0, document.documentElement.scrollHeight);
    const el = document.getElementById(name) || document.querySelector('.' + name);
    const top = el.getBoundingClientRect().top + scrollY;
    if (frac) return scrollTo(0, top + (el.offsetHeight - innerHeight) * +frac);
    scrollTo(0, top);
  }, pos);
  await page.waitForTimeout(1100);
  const file = `${OUT}/${pos.replace(':', '-')}.png`;
  await page.screenshot({ path: file });
  console.log('shot', file);
}
const wide = await page.evaluate(() => {
  const out = [];
  const vw = document.documentElement.clientWidth;
  document.querySelectorAll('body *').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.width && (r.right > vw + 1 || r.left < -1) && getComputedStyle(el).position !== 'fixed') {
      if (!el.closest('.field, .flame, .scan')) out.push(el.tagName.toLowerCase() + '.' + [...el.classList].join('.') + ' ' + Math.round(r.left) + '..' + Math.round(r.right));
    }
  });
  return { vw, scrollW: document.documentElement.scrollWidth, list: out.slice(0, 12) };
});
console.log('overflow', JSON.stringify(wide));
console.log('errors', errors.length ? errors.join('\n') : 'none');
await browser.close();
