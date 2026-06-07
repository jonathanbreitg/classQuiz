/**
 * select-game.test.mjs — Integration tests for selectGame.js
 *
 * Real lerp animation + screenshots + all functional coverage.
 *
 * Run: node tests/select-game.test.mjs
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

const PARAGRAPH = 'She [ran] quickly to the [store] because she had [forgotten] her wallet at home. The [morning] was bright and the streets were [busy] with traffic. She [bought] some [milk] and a loaf of [bread] before heading back. The [sun] was already high in the sky when she finally [returned] to her apartment on the third [floor]. She [opened] the door and [placed] the groceries on the [kitchen] counter, then sat down to [rest] for a moment.';
const CHOICES = {
  0:  ['ran','walked','flew'],    1:  ['store','school','park'],
  2:  ['forgotten','lost','left'],3:  ['morning','evening','night'],
  4:  ['busy','quiet','empty'],   5:  ['bought','sold','found'],
  6:  ['milk','bread','eggs'],    7:  ['bread','cake','fruit'],
  8:  ['sun','moon','rain'],      9:  ['returned','arrived','escaped'],
  10: ['floor','street','roof'],  11: ['opened','closed','locked'],
  12: ['placed','threw','dropped'],13: ['kitchen','bedroom','living room'],
  14: ['rest','sleep','work'],
};
const CORRECT = ['ran','store','forgotten','morning','busy','bought','milk','bread','sun','returned','floor','opened','placed','kitchen','rest'];
const SINGLE_BLANK_P = 'The quick brown [fox] jumped over the lazy dog.';
const SINGLE_CHOICES = { 0: ['fox','cat','dog'] };

function makeHTML(paragraph, choices) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/style.css">
<style>html,body{height:100%;margin:0}#root{display:flex;flex-direction:column;height:100dvh}</style>
</head><body>
<div id="root"></div>
<script type="module">
import { createSelectGame } from '/src/components/selectGame.js';
window.__results=[]; window.__game=null;
const g = createSelectGame({ paragraph:${JSON.stringify(paragraph)}, choices:${JSON.stringify(choices)}, onSubmit:(a,f)=>window.__results.push({answers:a,finished:f}) });
window.__game=g; document.getElementById('root').appendChild(g.el);
</script></body></html>`;
}

const server = createFileServer(ROOT, {
  '/':             makeHTML(PARAGRAPH, CHOICES),
  '/single-blank': makeHTML(SINGLE_BLANK_P, SINGLE_CHOICES),
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const { browser, page } = await launchBrowser();
const { test, assert, summary } = makeRunner();
const navFn = (url) => nav(page, url, '.select-choices');
const ws    = () => waitForScrollSettled(page);

console.log('\nSelect Game — Tests\n');

await navFn(BASE);
await screenshot(page, SS_DIR, 'select-initial-scroll');

// ── A. Scroll invariants ──────────────────────────────────────────────────────
await runScrollInvariants(page, test, assert, { lastIdx: 14, minPct: 0.70, waitForScroll: ws });
await assertNoFutureBlanks(page, assert);

await test('multiple blanks visible and unlocked at start', async () => {
  const n = await page.$$eval('.fill-blank:not(.fill-blank--locked)', e => e.length);
  assert(n > 1, `Expected >1 unlocked blanks, got ${n}`);
});

// ── B. Initial render ─────────────────────────────────────────────────────────
await reload(page, '.select-choices');

await test('renders 15 blanks with .select-choices containers', async () => {
  const blanks  = await page.$$('.fill-blank');
  const choices = await page.$$('.select-choices');
  assert(blanks.length === 15,  `Expected 15 blanks, got ${blanks.length}`);
  assert(choices.length === 15, `Expected 15 choice containers, got ${choices.length}`);
});

await test('no word bank', async () => {
  const bank = await page.$('.fill-bank');
  assert(!bank, 'selectGame should not have a word bank');
});

await test('every blank has ≥2 choice buttons', async () => {
  const counts = await page.$$eval('.fill-blank', blanks =>
    blanks.map(b => b.querySelectorAll('.select-choice').length)
  );
  assert(counts.every(n => n >= 2), `All blanks need ≥2 choices; got ${JSON.stringify(counts)}`);
});

await test('correct answer included in choices for every blank', async () => {
  const found = await page.$$eval('.fill-blank', (blanks, correct) =>
    blanks.map((b, i) => [...b.querySelectorAll('.select-choice')].map(btn => btn.textContent.trim()).includes(correct[i])),
    CORRECT
  );
  assert(found.every(Boolean), `Correct answer missing for blanks: ${JSON.stringify(found)}`);
});

// ── C. Click a choice ─────────────────────────────────────────────────────────
await test('clicking a choice marks it --selected and blank as --filled', async () => {
  await page.evaluate(() => document.querySelector('.fill-blank .select-choice').click());
  const sel    = await page.$$eval('.select-choice--selected', e => e.length);
  const filled = await page.$eval('[data-idx="0"]', e => e.classList.contains('fill-blank--filled'));
  assert(sel === 1, `Expected 1 selected, got ${sel}`);
  assert(filled, 'Blank 0 should be filled');
});

await test('clicking a different choice deselects old, selects new', async () => {
  const buttons = await page.$$('[data-idx="0"] .select-choice');
  const firstSel = await buttons[0].evaluate(e => e.classList.contains('select-choice--selected'));
  await (firstSel ? buttons[1] : buttons[0]).click();
  const selCount = await page.$$eval('[data-idx="0"] .select-choice--selected', e => e.length);
  assert(selCount === 1, `Exactly 1 choice should be selected, got ${selCount}`);
});

// ── D. Auto-submit ────────────────────────────────────────────────────────────
await test('filling all 15 blanks auto-submits with finished=true', async () => {
  await reload(page, '.select-choices');
  await page.evaluate((correct) => {
    correct.forEach((ans, idx) => {
      const btn = [...document.querySelectorAll(`[data-idx="${idx}"] .select-choice`)].find(b => b.textContent.trim() === ans);
      btn?.click();
    });
  }, CORRECT);
  await page.waitForFunction(() => window.__results.length > 0, { timeout: 3000 });
  const last = await page.evaluate(() => window.__results.at(-1));
  assert(last.finished === true, `Expected finished=true, got ${last.finished}`);
  assert(Object.keys(last.answers).length === 15, `Expected 15 answers`);
});

// ── E. forceSubmit / reveal ───────────────────────────────────────────────────
await test('forceSubmit() fires with finished=false', async () => {
  await reload(page, '.select-choices');
  await page.evaluate(() => window.__game.forceSubmit());
  await page.waitForFunction(() => window.__results.length > 0, { timeout: 2000 });
  const last = await page.evaluate(() => window.__results.at(-1));
  assert(last.finished === false, `Expected finished=false`);
});

await test('reveal() removes choice buttons, marks correct/wrong blanks, shows correct-ans hint', async () => {
  await reload(page, '.select-choices');
  await page.evaluate(() => {
    [...document.querySelectorAll('[data-idx="0"] .select-choice')].find(b => b.textContent.trim() === 'ran')?.click();
    window.__game.forceSubmit();
    window.__game.reveal();
  });
  const choiceButtons = await page.$$('.select-choice');
  const correct  = await page.$eval('[data-idx="0"]', e => e.classList.contains('fill-blank--correct'));
  const wrong    = await page.$eval('[data-idx="1"]', e => e.classList.contains('fill-blank--wrong'));
  const wrongEl  = await page.$('.fill-blank__correct-ans');
  assert(choiceButtons.length === 0, `Expected 0 choice buttons after reveal`);
  assert(correct,         'Blank 0 (correct answer) should be fill-blank--correct');
  assert(wrong,           'Blank 1 (unfilled) should be fill-blank--wrong');
  assert(wrongEl !== null,'Wrong blanks should show .fill-blank__correct-ans');
  await screenshot(page, SS_DIR, 'select-reveal');
});

// ── F. Choices are shuffled ───────────────────────────────────────────────────
await test('choices are shuffled across page loads', async () => {
  const orders = new Set();
  for (let i = 0; i < 5; i++) {
    await reload(page, '.select-choices');
    const order = await page.$$eval('[data-idx="0"] .select-choice', e => e.map(b => b.textContent.trim()).join(','));
    orders.add(order);
  }
  assert(orders.size > 1, `Choices should be shuffled; always got: ${[...orders].join(' | ')}`);
});

// ── G. Submitted answers format ───────────────────────────────────────────────
await test('submitted answers is {blankIdx: word}', async () => {
  await reload(page, '.select-choices');
  await page.evaluate(() => {
    [...document.querySelectorAll('[data-idx="0"] .select-choice')].find(b => b.textContent.trim() === 'ran')?.click();
    window.__game.forceSubmit();
  });
  await page.waitForFunction(() => window.__results.length > 0, { timeout: 2000 });
  const { answers } = await page.evaluate(() => window.__results.at(-1));
  assert(typeof answers === 'object' && !Array.isArray(answers), 'answers should be a plain object');
  assert(answers[0] === 'ran', `answers[0] should be 'ran', got '${answers[0]}'`);
});

// ── H. Layout / visual regression ────────────────────────────────────────────
await navFn(BASE);
await runLayoutChecks(page, test, assert);

await test('fill-blank--select has dotted underline only (no rectangle border)', async () => {
  const styles = await page.$eval('.fill-blank--select', el => {
    const cs = window.getComputedStyle(el);
    return { top: cs.borderTopWidth, left: cs.borderLeftWidth, right: cs.borderRightWidth, bottom: cs.borderBottomStyle };
  });
  assert(styles.top === '0px',      `Top border should be 0, got ${styles.top}`);
  assert(styles.left === '0px',     `Left border should be 0, got ${styles.left}`);
  assert(styles.right === '0px',    `Right border should be 0, got ${styles.right}`);
  assert(styles.bottom === 'dotted',`Bottom border should be dotted, got ${styles.bottom}`);
});

// ── I. Animation screenshots ──────────────────────────────────────────────────
await test('scroll reaches mid-point at setProgress(0.5)', async () => {
  await reload(page, '.select-choices');
  await page.evaluate(() => window.__game.setProgress(0.5));
  await ws();
  const scrollTop = await page.$eval('.fill-para-wrap', e => e.scrollTop);
  assert(scrollTop > 0, `scrollTop should be > 0 at 50%, got ${scrollTop}`);
  await screenshot(page, SS_DIR, 'select-timer-50pct');
});

await test('setProgress(0.99): last blank visible after animation', async () => {
  await page.evaluate(() => window.__game.setProgress(0.99));
  await ws();
  const { top, h } = await page.evaluate(() => {
    const wR = document.querySelector('.fill-para-wrap').getBoundingClientRect();
    const bR = document.querySelector('[data-idx="14"]').getBoundingClientRect();
    return { top: bR.top - wR.top, h: wR.height };
  });
  assert(top >= 0 && top < h, `Last blank top (${top.toFixed(0)}) must be in wrap (h=${h})`);
  await screenshot(page, SS_DIR, 'select-timer-99pct');
});

// ── J. Single-blank ───────────────────────────────────────────────────────────
await runSingleBlankEdgeCases(page, test, assert, {
  navFn,
  singleUrl: `${BASE}/single-blank`,
  triggerSubmit: () => page.evaluate(() => {
    [...document.querySelectorAll('.select-choice')].find(b => b.textContent.trim() === 'fox')?.click();
  }),
  expectedAnswer: 'fox',
});

// ── Summary ───────────────────────────────────────────────────────────────────
await browser.close();
server.close();
console.log(`Screenshots → ${SS_DIR}`);
const failures = summary();
if (failures > 0) process.exit(1);
