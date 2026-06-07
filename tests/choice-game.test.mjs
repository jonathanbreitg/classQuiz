/**
 * choice-game.test.mjs — Integration tests for choiceGame.js
 *
 * Run: node tests/choice-game.test.mjs
 */

import path from 'path';
import { fileURLToPath } from 'url';
import {
  launchBrowser, createFileServer, makeRunner, screenshot,
} from './lib/testUtils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');
const SS_DIR    = path.join(__dirname, 'screenshots');

const QUESTION = 'What is the capital of France?';
const ANSWERS  = [
  { text: 'Paris',  correct: true  },
  { text: 'London', correct: false },
  { text: 'Berlin', correct: false },
  { text: 'Madrid', correct: false },
];

const MULTI_ANSWERS = [
  { text: 'Red',   correct: true  },
  { text: 'Blue',  correct: false },
  { text: 'Green', correct: true  },
  { text: 'Black', correct: false },
];

function makeHTML(question, answers) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/style.css">
<style>html,body{height:100%;margin:0}#root{display:flex;flex-direction:column;height:100dvh}</style>
</head><body>
<div id="root"></div>
<script type="module">
import { createChoiceGame } from '/src/components/choiceGame.js';
window.__results=[]; window.__game=null;
const g = createChoiceGame({ question:${JSON.stringify(question)}, answers:${JSON.stringify(answers)}, onSubmit:(a,f)=>window.__results.push({answers:a,finished:f}) });
window.__game=g; document.getElementById('root').appendChild(g.el);
</script></body></html>`;
}

const server = createFileServer(ROOT, {
  '/':       makeHTML(QUESTION, ANSWERS),
  '/multi':  makeHTML('Pick all warm colours', MULTI_ANSWERS),
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const { browser, page } = await launchBrowser();
const { test, assert, summary } = makeRunner();

const nav = async (url) => {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.choice-btn', { timeout: 4000 });
};

console.log('\nChoice Game — Tests\n');

// ── A. Initial render ─────────────────────────────────────────────────────
await nav(BASE);
await screenshot(page, SS_DIR, 'choice-initial');

await test('renders the question text', async () => {
  const q = await page.$eval('.choice-question', e => e.textContent.trim());
  assert(q === QUESTION, `Expected question '${QUESTION}', got '${q}'`);
});

await test('renders 4 answer buttons', async () => {
  const n = await page.$$eval('.choice-btn', e => e.length);
  assert(n === 4, `Expected 4 buttons, got ${n}`);
});

await test('each button has a letter (A/B/C/D)', async () => {
  const letters = await page.$$eval('.choice-btn__letter', e => e.map(l => l.textContent.trim()));
  assert(JSON.stringify(letters) === JSON.stringify(['A','B','C','D']),
    `Expected [A,B,C,D], got [${letters}]`);
});

await test('each button shows the answer text', async () => {
  const texts = await page.$$eval('.choice-btn__text', e => e.map(t => t.textContent.trim()));
  const expected = ANSWERS.map(a => a.text);
  assert(JSON.stringify(texts) === JSON.stringify(expected),
    `Answer texts mismatch. Got: ${texts}`);
});

await test('no submit button present', async () => {
  const btn = await page.$('.choice-submit');
  assert(btn === null, 'Expected no .choice-submit button');
});

await test('no button is selected at start', async () => {
  const sel = await page.$$eval('.choice-btn--selected', e => e.length);
  assert(sel === 0, `Expected 0 selected, got ${sel}`);
});

// ── B. Click auto-submits ─────────────────────────────────────────────────
await nav(BASE);

await test('clicking a button immediately submits with finished=true', async () => {
  await page.evaluate(() => document.querySelectorAll('.choice-btn')[0].click());
  await page.waitForFunction(() => window.__results.length > 0, { timeout: 2000 });
  const last = await page.evaluate(() => window.__results.at(-1));
  assert(last.finished === true, `Expected finished=true, got ${last.finished}`);
  assert(last.answers[0] === true, `Expected answers[0]=true`);
});

await nav(BASE);

await test('after click-submit, further clicks do nothing', async () => {
  await page.evaluate(() => document.querySelectorAll('.choice-btn')[0].click());
  await page.waitForFunction(() => window.__results.length > 0, { timeout: 2000 });
  const countBefore = await page.evaluate(() => window.__results.length);
  await page.evaluate(() => document.querySelectorAll('.choice-btn')[1].click());
  const countAfter = await page.evaluate(() => window.__results.length);
  assert(countAfter === countBefore, 'Should not fire a second submit');
});

// ── C. forceSubmit (no prior click) ──────────────────────────────────────
await nav(BASE);

await test('forceSubmit() with nothing clicked returns empty answers', async () => {
  await page.evaluate(() => window.__game.forceSubmit());
  await page.waitForFunction(() => window.__results.length > 0, { timeout: 2000 });
  const last = await page.evaluate(() => window.__results.at(-1));
  assert(Object.keys(last.answers).length === 0, 'Expected empty answers when nothing clicked');
  assert(last.finished === false, 'Expected finished=false');
});

// ── D. reveal() ───────────────────────────────────────────────────────────
// Click a wrong answer (London=index 1), then call reveal()
await nav(BASE);
await screenshot(page, SS_DIR, 'choice-before-reveal');

await test('reveal() disables further interaction', async () => {
  await page.evaluate(() => document.querySelectorAll('.choice-btn')[1].click()); // London (wrong) — auto-submits
  await page.waitForFunction(() => window.__results.length > 0, { timeout: 2000 });
  await page.evaluate(() => window.__game.reveal());
  const resultsBefore = await page.evaluate(() => window.__results.length);
  await page.evaluate(() => document.querySelectorAll('.choice-btn')[2].click());
  const resultsAfter = await page.evaluate(() => window.__results.length);
  assert(resultsAfter === resultsBefore, 'No extra submit after reveal');
});

await test('reveal() marks correct answer with --reveal-correct', async () => {
  const correct = await page.$$eval('.choice-btn--reveal-correct', e => e.length);
  assert(correct === 1, `Expected 1 correct button (Paris), got ${correct}`);
});

await test('reveal() marks wrongly-selected answer with --reveal-wrong', async () => {
  const wrong = await page.$$eval('.choice-btn--reveal-wrong', e => e.length);
  assert(wrong === 1, `Expected 1 wrong-selected button (London), got ${wrong}`);
});

await test('reveal() marks unselected+wrong answers neutral', async () => {
  const neutral = await page.$$eval('.choice-btn--reveal-neutral', e => e.length);
  assert(neutral === 2, `Expected 2 neutral buttons, got ${neutral}`);
});

await screenshot(page, SS_DIR, 'choice-reveal');

// ── E. Correct answer scenario ────────────────────────────────────────────
await nav(`${BASE}/multi`);

await test('clicking correct answer submits it', async () => {
  await page.evaluate(() => document.querySelectorAll('.choice-btn')[0].click()); // Red (correct)
  await page.waitForFunction(() => window.__results.length > 0, { timeout: 2000 });
  const last = await page.evaluate(() => window.__results.at(-1));
  assert(last.answers[0] === true, 'Clicked answer should be in answers object');
  assert(last.answers[1] === undefined && last.answers[2] === undefined,
    'Other answers should not be in answers object');
});

// ── G. No-double-submit ───────────────────────────────────────────────────
await nav(BASE);

await test('after forceSubmit, clicking buttons does nothing', async () => {
  await page.evaluate(() => window.__game.forceSubmit());
  await page.waitForFunction(() => window.__results.length > 0, { timeout: 2000 });
  const countBefore = await page.evaluate(() => window.__results.length);
  await page.evaluate(() => {
    document.querySelectorAll('.choice-btn')[0].click();
    document.querySelectorAll('.choice-btn')[0].click();
  });
  const countAfter = await page.evaluate(() => window.__results.length);
  assert(countAfter === countBefore, 'Should not fire onSubmit again after already submitted');
});

// ── Summary ───────────────────────────────────────────────────────────────
await browser.close();
server.close();
console.log(`Screenshots → ${SS_DIR}`);
const failures = summary();
if (failures > 0) process.exit(1);
