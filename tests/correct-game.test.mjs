/**
 * correct-game.test.mjs — Integration tests for correctGame.js
 *
 * Run: node tests/correct-game.test.mjs
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { launchBrowser, createFileServer, makeRunner, screenshot } from './lib/testUtils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');
const SS_DIR    = path.join(__dirname, 'screenshots');

const SENTENCE    = 'She go to school every day';
const WORDS       = SENTENCE.split(' ');
const WRONG_INDEX = 1; // "go"
const CORRECTION  = 'goes';

function makeHTML(sentence = SENTENCE, wrongIndex = WRONG_INDEX, correction = CORRECTION) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/style.css">
<style>html,body{height:100%;margin:0}#root{display:flex;flex-direction:column;height:100dvh}</style>
</head><body>
<div id="root">
  <div id="m" style="flex:1;min-height:0;display:flex;flex-direction:column"></div>
</div>
<script type="module">
import { createCorrectGame } from '/src/components/correctGame.js';
window.__results = [];
window.__game = createCorrectGame({
  sentence: ${JSON.stringify(sentence)},
  wrongIndex: ${wrongIndex},
  correction: ${JSON.stringify(correction)},
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
  await page.waitForSelector('.correct-word', { timeout: 4000 });
};

console.log('\nCorrect Game — Tests\n');

// ── A. Initial render ────────────────────────────────────────────────────
await nav();
await screenshot(page, SS_DIR, 'correct-initial');

await test(`renders ${WORDS.length} word chips`, async () => {
  const n = await page.$$eval('.correct-word', e => e.length);
  assert(n === WORDS.length, `Expected ${WORDS.length} chips, got ${n}`);
});

await test('all words from sentence appear', async () => {
  const texts = await page.$$eval('.correct-word', e => e.map(t => t.textContent.trim()));
  WORDS.forEach((w, i) => assert(texts[i] === w, `Word ${i}: expected "${w}", got "${texts[i]}"`));
});

await test('renders instruction text', async () => {
  const txt = await page.$eval('.correct-instruction', e => e.textContent.trim());
  assert(txt.length > 0, 'No instruction text');
});

await test('no word marked correct or wrong at start', async () => {
  const right = await page.$$eval('.correct-word--right', e => e.length);
  const wrong = await page.$$eval('.correct-word--wrong',  e => e.length);
  assert(right === 0, `Expected 0 right chips, got ${right}`);
  assert(wrong === 0, `Expected 0 wrong chips, got ${wrong}`);
});

// ── B. Tapping wrong word ────────────────────────────────────────────────
await nav();

await test('tapping wrong word adds --wrong class temporarily', async () => {
  // tap word at index 0 (not wrongIndex=1)
  const chips = await page.$$('.correct-word');
  await chips[0].tap();
  await new Promise(r => setTimeout(r, 80));
  const hasWrong = await page.evaluate(() =>
    document.querySelectorAll('.correct-word')[0].classList.contains('correct-word--wrong'));
  assert(hasWrong, 'Expected wrong chip to have --wrong class');
  // no submit yet
  const results = await page.evaluate(() => window.__results.length);
  assert(results === 0, 'Should not submit on wrong tap');
});

await test('--wrong class is removed after animation', async () => {
  await new Promise(r => setTimeout(r, 700));
  const hasWrong = await page.evaluate(() =>
    document.querySelectorAll('.correct-word')[0].classList.contains('correct-word--wrong'));
  assert(!hasWrong, '--wrong class should be removed after animation');
});

// ── C. Tapping correct word ──────────────────────────────────────────────
await nav();

await test('tapping correct word marks it green and submits with finished=true', async () => {
  const chips = await page.$$('.correct-word');
  await chips[WRONG_INDEX].tap();
  await page.waitForFunction(() => window.__results.length > 0, { timeout: 2000 });
  const last = await page.evaluate(() => window.__results.at(-1));
  assert(last.finished === true, `Expected finished=true, got ${last.finished}`);
  assert(last.answers.tapped === WRONG_INDEX, `Expected tapped=${WRONG_INDEX}, got ${last.answers.tapped}`);
  const hasRight = await page.evaluate(
    idx => document.querySelectorAll('.correct-word')[idx].classList.contains('correct-word--right'),
    WRONG_INDEX,
  );
  assert(hasRight, 'Correct word should have --right class');
});

await test('after correct tap, further taps are ignored', async () => {
  const chips = await page.$$('.correct-word');
  const prevLen = await page.evaluate(() => window.__results.length);
  await chips[0].tap();
  await new Promise(r => setTimeout(r, 150));
  const newLen = await page.evaluate(() => window.__results.length);
  assert(newLen === prevLen, 'No additional submit after correct tap');
});

// ── D. forceSubmit ───────────────────────────────────────────────────────
await nav();

await test('forceSubmit() fires with finished=false and empty answers', async () => {
  await page.evaluate(() => window.__game.forceSubmit());
  await page.waitForFunction(() => window.__results.length > 0, { timeout: 2000 });
  const last = await page.evaluate(() => window.__results.at(-1));
  assert(last.finished === false, `Expected finished=false, got ${last.finished}`);
  assert(typeof last.answers === 'object', 'answers should be an object');
});

await test('forceSubmit() does not fire twice', async () => {
  const prevLen = await page.evaluate(() => window.__results.length);
  await page.evaluate(() => window.__game.forceSubmit());
  await new Promise(r => setTimeout(r, 150));
  const newLen = await page.evaluate(() => window.__results.length);
  assert(newLen === prevLen, 'forceSubmit should not fire twice');
});

// ── E. reveal() ──────────────────────────────────────────────────────────
await nav();

await test('reveal() marks wrong word as reveal-correct with hint', async () => {
  // Tap a wrong word first
  const chips = await page.$$('.correct-word');
  await chips[0].tap();
  await new Promise(r => setTimeout(r, 80));
  await page.evaluate(() => { window.__game.forceSubmit(); window.__game.reveal(); });
  await new Promise(r => setTimeout(r, 100));

  const revealCorrect = await page.$$eval('.correct-word--reveal-correct', e => e.length);
  assert(revealCorrect === 1, `Expected 1 reveal-correct chip, got ${revealCorrect}`);

  const hint = await page.$$eval('.correct-word__hint', e => e.length);
  assert(hint >= 1, `Expected ≥1 hint text, got ${hint}`);
  await screenshot(page, SS_DIR, 'correct-reveal');
});

await test('reveal() marks wrong-tapped chips as reveal-wrong', async () => {
  const revealWrong = await page.$$eval('.correct-word--reveal-wrong', e => e.length);
  assert(revealWrong >= 1, `Expected ≥1 reveal-wrong chip, got ${revealWrong}`);
});

// ── F. Answers format ────────────────────────────────────────────────────
await nav();

await test('correct tap: answers = { tapped: wrongIndex }', async () => {
  const chips = await page.$$('.correct-word');
  await chips[WRONG_INDEX].tap();
  await page.waitForFunction(() => window.__results.length > 0, { timeout: 2000 });
  const { answers } = await page.evaluate(() => window.__results.at(-1));
  assert(answers.tapped === WRONG_INDEX, `Expected tapped=${WRONG_INDEX}, got ${answers.tapped}`);
});

// ── Summary ──────────────────────────────────────────────────────────────
await browser.close();
server.close();
console.log(`Screenshots → ${SS_DIR}`);
const failures = summary();
if (failures > 0) process.exit(1);
