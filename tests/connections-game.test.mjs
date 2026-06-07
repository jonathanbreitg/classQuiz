/**
 * connections-game.test.mjs — Integration tests for connectionsGame.js
 *
 * Run: node tests/connections-game.test.mjs
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { launchBrowser, createFileServer, makeRunner, screenshot } from './lib/testUtils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');
const SS_DIR    = path.join(__dirname, 'screenshots');

const GROUPS = [
  { label: 'Collocations with MAKE', words: ['decision', 'mistake', 'progress', 'friends'] },
  { label: 'Collocations with DO',   words: ['homework', 'exercise', 'research', 'damage'] },
  { label: 'Irregular past tense',   words: ['went', 'saw', 'bought', 'thought'] },
];

const ALL_WORDS = GROUPS.flatMap(g => g.words);
const TOTAL = ALL_WORDS.length; // 12

function makeHTML(groups = GROUPS) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/style.css">
<style>html,body{height:100%;margin:0}#root{display:flex;flex-direction:column;height:100dvh}</style>
</head><body>
<div id="root">
  <div id="m" style="flex:1;min-height:0;display:flex;flex-direction:column"></div>
</div>
<script type="module">
import { createConnectionsGame } from '/src/components/connectionsGame.js';
window.__results = [];
window.__game = createConnectionsGame({
  groups: ${JSON.stringify(groups)},
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
  await page.waitForSelector('.connections-word', { timeout: 4000 });
};

console.log('\nConnections Game — Tests\n');

// ── A. Initial render ────────────────────────────────────────────────────
await nav();
await screenshot(page, SS_DIR, 'connections-initial');

await test(`renders ${TOTAL} word chips`, async () => {
  const n = await page.$$eval('.connections-word', e => e.length);
  assert(n === TOTAL, `Expected ${TOTAL} word chips, got ${n}`);
});

await test('all words from groups appear', async () => {
  const texts = await page.$$eval('.connections-word', e => e.map(t => t.textContent.trim()));
  const sortedGot      = [...texts].sort();
  const sortedExpected = [...ALL_WORDS].sort();
  assert(JSON.stringify(sortedGot) === JSON.stringify(sortedExpected),
    `Words don't match.\nGot: ${sortedGot}\nExpected: ${sortedExpected}`);
});

await test('submit button is present and initially disabled', async () => {
  const btn = await page.$('.connections-submit');
  assert(btn !== null, 'Submit button not found');
  const disabled = await page.$eval('.connections-submit', e => e.disabled);
  assert(disabled, 'Submit button should be disabled initially');
});

await test('no groups solved at start', async () => {
  const solved = await page.$$eval('.connections-solved-group', e => e.length);
  assert(solved === 0, `Expected 0 solved groups, got ${solved}`);
});

// ── B. Selecting words ───────────────────────────────────────────────────
await nav();

await test('tapping a word selects it', async () => {
  const chip = await page.$('.connections-word');
  await chip.tap();
  await new Promise(r => setTimeout(r, 80));
  const selected = await page.$$eval('.connections-word--selected', e => e.length);
  assert(selected === 1, `Expected 1 selected word, got ${selected}`);
});

await test('tapping same word again deselects it', async () => {
  const chip = await page.$('.connections-word');
  await chip.tap();
  await new Promise(r => setTimeout(r, 80));
  const selected = await page.$$eval('.connections-word--selected', e => e.length);
  assert(selected === 0, `Expected 0 selected after deselect, got ${selected}`);
});

await test('selecting 4 words enables submit button', async () => {
  const chips = await page.$$('.connections-word');
  for (let i = 0; i < 4; i++) {
    await chips[i].tap();
    await new Promise(r => setTimeout(r, 60));
  }
  const disabled = await page.$eval('.connections-submit', e => e.disabled);
  assert(!disabled, 'Submit button should be enabled with 4 words selected');
  const selected = await page.$$eval('.connections-word--selected', e => e.length);
  assert(selected === 4, `Expected 4 selected words, got ${selected}`);
});

await test('cannot select more than 4 words', async () => {
  const chips = await page.$$('.connections-word');
  // Try to tap a 5th
  await chips[4].tap();
  await new Promise(r => setTimeout(r, 80));
  const selected = await page.$$eval('.connections-word--selected', e => e.length);
  assert(selected === 4, `Expected max 4 selected, got ${selected}`);
});

// ── C. Wrong group submission ────────────────────────────────────────────
await nav();

await test('submitting wrong group shakes chips and clears selection', async () => {
  // Select 4 words from different groups (mix groups 0 and 1)
  const group0Words = GROUPS[0].words;
  const group1Words = GROUPS[1].words;
  const toSelect = [group0Words[0], group0Words[1], group1Words[0], group1Words[1]];
  for (const word of toSelect) {
    const handle = await page.evaluateHandle(
      w => [...document.querySelectorAll('.connections-word')].find(e => e.textContent.trim() === w),
      word,
    );
    if (handle) { await handle.tap(); await new Promise(r => setTimeout(r, 60)); }
  }
  const btn = await page.$('.connections-submit');
  await btn.tap();
  await new Promise(r => setTimeout(r, 100));

  // After wrong: no solved groups, selection cleared, no submit fired
  const solved = await page.$$eval('.connections-solved-group', e => e.length);
  assert(solved === 0, `No group should be solved, got ${solved}`);
  const selected = await page.$$eval('.connections-word--selected', e => e.length);
  assert(selected === 0, `Selection should be cleared after wrong, got ${selected}`);
  const results = await page.evaluate(() => window.__results.length);
  assert(results === 0, 'No submit should have fired on wrong group');
});

// ── D. Correct group submission ──────────────────────────────────────────
await nav();

await test('submitting correct group removes words and shows banner', async () => {
  // Select all 4 words from group 0
  for (const word of GROUPS[0].words) {
    const handle = await page.evaluateHandle(
      w => [...document.querySelectorAll('.connections-word')].find(e => e.textContent.trim() === w),
      word,
    );
    if (handle) { await handle.tap(); await new Promise(r => setTimeout(r, 60)); }
  }
  const btn = await page.$('.connections-submit');
  await btn.tap();
  await new Promise(r => setTimeout(r, 200));

  const solved = await page.$$eval('.connections-solved-group', e => e.length);
  assert(solved === 1, `Expected 1 solved banner, got ${solved}`);
  const remaining = await page.$$eval('.connections-word', e => e.length);
  assert(remaining === TOTAL - 4, `Expected ${TOTAL - 4} remaining words, got ${remaining}`);
  await screenshot(page, SS_DIR, 'connections-one-solved');
});

// ── E. Auto-submit when all groups solved ────────────────────────────────
await nav();

await test('solving all groups auto-submits with finished=true', async () => {
  for (const group of GROUPS) {
    for (const word of group.words) {
      const handle = await page.evaluateHandle(
        w => [...document.querySelectorAll('.connections-word')].find(e => e.textContent.trim() === w),
        word,
      );
      if (handle) { await handle.tap(); await new Promise(r => setTimeout(r, 50)); }
    }
    const btn = await page.$('.connections-submit');
    if (btn) { await btn.tap(); await new Promise(r => setTimeout(r, 200)); }
  }
  await page.waitForFunction(() => window.__results.length > 0, { timeout: 3000 });
  const last = await page.evaluate(() => window.__results.at(-1));
  assert(last.finished === true, `Expected finished=true, got ${last.finished}`);
  assert(Array.isArray(last.answers.solved), 'answers.solved should be an array');
  assert(last.answers.solved.length === GROUPS.length,
    `Expected ${GROUPS.length} solved groups, got ${last.answers.solved.length}`);
});

await nav();

await test('last group auto-submits without clicking Submit Group button', async () => {
  // Solve first N-1 groups by selecting + clicking button
  for (let gi = 0; gi < GROUPS.length - 1; gi++) {
    for (const word of GROUPS[gi].words) {
      const handle = await page.evaluateHandle(
        w => [...document.querySelectorAll('.connections-word')].find(e => e.textContent.trim() === w),
        word,
      );
      if (handle) { await handle.tap(); await new Promise(r => setTimeout(r, 50)); }
    }
    const btn = await page.$('.connections-submit');
    if (btn) { await btn.tap(); await new Promise(r => setTimeout(r, 200)); }
  }
  // Select the last group's words — should auto-submit without clicking the button
  const lastGroup = GROUPS[GROUPS.length - 1];
  for (const word of lastGroup.words) {
    const handle = await page.evaluateHandle(
      w => [...document.querySelectorAll('.connections-word')].find(e => e.textContent.trim() === w),
      word,
    );
    if (handle) { await handle.tap(); await new Promise(r => setTimeout(r, 60)); }
  }
  await page.waitForFunction(() => window.__results.length > 0, { timeout: 3000 });
  const last = await page.evaluate(() => window.__results.at(-1));
  assert(last.finished === true, `Expected auto-submit with finished=true, got ${last.finished}`);
  assert(last.answers.solved.length === GROUPS.length,
    `Expected all ${GROUPS.length} groups solved, got ${last.answers.solved.length}`);
});

// ── F. forceSubmit ────────────────────────────────────────────────────────
await nav();

await test('forceSubmit() fires with finished=false', async () => {
  await page.evaluate(() => window.__game.forceSubmit());
  await page.waitForFunction(() => window.__results.length > 0, { timeout: 2000 });
  const last = await page.evaluate(() => window.__results.at(-1));
  assert(last.finished === false, `Expected finished=false, got ${last.finished}`);
});

// ── G. reveal() ──────────────────────────────────────────────────────────
await nav();

await test('reveal() shows all unsolved groups as faded banners', async () => {
  await page.evaluate(() => { window.__game.forceSubmit(); window.__game.reveal(); });
  await new Promise(r => setTimeout(r, 100));
  const banners = await page.$$eval('.connections-solved-group', e => e.length);
  assert(banners === GROUPS.length, `Expected ${GROUPS.length} banners after reveal, got ${banners}`);
  const gridWords = await page.$$eval('.connections-word', e => e.length);
  assert(gridWords === 0, `Grid should be empty after reveal, got ${gridWords}`);
  await screenshot(page, SS_DIR, 'connections-reveal');
});

// ── H. Partial solve + reveal ────────────────────────────────────────────
await nav();

await test('partial solve: solved banners + reveal banners total all groups', async () => {
  // Solve group 0
  for (const word of GROUPS[0].words) {
    const handle = await page.evaluateHandle(
      w => [...document.querySelectorAll('.connections-word')].find(e => e.textContent.trim() === w),
      word,
    );
    if (handle) { await handle.tap(); await new Promise(r => setTimeout(r, 50)); }
  }
  const btn = await page.$('.connections-submit');
  await btn.tap();
  await new Promise(r => setTimeout(r, 200));

  await page.evaluate(() => { window.__game.forceSubmit(); window.__game.reveal(); });
  await new Promise(r => setTimeout(r, 100));

  const banners = await page.$$eval('.connections-solved-group', e => e.length);
  assert(banners === GROUPS.length, `Expected ${GROUPS.length} total banners, got ${banners}`);
});

// ── I. Answers shape ──────────────────────────────────────────────────────
await nav();

await test('answers.solved contains correct group indices', async () => {
  // Solve group 1
  for (const word of GROUPS[1].words) {
    const handle = await page.evaluateHandle(
      w => [...document.querySelectorAll('.connections-word')].find(e => e.textContent.trim() === w),
      word,
    );
    if (handle) { await handle.tap(); await new Promise(r => setTimeout(r, 50)); }
  }
  const btn = await page.$('.connections-submit');
  await btn.tap();
  await new Promise(r => setTimeout(r, 200));
  await page.evaluate(() => window.__game.forceSubmit());
  await page.waitForFunction(() => window.__results.length > 0, { timeout: 2000 });
  const { answers } = await page.evaluate(() => window.__results.at(-1));
  assert(answers.solved.includes(1), `Expected solved to include group index 1`);
});

// ── Summary ───────────────────────────────────────────────────────────────
await browser.close();
server.close();
console.log(`Screenshots → ${SS_DIR}`);
const failures = summary();
if (failures > 0) process.exit(1);
