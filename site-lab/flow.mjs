// Switch at the top, then scroll down: everything of the new audience must
// arrive visible. Then the keyboard: Tab reaches the pill, arrows switch it.
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://127.0.0.1:4500/?for=me', { waitUntil: 'networkidle' });
await p.waitForTimeout(500);
await p.click('[data-aud="co"]');
await p.waitForTimeout(1200);
for (const sel of ['.morning', '#trust', '#worth', '#price', '#faq']) {
  await p.evaluate(s => { const el = document.querySelector(s); scrollTo({ top: el.getBoundingClientRect().top + scrollY - 40, behavior: 'instant' }); }, sel);
  await p.waitForTimeout(900);
  const hidden = await p.evaluate(s => [...document.querySelectorAll(s + ' .for-co[data-sc-in], ' + s + ' .for-co [data-sc-in]')]
    .filter(e => { const r = e.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0 && +getComputedStyle(e).opacity < .9; })
    .map(e => e.className + ' ' + getComputedStyle(e).opacity), sel);
  console.log(sel, hidden.length ? 'NOT VISIBLE: ' + hidden.join(', ') : 'ok');
}
// keyboard
await p.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
await p.focus('[data-aud="co"]');
await p.keyboard.press('ArrowLeft');
await p.waitForTimeout(1100);
console.log('after ArrowLeft:', await p.evaluate(() => [document.documentElement.dataset.for, document.activeElement.dataset.aud, document.querySelector('[data-aud="me"]').getAttribute('aria-checked')].join(' ')));
// tab order from the top: what gets focus first
await p.evaluate(() => document.activeElement.blur());
const order = [];
for (let i = 0; i < 8; i++) { await p.keyboard.press('Tab'); order.push(await p.evaluate(() => (document.activeElement.textContent || document.activeElement.getAttribute('aria-label') || document.activeElement.tagName).trim().replace(/\s+/g, ' ').slice(0, 28))); }
console.log('tab:', order.join(' > '));
console.log('errors', errs.length ? errs : 'none');
await b.close();
