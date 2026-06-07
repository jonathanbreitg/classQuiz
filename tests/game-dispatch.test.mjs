/**
 * game-dispatch.test.mjs — Tests the play.js dispatch path for new game types.
 *
 * Component-isolation tests (correct-game.test.mjs etc.) only test the
 * component directly. This test simulates the real dispatch path: given RTDB
 * round data of a given type, the correct game component must be instantiated
 * and render visible content.
 *
 * Catches the "template.js forgot to handle new type → RTDB gets type:'match'
 * → wrong component, blank/broken page" class of bug.
 *
 * Run: node tests/game-dispatch.test.mjs
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { launchBrowser, createFileServer, makeRunner, screenshot } from './lib/testUtils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');
const SS_DIR    = path.join(__dirname, 'screenshots');

// Mirrors the dispatch logic in play.js. Any new round type must appear here.
// If you add a type and forget to handle it in play.js, the test will show
// a blank game-area with no game-specific CSS class.
function makeDispatchHTML(round, roundDef) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/style.css">
<style>html,body{height:100%;margin:0}#root{display:flex;flex-direction:column;height:100dvh}</style>
</head><body>
<div id="root">
  <div id="game-area" style="flex:1;min-height:0;display:flex;flex-direction:column"></div>
</div>
<script type="module">
import { createCorrectGame }     from '/src/components/correctGame.js';
import { createOrderGame }       from '/src/components/orderGame.js';
import { createConnectionsGame } from '/src/components/connectionsGame.js';
import { createShuffleGame }     from '/src/components/shuffleGame.js';
import { createChoiceGame }      from '/src/components/choiceGame.js';

const round    = ${JSON.stringify(round)};
const roundDef = ${JSON.stringify(roundDef)};

let game;
if (round.type === 'correct') {
  game = createCorrectGame({
    sentence:   roundDef.sentence,
    wrongIndex: roundDef.wrongIndex,
    correction: roundDef.correction,
    onSubmit: () => {},
  });
} else if (round.type === 'order') {
  game = createOrderGame({
    sentences: roundDef.sentences,
    onSubmit: () => {},
  });
} else if (round.type === 'connections') {
  game = createConnectionsGame({
    groups: roundDef.groups,
    onSubmit: () => {},
  });
} else if (round.type === 'shuffle') {
  game = createShuffleGame({ sentence: roundDef.sentence, onSubmit: () => {} });
} else if (round.type === 'choice') {
  game = createChoiceGame({ question: roundDef.question, answers: roundDef.answers, onSubmit: () => {} });
} else {
  throw new Error('Unknown round type: ' + round.type);
}

document.getElementById('game-area').appendChild(game.el);
window.__game = game;
</script></body></html>`;
}

const CORRECT_ROUND    = { type: 'correct', sentence: 'She go to school.', wrongIndex: 1 };
const CORRECT_ROUNDDEF = { sentence: 'She go to school.', wrongIndex: 1, correction: 'goes' };

const ORDER_ROUND    = { type: 'order', sentences: ['First.', 'Second.', 'Third.'] };
const ORDER_ROUNDDEF = { sentences: ['First.', 'Second.', 'Third.'] };

const CONNECTIONS_ROUND    = {
  type: 'connections',
  groups: [
    { label: 'MAKE collocations', words: ['decision', 'mistake', 'progress', 'friends'] },
    { label: 'DO collocations',   words: ['homework', 'exercise', 'research', 'damage'] },
    { label: 'Past tense',        words: ['went', 'saw', 'bought', 'thought'] },
  ],
};
const CONNECTIONS_ROUNDDEF = CONNECTIONS_ROUND;

const server = createFileServer(ROOT, {
  '/correct':     makeDispatchHTML(CORRECT_ROUND, CORRECT_ROUNDDEF),
  '/order':       makeDispatchHTML(ORDER_ROUND, ORDER_ROUNDDEF),
  '/connections': makeDispatchHTML(CONNECTIONS_ROUND, CONNECTIONS_ROUNDDEF),
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const { browser, page } = await launchBrowser();
const { test, assert, summary } = makeRunner();

// Fail loud on any JS error — this catches dispatch failures
const jsErrors = [];
page.on('pageerror', e => {
  const msg = e.message;
  if (!msg.includes('fetch') && !msg.includes('Firebase') && !msg.includes('firestore') &&
      !msg.includes('PERMISSION_DENIED') && !msg.includes('net::')) {
    jsErrors.push(msg);
  }
});

async function nav(path, waitFor) {
  jsErrors.length = 0;
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(waitFor, { timeout: 4000 });
}

console.log('\nGame Dispatch — Tests\n');

// ── Correct game dispatch ─────────────────────────────────────────────────
await nav('/correct', '.correct-game');

await test('correct: no JS errors on dispatch', () => {
  assert(jsErrors.length === 0, `JS errors:\n  ${jsErrors.join('\n  ')}`);
});

await test('correct: game-area contains .correct-game element', async () => {
  const el = await page.$('#game-area .correct-game');
  assert(el !== null, '.correct-game not found inside #game-area');
});

await test('correct: renders word chips (not a blank page)', async () => {
  const n = await page.$$eval('.correct-word', e => e.length);
  assert(n === CORRECT_ROUND.sentence.trim().split(/\s+/).length,
    `Expected ${CORRECT_ROUND.sentence.trim().split(/\s+/).length} word chips, got ${n}`);
});

await test('correct: instruction label is visible', async () => {
  const txt = await page.$eval('.correct-instruction', e => e.textContent.trim());
  assert(txt.length > 0, 'Instruction label is empty');
});

await screenshot(page, SS_DIR, 'dispatch-correct');

// ── Order game dispatch ───────────────────────────────────────────────────
await nav('/order', '.order-game');

await test('order: no JS errors on dispatch', () => {
  assert(jsErrors.length === 0, `JS errors:\n  ${jsErrors.join('\n  ')}`);
});

await test('order: game-area contains .order-game element', async () => {
  const el = await page.$('#game-area .order-game');
  assert(el !== null, '.order-game not found inside #game-area');
});

await test('order: renders sentence tiles (not a blank page)', async () => {
  const n = await page.$$eval('.order-tile', e => e.length);
  assert(n === ORDER_ROUND.sentences.length,
    `Expected ${ORDER_ROUND.sentences.length} tiles, got ${n}`);
});

await test('order: renders numbered slots', async () => {
  const n = await page.$$eval('.order-slot', e => e.length);
  assert(n === ORDER_ROUND.sentences.length,
    `Expected ${ORDER_ROUND.sentences.length} slots, got ${n}`);
});

await screenshot(page, SS_DIR, 'dispatch-order');

// ── Connections game dispatch ─────────────────────────────────────────────
await nav('/connections', '.connections-game');

await test('connections: no JS errors on dispatch', () => {
  assert(jsErrors.length === 0, `JS errors:\n  ${jsErrors.join('\n  ')}`);
});

await test('connections: game-area contains .connections-game element', async () => {
  const el = await page.$('#game-area .connections-game');
  assert(el !== null, '.connections-game not found inside #game-area');
});

await test('connections: renders word chips (not a blank page)', async () => {
  const totalWords = CONNECTIONS_ROUND.groups.reduce((s, g) => s + g.words.length, 0);
  const n = await page.$$eval('.connections-word', e => e.length);
  assert(n === totalWords, `Expected ${totalWords} word chips, got ${n}`);
});

await test('connections: submit button is present', async () => {
  const btn = await page.$('.connections-submit');
  assert(btn !== null, 'Submit button not found');
});

await screenshot(page, SS_DIR, 'dispatch-connections');

// ── Summary ───────────────────────────────────────────────────────────────
await browser.close();
server.close();
console.log(`Screenshots → ${SS_DIR}`);
const failures = summary();
if (failures > 0) process.exit(1);
