/**
 * type-game.test.mjs — Integration tests for typeGame.js
 *
 * Real lerp animation + screenshots + all functional coverage.
 *
 * Run: node tests/type-game.test.mjs
 */

import path from 'path';
import { fileURLToPath } from 'url';
import {
  launchBrowser, createFileServer, makeRunner,
  waitForScrollSettled, nav, reload, screenshot,
} from './lib/testUtils.mjs';
import {
  runScrollInvariants, runLayoutChecks,
} from './lib/paragraphGameTests.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');
const SS_DIR    = path.join(__dirname, 'screenshots');

const PARAGRAPH      = 'Every morning the [cat] would sit on the [mat] and [stare] through the [window]. The [birds] outside would [sing] in the [tree]. As the [morning] light began to [fill] the [room], a [fireplace] crackled nearby. The old [dog] slept, its [chest] slowly [falling] with each [breath]. A clock on the [wall] ticked [steadily] through the [afternoon], marking each [moment].';
const SINGLE_BLANK_P = 'The quick brown [fox] jumped over the lazy dog.';
const ALL_ANSWERS    = ['cat','mat','stare','window','birds','sing','tree','morning','fill','room','fireplace','dog','chest','falling','breath','wall','steadily','afternoon','moment'];

function makeHTML(paragraph) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/style.css">
<style>html,body{height:100%;margin:0}#root{display:flex;flex-direction:column;height:100dvh}</style>
</head><body>
<div id="root"></div>
<script type="module">
import { createTypeGame } from '/src/components/typeGame.js';
window.__results=[]; window.__game=null;
const g = createTypeGame({ paragraph:${JSON.stringify(paragraph)}, onSubmit:(a,f)=>window.__results.push({answers:a,finished:f}) });
window.__game=g; document.getElementById('root').appendChild(g.el);
</script></body></html>`;
}

const server = createFileServer(ROOT, {
  '/':             makeHTML(PARAGRAPH),
  '/single-blank': makeHTML(SINGLE_BLANK_P),
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const { browser, page } = await launchBrowser();
const { test, assert, summary } = makeRunner();
const navFn = (url) => nav(page, url, '.type-blank-input');
const ws    = () => waitForScrollSettled(page);

console.log('\nType Game — Tests\n');

await navFn(BASE);
await screenshot(page, SS_DIR, 'type-initial-scroll');

// ── A. Scroll invariants ──────────────────────────────────────────────────────
await runScrollInvariants(page, test, assert, { lastIdx: 18, minPct: 0.70, waitForScroll: ws });

await test('multiple inputs accessible simultaneously (not one at a time)', async () => {
  await reload(page, '.type-blank-input');
  const n = await page.$$eval('.type-blank-input:not([readonly])', e => e.length);
  assert(n > 1, `Expected >1 editable inputs, got ${n}`);
});

// ── B. Initial render ─────────────────────────────────────────────────────────
await test('renders 19 blanks with 1 input each', async () => {
  const blanks = await page.$$('.fill-blank');
  const inputs = await page.$$('.type-blank-input');
  assert(blanks.length === 19, `Expected 19 blanks, got ${blanks.length}`);
  assert(inputs.length === 19, `Expected 19 inputs, got ${inputs.length}`);
});

await test('no word bank and no choice buttons', async () => {
  const bank    = await page.$('.fill-bank');
  const choices = await page.$('.select-choice');
  assert(!bank,    'typeGame should not have a word bank');
  assert(!choices, 'typeGame should not have choice buttons');
});

await test('first input is focused on mount', async () => {
  await reload(page, '.type-blank-input');
  const focused = await page.evaluate(() => {
    const active = document.activeElement;
    return active?.classList.contains('type-blank-input') && active?.closest('[data-idx="0"]') !== null;
  });
  assert(focused, 'First blank input should be auto-focused');
});

// ── C. Type and commit with Enter ─────────────────────────────────────────────
await test('typing + Enter commits the answer', async () => {
  await page.keyboard.type('cat');
  await page.keyboard.press('Enter');
  const { readOnly, committed, filled } = await page.evaluate(() => {
    const input = document.querySelector('[data-idx="0"] .type-blank-input');
    return { readOnly: input.readOnly, committed: input.classList.contains('type-blank-input--committed'), filled: document.querySelector('[data-idx="0"]').classList.contains('fill-blank--filled') };
  });
  assert(readOnly,  'Input should be readOnly after commit');
  assert(committed, 'Input should have --committed class');
  assert(filled,    'Blank should have --filled class');
});

await test('committed value preserved in input', async () => {
  const value = await page.$eval('[data-idx="0"] .type-blank-input', e => e.value);
  assert(value === 'cat', `Expected 'cat', got '${value}'`);
});

// ── D. Enter on empty / focus advance / blur commit ───────────────────────────
await test('Enter on empty input does not commit', async () => {
  await page.evaluate(() => document.querySelector('[data-idx="1"] .type-blank-input')?.focus());
  await page.keyboard.press('Enter');
  const { readOnly, filled } = await page.evaluate(() => ({
    readOnly: document.querySelector('[data-idx="1"] .type-blank-input').readOnly,
    filled: document.querySelector('[data-idx="1"]').classList.contains('fill-blank--filled'),
  }));
  assert(!readOnly, 'Should not be readOnly after Enter on empty');
  assert(!filled,   'Should not be --filled after Enter on empty');
});

await test('focus advances to next blank after Enter commit', async () => {
  await page.evaluate(() => document.querySelector('[data-idx="1"] .type-blank-input')?.focus());
  await page.keyboard.type('mat');
  await page.keyboard.press('Enter');
  const nextFocused = await page.evaluate(() => document.activeElement?.closest('[data-idx]')?.dataset.idx === '2');
  assert(nextFocused, 'Focus should move to blank 2');
});

await test('blur commits the answer', async () => {
  await page.evaluate(() => { document.querySelector('[data-idx="2"] .type-blank-input').focus(); });
  await page.keyboard.type('stare');
  await page.evaluate(() => document.querySelector('[data-idx="2"] .type-blank-input').blur());
  const { readOnly, committed } = await page.evaluate(() => {
    const inp = document.querySelector('[data-idx="2"] .type-blank-input');
    return { readOnly: inp.readOnly, committed: inp.classList.contains('type-blank-input--committed') };
  });
  assert(readOnly,  'Input should be readOnly after blur');
  assert(committed, 'Input should have --committed class after blur');
});

// ── E. forceSubmit ────────────────────────────────────────────────────────────
await test('forceSubmit() captures pending typed text', async () => {
  await reload(page, '.type-blank-input');
  await page.keyboard.type('cat');
  await page.keyboard.press('Enter');
  await page.evaluate(() => document.querySelector('[data-idx="1"] .type-blank-input')?.focus());
  await page.keyboard.type('mat');
  await page.keyboard.press('Enter');
  await page.keyboard.type('stare'); // pending, not committed
  await page.evaluate(() => window.__game.forceSubmit());
  await page.waitForFunction(() => window.__results.length > 0, { timeout: 2000 });
  const last = await page.evaluate(() => window.__results.at(-1));
  assert(last.answers[0] === 'cat',   `answers[0] should be 'cat'`);
  assert(last.answers[1] === 'mat',   `answers[1] should be 'mat'`);
  assert(last.answers[2] === 'stare', `forceSubmit should capture pending 'stare'`);
  assert(last.finished === false,     'forceSubmit should set finished=false');
});

await test('forceSubmit() with all empty → empty answers', async () => {
  await reload(page, '.type-blank-input');
  await page.evaluate(() => window.__game.forceSubmit());
  await page.waitForFunction(() => window.__results.length > 0, { timeout: 2000 });
  const last = await page.evaluate(() => window.__results.at(-1));
  assert(Object.keys(last.answers).length === 0, 'Empty answers expected');
  assert(last.finished === false, 'forceSubmit should be finished=false');
});

// ── F. reveal() ───────────────────────────────────────────────────────────────
await test('reveal() removes all inputs', async () => {
  await page.evaluate(() => window.__game.reveal());
  const inputs = await page.$$('.type-blank-input');
  assert(inputs.length === 0, `Expected 0 inputs after reveal, got ${inputs.length}`);
});

await test('unfilled blank gets fill-blank--wrong after reveal', async () => {
  const wrong = await page.$eval('[data-idx="0"]', e => e.classList.contains('fill-blank--wrong'));
  assert(wrong, 'Blank 0 (unfilled) should be fill-blank--wrong');
});

await test('correct answer shown in wrong blank', async () => {
  const ans = await page.$eval('[data-idx="0"] .fill-blank__correct-ans', e => e.textContent.trim());
  assert(ans === 'cat', `Correct answer hint should be 'cat', got '${ans}'`);
});

// ── G. Case-insensitive grading ───────────────────────────────────────────────
await test('answer graded case-insensitively (CAT === cat), reveal shows correct/wrong markup', async () => {
  await reload(page, '.type-blank-input');
  await page.keyboard.type('CAT');
  await page.keyboard.press('Enter');
  await page.evaluate(() => { window.__game.forceSubmit(); window.__game.reveal(); });
  const correct  = await page.$eval('[data-idx="0"]', e => e.classList.contains('fill-blank--correct'));
  const wrongEl  = await page.$('.fill-blank__correct-ans');
  assert(correct,         '"CAT" should grade as correct for "cat" (case-insensitive)');
  assert(wrongEl !== null,'Wrong blanks should show .fill-blank__correct-ans');
  await screenshot(page, SS_DIR, 'type-reveal');
});

// ── H. Auto-submit ────────────────────────────────────────────────────────────
await test('committing all 19 blanks auto-submits with finished=true', async () => {
  await reload(page, '.type-blank-input');
  const initial = await page.evaluate(() => window.__results.length);
  for (const ans of ALL_ANSWERS) {
    await page.keyboard.type(ans);
    await page.keyboard.press('Enter');
    await new Promise(r => setTimeout(r, 40));
  }
  await page.waitForFunction(n => window.__results.length > n, { timeout: 5000 }, initial);
  const last = await page.evaluate(() => window.__results.at(-1));
  assert(last.finished === true, `Auto-submit should set finished=true`);
  assert(Object.keys(last.answers).length === 19, `Expected 19 answers`);
});

// ── I. Submitted answers format ───────────────────────────────────────────────
await test('submitted answers format is {blankIdx: typedString}', async () => {
  const last = await page.evaluate(() => window.__results.at(-1));
  assert(typeof last.answers === 'object' && !Array.isArray(last.answers), 'answers should be plain object');
  assert(last.answers[0] === 'cat', `answers[0] should be 'cat'`);
});

// ── J. Layout / visual regression ────────────────────────────────────────────
await navFn(BASE);
await runLayoutChecks(page, test, assert);

await test('fill-blank--type has no outer rectangle border', async () => {
  const styles = await page.$eval('.fill-blank--type', el => {
    const cs = window.getComputedStyle(el);
    return { top: cs.borderTopWidth, left: cs.borderLeftWidth, right: cs.borderRightWidth };
  });
  assert(styles.top === '0px',   `Top border should be 0, got ${styles.top}`);
  assert(styles.left === '0px',  `Left border should be 0, got ${styles.left}`);
  assert(styles.right === '0px', `Right border should be 0, got ${styles.right}`);
});

// ── K. Animation screenshots ──────────────────────────────────────────────────
await test('scroll reaches mid-point at setProgress(0.5)', async () => {
  await page.evaluate(() => window.__game.setProgress(0.5));
  await ws();
  const scrollTop = await page.$eval('.fill-para-wrap', e => e.scrollTop);
  assert(scrollTop > 0, `scrollTop should be > 0 at 50%, got ${scrollTop}`);
  await screenshot(page, SS_DIR, 'type-timer-50pct');
});

await test('setProgress(0.99): last blank visible after animation', async () => {
  await page.evaluate(() => window.__game.setProgress(0.99));
  await ws();
  const { top, h } = await page.evaluate(() => {
    const wR = document.querySelector('.fill-para-wrap').getBoundingClientRect();
    const bR = document.querySelector('[data-idx="18"]').getBoundingClientRect();
    return { top: bR.top - wR.top, h: wR.height };
  });
  assert(top >= 0 && top < h, `Last blank top (${top.toFixed(0)}) must be in wrap (h=${h})`);
  await screenshot(page, SS_DIR, 'type-timer-99pct');
});

// ── L. Single-blank edge cases ────────────────────────────────────────────────
await navFn(`${BASE}/single-blank`);

await test('single-blank: 1 blank with 1 input', async () => {
  const blanks = await page.$$('.fill-blank');
  const inputs = await page.$$('.type-blank-input');
  assert(blanks.length === 1, `Expected 1 blank, got ${blanks.length}`);
  assert(inputs.length === 1, `Expected 1 input, got ${inputs.length}`);
});

await test('single-blank: blank is in lower half of wrap', async () => {
  const { top, h } = await page.evaluate(() => {
    const wR = document.querySelector('.fill-para-wrap').getBoundingClientRect();
    const bR = document.querySelector('[data-idx="0"]').getBoundingClientRect();
    return { top: bR.top - wR.top, h: wR.height };
  });
  assert(top > h * 0.5, `Single-blank top ${top.toFixed(0)} should be in lower half (h=${h})`);
});

await test('single-blank: setProgress(0) and (1.0) do not crash', async () => {
  await page.evaluate(() => { window.__game.setProgress(0); window.__game.setProgress(1.0); });
  const blank = await page.$('.fill-blank');
  assert(blank !== null, 'Blank should still exist');
});

await test('single-blank: typing + Enter auto-submits with finished=true', async () => {
  await navFn(`${BASE}/single-blank`);
  await page.keyboard.type('fox');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__results.length > 0, { timeout: 3000 });
  const last = await page.evaluate(() => window.__results.at(-1));
  assert(last.finished === true,    'Single blank auto-submit should be finished=true');
  assert(last.answers[0] === 'fox', `Expected answers[0]='fox', got '${last.answers[0]}'`);
});

await test('single-blank: forceSubmit() with pending text captures it', async () => {
  await navFn(`${BASE}/single-blank`);
  await page.keyboard.type('fox');
  await page.evaluate(() => window.__game.forceSubmit());
  await page.waitForFunction(() => window.__results.length > 0, { timeout: 2000 });
  const last = await page.evaluate(() => window.__results.at(-1));
  assert(last.answers[0] === 'fox', `Expected 'fox', got '${last.answers[0]}'`);
  assert(last.finished === false, 'forceSubmit should be finished=false');
});

// ── Summary ───────────────────────────────────────────────────────────────────
await browser.close();
server.close();
console.log(`Screenshots → ${SS_DIR}`);
const failures = summary();
if (failures > 0) process.exit(1);
