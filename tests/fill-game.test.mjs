/**
 * fill-game.test.mjs — Integration tests for fillGame.js
 *
 * Real lerp animation + screenshots + all functional coverage.
 *
 * Run: node tests/fill-game.test.mjs
 */

import path from 'path';
import { fileURLToPath } from 'url';
import {
  launchBrowser, createFileServer, makeRunner,
  waitForScrollSettled, nav, reload, screenshot,
} from './lib/testUtils.mjs';
import {
  runScrollInvariants, assertNoFutureBlanks,
  runLayoutChecks, runSingleBlankEdgeCases,
} from './lib/paragraphGameTests.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');
const SS_DIR    = path.join(__dirname, 'screenshots');

const PARAGRAPH      = 'The [quick] brown [fox] jumps [over] the [lazy] [dog] and the [cat] sat on the [mat] near the [tree] beside the [river] under the [sky].';
const SINGLE_BLANK_P = 'The quick brown [fox] jumped over the lazy dog and kept running.';

function makeHTML(paragraph, { headerHeight = 0 } = {}) {
  const hdrCSS = headerHeight ? `#hdr{height:${headerHeight}px;background:#222;flex-shrink:0}` : '';
  const hdrEl  = headerHeight ? '<div id="hdr"></div>' : '';
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/style.css">
<style>html,body{height:100%;margin:0}#root{display:flex;flex-direction:column;height:100dvh}${hdrCSS}</style>
</head><body>
<div id="root">${hdrEl}
  <div id="m" style="flex:1;min-height:0;display:flex;flex-direction:column"></div>
</div>
<script type="module">
import { createFillGame } from '/src/components/fillGame.js';
window.__results=[]; window.__game=null;
const g = createFillGame({ paragraph:${JSON.stringify(paragraph)}, wordBankSize:6, onSubmit:(a,f)=>window.__results.push({answers:a,finished:f}) });
window.__game=g; document.getElementById('m').appendChild(g.el);
</script></body></html>`;
}

// Unconstrained container: no height/min-height on root — simulates mobile Safari
// where min-height does not propagate definite heights through flex chains.
// In this layout, the para-wrap is initially content-sized (< max-height), which
// used to cause the scroll init to measure the wrong wrapH and produce no scroll.
function makeUnconstrainedHTML(paragraph) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/style.css">
<style>html,body{height:100%;margin:0}#root{display:flex;flex-direction:column}</style>
</head><body>
<div id="root">
  <div id="m" style="flex:1;min-height:0;display:flex;flex-direction:column"></div>
</div>
<script type="module">
import { createFillGame } from '/src/components/fillGame.js';
window.__results=[]; window.__game=null;
const g = createFillGame({ paragraph:${JSON.stringify(paragraph)}, wordBankSize:6, onSubmit:(a,f)=>window.__results.push({answers:a,finished:f}) });
window.__game=g; document.getElementById('m').appendChild(g.el);
</script></body></html>`;
}

const server = createFileServer(ROOT, {
  '/':              makeHTML(PARAGRAPH),
  '/with-header':   makeHTML(PARAGRAPH, { headerHeight: 120 }),
  '/single-blank':  makeHTML(SINGLE_BLANK_P),
  '/unconstrained': makeUnconstrainedHTML(PARAGRAPH),
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const { browser, page } = await launchBrowser();
const { test, assert, summary } = makeRunner();
const navFn = (url) => nav(page, url);
const ws    = () => waitForScrollSettled(page);

console.log('\nFill Game — Tests\n');

await navFn(BASE);
await screenshot(page, SS_DIR, 'fill-initial-scroll');

// ── A. Scroll invariants ──────────────────────────────────────────────────────
await runScrollInvariants(page, test, assert, { lastIdx: 9, minPct: 0.82, waitForScroll: ws });

await test('blank 0 still near bottom with 120px header (offsetTop bug regression)', async () => {
  await navFn(`${BASE}/with-header`);
  const { top, h } = await page.evaluate(() => {
    const wR = document.querySelector('.fill-para-wrap').getBoundingClientRect();
    const bR = document.querySelector('[data-idx="0"]').getBoundingClientRect();
    return { top: bR.top - wR.top, h: wR.height };
  });
  assert(top > h * 0.82,
    `With 120px header: blank 0 top ${top.toFixed(0)}px — expected >82% of ${h}px (broken offsetTop gives ≈58%)`);
  await screenshot(page, SS_DIR, 'fill-with-header');
});

await test('blank 0 near bottom in unconstrained container (mobile Safari min-height regression)', async () => {
  // Regression: in mobile Safari, min-height on ancestors does not propagate definite
  // heights through flex chains. The para-wrap collapses to height 0 at RAF time.
  // Fix: paragraphScroller detects clientHeight=0 and sets an explicit fallback height
  // (85% of window.innerHeight) before measuring blanks.
  await navFn(`${BASE}/unconstrained`);
  const { top, h, scrollTop } = await page.evaluate(() => {
    const wR = document.querySelector('.fill-para-wrap').getBoundingClientRect();
    const bR = document.querySelector('[data-idx="0"]').getBoundingClientRect();
    return { top: bR.top - wR.top, h: wR.height, scrollTop: document.querySelector('.fill-para-wrap').scrollTop };
  });
  assert(scrollTop > 0,
    `Unconstrained container: scrollTop should be >0, got ${scrollTop} (scroll init failed — para-wrap collapsed to 0 height)`);
  assert(top > h * 0.82,
    `Unconstrained container: blank 0 at ${(top/h*100).toFixed(0)}% of wrap — expected >82%`);
});

await navFn(BASE);
await assertNoFutureBlanks(page, assert);

// ── B. Bank state ─────────────────────────────────────────────────────────────
await test('word bank has exactly 6 chips', async () => {
  const n = await page.$$eval('.fill-word', e => e.length);
  assert(n === 6, `Expected 6 bank chips, got ${n}`);
});

await test('bank contains word for blank 0', async () => {
  const words = await page.$$eval('.fill-word', e => e.map(x => x.textContent.trim()));
  assert(words.includes('quick'), `Bank must contain 'quick'. Got: ${words.join(', ')}`);
});

await test('paragraph has 10 blanks', async () => {
  const n = await page.$$eval('.fill-blank', e => e.length);
  assert(n === 10, `Expected 10 blanks, got ${n}`);
});

// ── C. Placement (click) ──────────────────────────────────────────────────────
const clickChip = (word) => page.evaluate(w => {
  const chip = [...document.querySelectorAll('.fill-word')].find(e => e.textContent.trim() === w);
  chip?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, clientX: 0, clientY: 0 }));
  chip?.dispatchEvent(new PointerEvent('pointerup',   { bubbles: true, pointerId: 1, clientX: 0, clientY: 0 }));
}, word);
const clickBlank = (idx) => page.evaluate(i =>
  document.querySelector(`.fill-blank[data-idx="${i}"]`)?.dispatchEvent(new MouseEvent('click', { bubbles: true })), idx);

await test('selecting a chip and clicking blank 0 places the word', async () => {
  await clickChip('quick');
  await clickBlank(0);
  const filled = await page.$eval('.fill-blank[data-idx="0"]', e => e.classList.contains('fill-blank--filled'));
  assert(filled, 'Blank 0 should be filled');
});

await test("placed word removed from bank; bank refills to 6", async () => {
  const words = await page.$$eval('.fill-word', e => e.map(x => x.textContent.trim()));
  assert(!words.includes('quick'), "'quick' should be gone from bank");
  assert(words.length === 6, `Bank should have 6, got ${words.length}`);
});

await test('clicking filled blank returns word to bank', async () => {
  await clickBlank(0);
  const filled = await page.$eval('.fill-blank[data-idx="0"]', e => e.classList.contains('fill-blank--filled'));
  assert(!filled, 'Blank 0 should be empty after unplace');
  const words = await page.$$eval('.fill-word', e => e.map(x => x.textContent.trim()));
  assert(words.includes('quick'), "'quick' should be back in bank");
});

// ── D. Drag ───────────────────────────────────────────────────────────────────
await test('drag from bank chip to blank places the word', async () => {
  await reload(page);
  const chip = await page.$('.fill-word');
  const chipBox = await chip.boundingBox();
  const blankBox = await page.$eval('.fill-blank[data-idx="0"]', e => {
    const r = e.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.mouse.move(chipBox.x + chipBox.width / 2, chipBox.y + chipBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(chipBox.x + 30, chipBox.y + 5, { steps: 3 });
  await page.mouse.move(blankBox.x, blankBox.y, { steps: 10 });
  await page.mouse.up();
  await new Promise(r => setTimeout(r, 60));
  const filled = await page.$eval('.fill-blank[data-idx="0"]', e => e.classList.contains('fill-blank--filled'));
  assert(filled, 'Blank 0 should be filled after drag');
  const ghost = await page.$('.fill-word--ghost');
  assert(ghost === null, 'Ghost element should be removed');
});

await test('setProgress mid-drag must not re-render bank (isDragging guard)', async () => {
  // Regression: if the isDragging guard is removed from syncBankWithVisible,
  // setProgress → scroll → onLocksChanged → syncBankWithVisible → renderBank
  // calls bankEl.innerHTML='', orphaning the captured chip. On mobile the
  // pointerup/cancel then never reaches bankEl, so the ghost sticks forever.
  // On desktop Puppeteer cleans up anyway, so we detect the bug by checking
  // that the bank chip count stays STABLE while the drag is active.
  await reload(page);
  const chip = await page.$('.fill-word');
  const chipBox = await chip.boundingBox();
  const paraBox = await page.$eval('.fill-para-wrap', e => {
    const r = e.getBoundingClientRect();
    return { x: r.left + 10, y: r.top + 10 };
  });
  await page.mouse.move(chipBox.x + chipBox.width / 2, chipBox.y + chipBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(chipBox.x + 30, chipBox.y + 5, { steps: 3 });
  await page.mouse.move(paraBox.x, paraBox.y, { steps: 10 });
  // Ghost exists, drag is active. Confirm dragging class is applied.
  const hasDraggingBeforeSync = await page.$('.fill-word--dragging');
  assert(hasDraggingBeforeSync !== null, 'Drag threshold crossed: chip should have --dragging class');
  // Directly call syncBankWithVisible during active drag. Without the isDragging guard,
  // this would run renderBank → bankEl.innerHTML='' → orphan the captured chip →
  // pointer capture lost → ghost freezes on mobile. Detect by checking --dragging class.
  await page.evaluate(() => window.__game._syncBank());
  await new Promise(r => setTimeout(r, 30));
  // With the guard in place, renderBank is skipped (isDragging=true) and the chip keeps its class.
  // Without the guard, renderBank destroys and recreates all chips without --dragging.
  const hasDraggingAfterSync = await page.$('.fill-word--dragging');
  assert(hasDraggingAfterSync !== null,
    'Dragged chip lost --dragging class: renderBank ran during active drag (isDragging guard missing)');
  await page.mouse.up();
  await new Promise(r => setTimeout(r, 100));
  const ghost = await page.$('.fill-word--ghost');
  assert(ghost === null, 'Ghost must be cleaned up after drag ends');
});

// ── E. Layout / visual regression ────────────────────────────────────────────
await navFn(BASE);
await runLayoutChecks(page, test, assert);

await test('bank is positioned above para-wrap in DOM order', async () => {
  const order = await page.evaluate(() => {
    const bank = document.querySelector('.fill-bank');
    const wrap = document.querySelector('.fill-para-wrap');
    return bank.compareDocumentPosition(wrap) & Node.DOCUMENT_POSITION_FOLLOWING ? 'bank-first' : 'wrap-first';
  });
  assert(order === 'bank-first', 'Bank should appear before para-wrap in DOM');
});

// ── F. Animation screenshots ──────────────────────────────────────────────────
await test('scroll reaches mid-point at setProgress(0.5)', async () => {
  await page.evaluate(() => window.__game.setProgress(0.5));
  await ws();
  const scrollTop = await page.$eval('.fill-para-wrap', e => e.scrollTop);
  assert(scrollTop > 0, `scrollTop should be > 0 at 50%, got ${scrollTop}`);
  await screenshot(page, SS_DIR, 'fill-timer-50pct');
});

await test('setProgress(0.99): last blank visible after animation settles', async () => {
  await page.evaluate(() => window.__game.setProgress(0.99));
  await ws();
  const { top, h } = await page.evaluate(() => {
    const wR = document.querySelector('.fill-para-wrap').getBoundingClientRect();
    const bR = document.querySelector('[data-idx="9"]').getBoundingClientRect();
    return { top: bR.top - wR.top, h: wR.height };
  });
  assert(top >= 0 && top < h, `Last blank top (${top.toFixed(0)}) must be in wrap (h=${h})`);
  await screenshot(page, SS_DIR, 'fill-timer-99pct');
});

// ── G. forceSubmit / reveal ───────────────────────────────────────────────────
await test('forceSubmit() fires with finished=false', async () => {
  await reload(page);
  await page.evaluate(() => window.__game.forceSubmit());
  await page.waitForFunction(() => window.__results.length > 0, { timeout: 2000 });
  const last = await page.evaluate(() => window.__results.at(-1));
  assert(last.finished === false, `Expected finished=false, got ${last.finished}`);
});

await test('reveal() hides bank, marks correct blank correct, wrong blank wrong', async () => {
  await reload(page);
  await page.evaluate(() => {
    const chip = [...document.querySelectorAll('.fill-word')].find(e => e.textContent.trim() === 'quick');
    chip?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, clientX: 0, clientY: 0 }));
    chip?.dispatchEvent(new PointerEvent('pointerup',   { bubbles: true, pointerId: 1, clientX: 0, clientY: 0 }));
    document.querySelector('.fill-blank[data-idx="0"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    window.__game.forceSubmit();
    window.__game.reveal();
  });
  const bankHidden = await page.$eval('.fill-bank', e => e.style.display === 'none');
  const correct    = await page.$eval('.fill-blank[data-idx="0"]', e => e.classList.contains('fill-blank--correct'));
  const wrong      = await page.$eval('.fill-blank[data-idx="1"]', e => e.classList.contains('fill-blank--wrong'));
  assert(bankHidden, 'Bank should be hidden after reveal()');
  assert(correct,    'Blank 0 with "quick" should be fill-blank--correct');
  assert(wrong,      'Blank 1 (unfilled) should be fill-blank--wrong');
  await screenshot(page, SS_DIR, 'fill-reveal');
});

// ── H. Auto-submit ────────────────────────────────────────────────────────────
await test('filling all 10 blanks auto-submits with finished=true', async () => {
  await reload(page);
  const initial = await page.evaluate(() => { window.__testInit = window.__results.length; return window.__results.length; });
  await page.evaluate(() => {
    const bank = document.querySelector('.fill-bank');
    const blanks = [...document.querySelectorAll('.fill-blank')];
    for (let i = 0; i < 10; i++) {
      const chips   = [...bank.querySelectorAll('.fill-word')];
      const unfilled = blanks.filter(b => !b.classList.contains('fill-blank--filled') && !b.classList.contains('fill-blank--locked'));
      if (!chips.length || !unfilled.length) break;
      chips[0].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, clientX: 0, clientY: 0 }));
      chips[0].dispatchEvent(new PointerEvent('pointerup',   { bubbles: true, pointerId: 1, clientX: 0, clientY: 0 }));
      unfilled[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }
  });
  await page.waitForFunction(() => window.__results.length > window.__testInit, { timeout: 3000 });
  const last = await page.evaluate(() => window.__results.at(-1));
  assert(last.finished === true, `Auto-submit should set finished=true, got ${last.finished}`);
});

// ── I. Single-blank ───────────────────────────────────────────────────────────
await test('single-blank: renders 1 blank and 1 bank chip', async () => {
  await navFn(`${BASE}/single-blank`);
  const blanks = await page.$$('.fill-blank');
  const chips  = await page.$$('.fill-word');
  assert(blanks.length === 1, `Expected 1 blank, got ${blanks.length}`);
  assert(chips.length === 1,  `Expected 1 chip, got ${chips.length}`);
});

await runSingleBlankEdgeCases(page, test, assert, {
  navFn,
  singleUrl: `${BASE}/single-blank`,
  triggerSubmit: () => page.evaluate(() => {
    const chip = document.querySelector('.fill-word');
    chip.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, clientX: 0, clientY: 0 }));
    chip.dispatchEvent(new PointerEvent('pointerup',   { bubbles: true, pointerId: 1, clientX: 0, clientY: 0 }));
    document.querySelector('.fill-blank')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }),
  expectedAnswer: 'fox',
});

// ── Summary ───────────────────────────────────────────────────────────────────
await browser.close();
server.close();
console.log(`Screenshots → ${SS_DIR}`);
const failures = summary();
if (failures > 0) process.exit(1);
