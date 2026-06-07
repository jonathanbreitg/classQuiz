/**
 * shuffle-game.test.mjs — Integration tests for shuffleGame.js
 *
 * Run: node tests/shuffle-game.test.mjs
 */

import path from 'path';
import { fileURLToPath } from 'url';
import {
  launchBrowser, createFileServer, makeRunner, screenshot,
} from './lib/testUtils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');
const SS_DIR    = path.join(__dirname, 'screenshots');

const SENTENCE    = 'The quick brown fox jumps over the lazy dog';
const WORDS       = SENTENCE.split(' ');
const SHORT_SENT  = 'Hello world';

function makeHTML(sentence) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/style.css">
<style>html,body{height:100%;margin:0}#root{display:flex;flex-direction:column;height:100dvh}</style>
</head><body>
<div id="root"></div>
<script type="module">
import { createShuffleGame } from '/src/components/shuffleGame.js';
window.__results=[]; window.__game=null;
const g = createShuffleGame({ sentence:${JSON.stringify(sentence)}, onSubmit:(a,f)=>window.__results.push({answers:a,finished:f}) });
window.__game=g; document.getElementById('root').appendChild(g.el);
</script></body></html>`;
}

const server = createFileServer(ROOT, {
  '/':       makeHTML(SENTENCE),
  '/short':  makeHTML(SHORT_SENT),
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const { browser, page } = await launchBrowser();
const { test, assert, summary } = makeRunner();

const nav = async (url) => {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.shuffle-tile', { timeout: 4000 });
};

console.log('\nShuffle Game — Tests\n');

// ── A. Initial render ─────────────────────────────────────────────────────
await nav(BASE);
await screenshot(page, SS_DIR, 'shuffle-initial');

await test(`renders ${WORDS.length} tiles`, async () => {
  const n = await page.$$eval('.shuffle-tile', e => e.length);
  assert(n === WORDS.length, `Expected ${WORDS.length} tiles, got ${n}`);
});

await test(`renders ${WORDS.length} slots`, async () => {
  const n = await page.$$eval('.shuffle-slot', e => e.length);
  assert(n === WORDS.length, `Expected ${WORDS.length} slots, got ${n}`);
});

await test('all words from sentence appear in tiles', async () => {
  const texts = await page.$$eval('.shuffle-tile', e => e.map(t => t.textContent.trim()));
  const sorted = [...texts].sort();
  const expected = [...WORDS].sort();
  assert(JSON.stringify(sorted) === JSON.stringify(expected),
    `Tile words don't match sentence words.\nGot: ${sorted}\nExpected: ${expected}`);
});

await test('no slot is filled at start', async () => {
  const filled = await page.$$eval('.shuffle-slot--filled', e => e.length);
  assert(filled === 0, `Expected 0 filled slots, got ${filled}`);
});

await test('tiles are shuffled (not in original order across loads)', async () => {
  const orders = new Set();
  for (let i = 0; i < 4; i++) {
    await nav(BASE);
    const order = await page.$$eval('.shuffle-tile', e => e.map(t => t.textContent.trim()).join('|'));
    orders.add(order);
  }
  const original = WORDS.join('|');
  assert(orders.size > 1 || !orders.has(original),
    'Tiles should be shuffled');
});

// ── B. Tap-select + place interaction ────────────────────────────────────
// Uses elementHandle.tap() which fires real touch→pointer events so attachDrag
// sees pointerdown/pointerup (not just click).
await nav(BASE);

await test('tapping a tile selects it', async () => {
  const tile = await page.$('.shuffle-tile');
  await tile.tap();
  await new Promise(r => setTimeout(r, 80));
  const selected = await page.$$eval('.shuffle-tile--selected', e => e.length);
  assert(selected === 1, `Expected 1 selected tile, got ${selected}`);
});

await test('tapping same tile again deselects it', async () => {
  const tile = await page.$('.shuffle-tile');
  await tile.tap();
  await new Promise(r => setTimeout(r, 80));
  const selected = await page.$$eval('.shuffle-tile--selected', e => e.length);
  assert(selected === 0, `Expected 0 selected tiles after deselect, got ${selected}`);
});

await test('tapping tile then slot places word in slot', async () => {
  const tile = await page.$('.shuffle-tile');
  await tile.tap();
  await new Promise(r => setTimeout(r, 80));
  const slot = await page.$('.shuffle-slot');
  await slot.tap();
  await new Promise(r => setTimeout(r, 150));
  const filledSlots = await page.$$eval('.shuffle-slot--filled', e => e.length);
  const placedTiles = await page.$$eval('.shuffle-tile--placed', e => e.length);
  assert(filledSlots === 1, `Expected 1 filled slot, got ${filledSlots}`);
  assert(placedTiles === 1, `Expected 1 placed tile, got ${placedTiles}`);
  assert(await page.$$eval('.shuffle-tile--selected', e => e.length) === 0, 'Should deselect after place');
});

await test('tapping a filled slot picks the word back up (selects tile)', async () => {
  const filledSlot = await page.$('.shuffle-slot--filled');
  await filledSlot.tap();
  await new Promise(r => setTimeout(r, 80));
  const selected  = await page.$$eval('.shuffle-tile--selected', e => e.length);
  const filled    = await page.$$eval('.shuffle-slot--filled', e => e.length);
  assert(selected === 1, `Expected 1 selected tile after picking up, got ${selected}`);
  assert(filled   === 0, `Expected 0 filled slots after picking up, got ${filled}`);
});

// ── C. Auto-submit ────────────────────────────────────────────────────────
await nav(BASE);

await test('filling all slots auto-submits with finished=true', async () => {
  const tiles = await page.$$('.shuffle-tile');
  const slots = await page.$$('.shuffle-slot');
  for (let i = 0; i < tiles.length; i++) {
    await tiles[i].tap();
    await new Promise(r => setTimeout(r, 60));
    await slots[i].tap();
    await new Promise(r => setTimeout(r, 60));
  }
  await page.waitForFunction(() => window.__results.length > 0, { timeout: 3000 });
  const last = await page.evaluate(() => window.__results.at(-1));
  assert(last.finished === true, `Expected finished=true, got ${last.finished}`);
  assert(Object.keys(last.answers).length === WORDS.length,
    `Expected ${WORDS.length} answers, got ${Object.keys(last.answers).length}`);
});

// ── D. forceSubmit ────────────────────────────────────────────────────────
await nav(BASE);

await test('forceSubmit() fires with finished=false', async () => {
  await page.evaluate(() => window.__game.forceSubmit());
  await page.waitForFunction(() => window.__results.length > 0, { timeout: 2000 });
  const last = await page.evaluate(() => window.__results.at(-1));
  assert(last.finished === false, `Expected finished=false, got ${last.finished}`);
});

// ── E. reveal() ───────────────────────────────────────────────────────────
await nav(BASE);

await test('reveal() marks correct and wrong slots', async () => {
  // Tap the tile whose text matches WORDS[0], then tap slot 0
  const correctWord = WORDS[0];
  const tileHandle = await page.evaluateHandle(
    w => [...document.querySelectorAll('.shuffle-tile')].find(t => t.textContent.trim() === w),
    correctWord,
  );
  await tileHandle.tap();
  await new Promise(r => setTimeout(r, 80));
  const slot0 = await page.$('.shuffle-slot');
  await slot0.tap();
  await new Promise(r => setTimeout(r, 100));
  await page.evaluate(() => { window.__game.forceSubmit(); window.__game.reveal(); });

  const correct = await page.$$eval('.shuffle-slot--correct', e => e.length);
  const wrong   = await page.$$eval('.shuffle-slot--wrong',   e => e.length);
  assert(correct >= 1, `Expected ≥1 correct slot, got ${correct}`);
  assert(wrong   >= 1, `Expected ≥1 wrong slot (empty), got ${wrong}`);
  await screenshot(page, SS_DIR, 'shuffle-reveal');
});

await test('reveal() shows hint text on wrong slots', async () => {
  const hints = await page.$$eval('.shuffle-slot__hint', e => e.length);
  assert(hints >= 1, `Expected ≥1 hint on wrong slots, got ${hints}`);
});

// ── F. Answers format ─────────────────────────────────────────────────────
await nav(BASE);

await test('submitted answers is {slotIdx: word}', async () => {
  const tileHandle = await page.evaluateHandle(
    w => [...document.querySelectorAll('.shuffle-tile')].find(t => t.textContent.trim() === w),
    WORDS[0],
  );
  await tileHandle.tap();
  await new Promise(r => setTimeout(r, 80));
  const slot0 = await page.$('.shuffle-slot');
  await slot0.tap();
  await new Promise(r => setTimeout(r, 100));
  await page.evaluate(() => window.__game.forceSubmit());

  await page.waitForFunction(() => window.__results.length > 0, { timeout: 2000 });
  const { answers } = await page.evaluate(() => window.__results.at(-1));
  assert(typeof answers === 'object' && !Array.isArray(answers), 'answers should be a plain object');
  assert(answers[0] === WORDS[0], `answers[0] should be '${WORDS[0]}', got '${answers[0]}'`);
});

// ── G. Short sentence edge case ───────────────────────────────────────────
await nav(`${BASE}/short`);

await test('2-word sentence: renders 2 tiles and 2 slots', async () => {
  const tiles = await page.$$eval('.shuffle-tile', e => e.length);
  const slots = await page.$$eval('.shuffle-slot', e => e.length);
  assert(tiles === 2, `Expected 2 tiles, got ${tiles}`);
  assert(slots === 2, `Expected 2 slots, got ${slots}`);
});

// ── Drag disabled after reveal ────────────────────────────────────────────
await nav();

await test('drag/tap is disabled after reveal — slots cannot be moved', async () => {
  // Place one tile, then reveal
  const tile = await page.$('.shuffle-tile');
  await tile.tap();
  await new Promise(r => setTimeout(r, 80));
  const slot0 = await page.$('.shuffle-slot');
  await slot0.tap();
  await new Promise(r => setTimeout(r, 100));
  const textBefore = await page.$eval('.shuffle-slot', e => e.textContent.trim());
  await page.evaluate(() => { window.__game.forceSubmit(); window.__game.reveal(); });
  await new Promise(r => setTimeout(r, 100));

  // Try to tap the slot to pick it back up — should do nothing
  await slot0.tap();
  await new Promise(r => setTimeout(r, 80));
  const textAfter = await page.$eval('.shuffle-slot', e => e.textContent.trim());
  assert(textAfter === textBefore, `Slot text changed after reveal tap: "${textBefore}" → "${textAfter}"`);
  const count = await page.evaluate(() => window.__results.length);
  assert(count === 1, `Expected 1 submit total, got ${count}`);
});

// ── Summary ───────────────────────────────────────────────────────────────
await browser.close();
server.close();
console.log(`Screenshots → ${SS_DIR}`);
const failures = summary();
if (failures > 0) process.exit(1);
