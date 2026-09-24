// The signature and the peak, driven for real: press the pill mid-page and
// photograph the scan; press Send in the demo; then check, at several sizes
// and every phase, that nothing inside the demo window leaves its box.
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const OUT = 'shots/switch';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const errors = [];
async function open(w, h, q = '?for=me') {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on('pageerror', e => errors.push(`${w}x${h} pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`${w}x${h} console: ${m.text()}`); });
  await page.goto('http://127.0.0.1:4500/' + q, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  return page;
}
const scrollTo = (page, sel, frac) => page.evaluate(([sel, frac]) => {
  const el = document.querySelector(sel), top = el.getBoundingClientRect().top + scrollY;
  scrollTo({ top: frac == null ? top : top + (el.offsetHeight - innerHeight) * frac, behavior: 'instant' });
}, [sel, frac]);

// 1. the scan, over the hero and over the pricing
for (const [where, sel] of [['hero', '.hero'], ['price', '#price'], ['trust', '#trust']]) {
  const page = await open(1440, 900);
  await scrollTo(page, sel);
  await page.waitForTimeout(900);
  const before = await page.evaluate(() => scrollY);
  await page.click('[data-aud="co"]');
  for (const t of [120, 330, 560, 1300]) {
    await page.waitForTimeout(t === 120 ? 120 : t - [120, 330, 560, 1300][[120, 330, 560, 1300].indexOf(t) - 1]);
    await page.screenshot({ path: `${OUT}/${where}-${t}.png` });
  }
  const after = await page.evaluate(() => ({
    y: scrollY, mode: document.documentElement.dataset.for, url: location.search,
    h1: document.querySelector('.hero h1 .for-co').getBoundingClientRect().height > 0,
    stored: localStorage.getItem('myynd.for'),
    held: [...document.querySelectorAll('.for-me,.for-co')].filter(e => e.style.display).length
  }));
  console.log(where, 'scroll before', before, 'after', JSON.stringify(after));
  await page.close();
}

// 2. the peak: press Send
{
  const page = await open(1440, 900);
  await scrollTo(page, '#demo', .86);
  await page.waitForTimeout(900);
  await page.click('.win__main.for-me [data-send]');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/sent-me.png` });
  console.log('sent:', await page.evaluate(() => document.querySelector('.win__main.for-me .sent').textContent));
  await page.close();
}

// 3. nothing leaves the window, at any size, in any phase
const sizes = [[1440, 900], [1280, 720], [1024, 768], [768, 1024], [390, 844], [375, 667], [1920, 1080]];
for (const [w, h] of sizes) {
  for (const q of ['?for=me', '?for=company']) {
    const page = await open(w, h, q);
    for (const f of [0.1, 0.2, 0.3, 0.4, 0.55, 0.65, 0.8, 0.95]) {
      await scrollTo(page, '#demo', f);
      await page.waitForTimeout(650);
      const bad = await page.evaluate(() => {
        const out = [];
        const win = document.querySelector('.win').getBoundingClientRect();
        const copy = document.querySelector('.peak__copy');
        document.querySelectorAll('.win__main').forEach(main => {
          if (!main.offsetParent) return;
          main.querySelectorAll('.pane').forEach(pane => {
            if (getComputedStyle(pane).opacity < .5) return;
            const pr = pane.getBoundingClientRect();
            pane.querySelectorAll('*').forEach(el => {
              if (!el.offsetParent || el.closest('.draft:not(.row--reply.is-open .draft)')) return;
              const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || +cs.opacity === 0) return;
              if (el.closest('[data-at]:not(.is-in)')) return;
              const r = el.getBoundingClientRect();
              if (r.height && (r.bottom > pr.bottom - 2 || r.right > pr.right + 1)) out.push(el.className || el.tagName);
            });
          });
        });
        // the copy above the window must not run into it
        const beats = [...document.querySelectorAll('.peak__copy .beat')].filter(b => b.offsetParent && +getComputedStyle(b).opacity > .5);
        beats.forEach(b => { const r = b.getBoundingClientRect(); if (innerWidth <= 900 && r.bottom > win.top - 4) out.push('beat over window ' + Math.round(r.bottom - win.top)); });
        if (win.bottom > innerHeight - 70) out.push('window under the pill ' + Math.round(win.bottom - (innerHeight - 70)));
        return [...new Set(out)].slice(0, 6);
      });
      if (bad.length) console.log(`${w}x${h} ${q} p=${f}:`, bad.join(' | '));
    }
    await page.close();
  }
}
console.log('errors', errors.length ? errors.join('\n') : 'none');
await browser.close();
