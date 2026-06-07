/**
 * order-game.test.mjs — Integration tests for orderGame.js
 *
 * Run: node tests/order-game.test.mjs
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { launchBrowser, createFileServer, makeRunner, screenshot } from './lib/testUtils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');
const SS_DIR    = path.join(__dirname, 'screenshots');

const SENTENCES = [
  'She woke up early in the morning.',
  'Then she made herself a cup of coffee.',
  'After breakfast, she went for a walk.',
  'Finally, she sat down to start work.',
];

function makeHTML(sentences = SENTENCES) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/style.css">
<style>html,body{height:100%;margin:0}#root{display:flex;flex-direction:column;height:100dvh}</style>
</head><body>
<div id="root">
  <div id="m" style="flex:1;min-height:0;display:flex;flex-direction:column"></div>
</div>
<script type="module">
import { createOrderGame } from '/src/components/orderGame.js';
window.__results = [];
window.__game = createOrderGame({
  sentences: ${JSON.stringify(sentences)},
  onSubmit: (a, f) => window.__results.push({ answers: a, finished: f }),
});
document.getElementById('m').appendChild(window.__game.el);
</script></body></html>`;
}

const server = createFileServer(ROOT, { '/': makeHTML() });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const { browser, page } = await launchBrowser();
const { test, assert, summary } = makeRunner();

const nav = async () => {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.order-tile', { timeout: 4000 });
};

console.log('\nOrder Game — Tests\n');

// ── A. Initial render ────────────────────────────────────────────────────
await nav();
await screenshot(page, SS_DIR, 'order-initial');

await test(`renders ${SENTENCES.length} tiles`, async () => {
  const n = await page.$$eval('.order-tile', e => e.length);
  assert(n === SENTENCES.length, `Expected ${SENTENCES.length} tiles, got ${n}`);
});

await test(`renders ${SENTENCES.length} slots`, async () => {
  const n = await page.$$eval('.order-slot', e => e.length);
  assert(n === SENTENCES.length, `Expected ${SENTENCES.length} slots, got ${n}`);
});

await test('all sentences appear in tiles', async () => {
  const texts = await page.$$eval('.order-tile', e => e.map(t => t.textContent.trim()));
  const sortedGot      = [...texts].sort();
  const sortedExpected = [...SENTENCES].sort();
  assert(JSON.stringify(sortedGot) === JSON.stringify(sortedExpected),
    `Tile texts don't match sentences.\nGot: ${sortedGot}\nExpected: ${sortedExpected}`);
});

await test('slots are numbered 1..n', async () => {
  const nums = await page.$$eval('.order-slot__num', e => e.map(el => el.textContent.trim()));
  assert(nums.length === SENTENCES.length, `Expected ${SENTENCES.length} slot nums`);
  nums.forEach((n, i) => assert(n === String(i + 1), `Slot ${i} num should be ${i + 1}, got ${n}`));
});

await test('no slot filled at start', async () => {
  const filled = await page.$$eval('.order-slot--filled', e => e.length);
  assert(filled === 0, `Expected 0 filled slots, got ${filled}`);
});

// ── B. Tap-select + place interaction ───────────────────────────────────
await nav();

await test('tapping a tile selects it', async () => {
  const tile = await page.$('.order-tile');
  await tile.tap();
  await new Promise(r => setTimeout(r, 80));
  const selected = await page.$$eval('.order-tile--selected', e => e.length);
  assert(selected === 1, `Expected 1 selected tile, got ${selected}`);
});

await test('tapping same tile again deselects it', async () => {
  const tile = await page.$('.order-tile');
  await tile.tap();
  await new Promise(r => setTimeout(r, 80));
  const selected = await page.$$eval('.order-tile--selected', e => e.length);
  assert(selected === 0, `Expected 0 selected after deselect, got ${selected}`);
});

await test('tapping tile then slot places sentence in slot', async () => {
  const tile = await page.$('.order-tile');
  await tile.tap();
  await new Promise(r => setTimeout(r, 80));
  const slot = await page.$('.order-slot');
  await slot.tap();
  await new Promise(r => setTimeout(r, 150));
  const filled = await page.$$eval('.order-slot--filled', e => e.length);
  const placed = await page.$$eval('.order-tile--placed', e => e.length);
  assert(filled === 1, `Expected 1 filled slot, got ${filled}`);
  assert(placed === 1, `Expected 1 placed tile, got ${placed}`);
  assert(await page.$$eval('.order-tile--selected', e => e.length) === 0, 'Should deselect after place');
});

await test('tapping filled slot picks the sentence back up', async () => {
  const filledSlot = await page.$('.order-slot--filled');
  await filledSlot.tap();
  await new Promise(r => setTimeout(r, 80));
  const selected = await page.$$eval('.order-tile--selected', e => e.length);
  const filled   = await page.$$eval('.order-slot--filled', e => e.length);
  assert(selected === 1, `Expected 1 selected tile after pickup, got ${selected}`);
  assert(filled   === 0, `Expected 0 filled slots after pickup, got ${filled}`);
});

// ── C. Auto-submit ────────────────────────────────────────────────────────
await nav();

await test('filling all slots auto-submits with finished=true', async () => {
  const tiles = await page.$$('.order-tile');
  const slots = await page.$$('.order-slot');
  for (let i = 0; i < tiles.length; i++) {
    await tiles[i].tap();
    await new Promise(r => setTimeout(r, 60));
    await slots[i].tap();
    await new Promise(r => setTimeout(r, 60));
  }
  await page.waitForFunction(() => window.__results.length > 0, { timeout: 3000 });
  const last = await page.evaluate(() => window.__results.at(-1));
  assert(last.finished === true, `Expected finished=true, got ${last.finished}`);
  assert(Object.keys(last.answers).length === SENTENCES.length,
    `Expected ${SENTENCES.length} answers, got ${Object.keys(last.answers).length}`);
});

// ── D. forceSubmit ────────────────────────────────────────────────────────
await nav();

await test('forceSubmit() fires with finished=false', async () => {
  await page.evaluate(() => window.__game.forceSubmit());
  await page.waitForFunction(() => window.__results.length > 0, { timeout: 2000 });
  const last = await page.evaluate(() => window.__results.at(-1));
  assert(last.finished === false, `Expected finished=false, got ${last.finished}`);
});

// ── E. reveal() ───────────────────────────────────────────────────────────
await nav();

await test('reveal() marks correct and wrong slots', async () => {
  // Place first sentence into slot 0 (may or may not be correct depending on shuffle)
  const firstText = await page.$eval('.order-tile', e => e.textContent.trim());
  const tile = await page.$('.order-tile');
  await tile.tap();
  await new Promise(r => setTimeout(r, 80));
  const slot0 = await page.$('.order-slot');
  await slot0.tap();
  await new Promise(r => setTimeout(r, 100));
  await page.evaluate(() => { window.__game.forceSubmit(); window.__game.reveal(); });
  await new Promise(r => setTimeout(r, 100));

  const correct = await page.$$eval('.order-slot--correct', e => e.length);
  const wrong   = await page.$$eval('.order-slot--wrong',   e => e.length);
  // Total correct + wrong should equal SENTENCES.length
  assert(correct + wrong === SENTENCES.length,
    `Expected ${SENTENCES.length} revealed slots, got ${correct + wrong}`);
  await screenshot(page, SS_DIR, 'order-reveal');
});

await test('reveal() shows hint text on wrong slots', async () => {
  const hints = await page.$$eval('.order-slot__hint', e => e.length);
  assert(hints >= 1, `Expected ≥1 hint on wrong slots, got ${hints}`);
});

// ── F. Answers format ─────────────────────────────────────────────────────
await nav();

await test('submitted answers is { slotIdx: sentenceText }', async () => {
  const tileText = await page.$eval('.order-tile', e => e.textContent.trim());
  const tile = await page.$('.order-tile');
  await tile.tap();
  await new Promise(r => setTimeout(r, 80));
  const slot0 = await page.$('.order-slot');
  await slot0.tap();
  await new Promise(r => setTimeout(r, 100));
  await page.evaluate(() => window.__game.forceSubmit());
  await page.waitForFunction(() => window.__results.length > 0, { timeout: 2000 });
  const { answers } = await page.evaluate(() => window.__results.at(-1));
  assert(typeof answers === 'object' && !Array.isArray(answers), 'answers should be a plain object');
  assert(answers[0] === tileText, `answers[0] should be "${tileText}", got "${answers[0]}"`);
});

// ── G. Shuffle check ──────────────────────────────────────────────────────
await test('tiles are shuffled across loads', async () => {
  const orders = new Set();
  for (let i = 0; i < 5; i++) {
    await nav();
    const order = await page.$$eval('.order-tile', e => e.map(t => t.textContent.trim()).join('|||'));
    orders.add(order);
  }
  const original = SENTENCES.join('|||');
  assert(orders.size > 1 || !orders.has(original), 'Tiles should be shuffled');
});

// ── H. Drag disabled after reveal ────────────────────────────────────────
await nav();

await test('drag/tap is disabled after reveal — slots cannot be moved', async () => {
  // Place one tile, then reveal
  const tile = await page.$('.order-tile');
  await tile.tap();
  await new Promise(r => setTimeout(r, 80));
  const slot0 = await page.$('.order-slot');
  await slot0.tap();
  await new Promise(r => setTimeout(r, 100));
  const textBefore = await page.$eval('.order-slot', e => e.querySelector('.order-slot__text').textContent);
  await page.evaluate(() => { window.__game.forceSubmit(); window.__game.reveal(); });
  await new Promise(r => setTimeout(r, 100));

  // Try to tap a slot to pick it back up — should do nothing
  await slot0.tap();
  await new Promise(r => setTimeout(r, 80));
  const textAfter = await page.$eval('.order-slot', e => e.querySelector('.order-slot__text').textContent);
  assert(textAfter === textBefore, `Slot text changed after reveal tap: "${textBefore}" → "${textAfter}"`);
  // No new submit should have fired
  const count = await page.evaluate(() => window.__results.length);
  assert(count === 1, `Expected 1 submit total, got ${count}`);
});

// ── Summary ───────────────────────────────────────────────────────────────
await browser.close();
server.close();
console.log(`Screenshots → ${SS_DIR}`);
const failures = summary();
if (failures > 0) process.exit(1);
