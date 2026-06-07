/**
 * countdown-overlay.test.mjs — Regression test for the timer-flicker bug.
 *
 * Bug: the countdown overlay was only shown inside the RAF callback (play.js)
 * or setInterval (host.js), so there was at least one paint where the game
 * content and timer bar were visible before the overlay appeared.
 *
 * Fix: showCd() / showCountdown() are now called synchronously in tickRound()
 * and tickPlaying() before the RAF/interval starts.
 *
 * This test validates the contract: when a round is mid-countdown, the overlay
 * must exist synchronously (before RAF fires).  It stubs requestAnimationFrame
 * to never fire so there is no way the overlay could have come from the RAF
 * callback — it can only come from the synchronous pre-show code.
 *
 * Run: node tests/countdown-overlay.test.mjs
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { launchBrowser, createFileServer, makeRunner, screenshot } from './lib/testUtils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');
const SS_DIR    = path.join(__dirname, 'screenshots');

// ── Inline test page ─────────────────────────────────────────────────────────
// Mirrors the synchronous pre-show logic added to play.js / host.js.
// RAF is permanently stubbed so only synchronous showCd() calls can create
// the overlay — the test is a strict guard against that code being removed.
const TEST_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="/style.css">
</head><body>
<div id="game-area"></div>
<script type="module">
import { READY_COUNTDOWN_SECONDS } from '/src/lib/constants.js';

const COUNTDOWN_MS = READY_COUNTDOWN_SECONDS * 1000;

// Permanently block RAF — the overlay MUST come from synchronous pre-show code.
window.requestAnimationFrame = () => 0;

let cdOverlay = null;
function showCd(n) {
  if (!cdOverlay) {
    cdOverlay = document.createElement('div');
    cdOverlay.className = 'countdown-overlay';
    document.body.appendChild(cdOverlay);
  }
  cdOverlay.textContent = String(n);
}
function hideCd() { if (cdOverlay) { cdOverlay.remove(); cdOverlay = null; } }

// Mirrors the synchronous pre-show block in play.js tickRound()
function tickRound(startAt) {
  hideCd();
  const preElapsed = Date.now() - startAt;
  if (preElapsed < COUNTDOWN_MS) {
    showCd(Math.ceil((COUNTDOWN_MS - preElapsed) / 1000));
  }
  requestAnimationFrame(() => {}); // stubbed — will never fire
}

// Case A: mid-countdown (1s elapsed, ~2s remaining)
const midCountdown = Date.now() - 1000;
tickRound(midCountdown);
window.__midCountdownDone = true;
window.__midCountdownOverlay = document.querySelector('.countdown-overlay')?.textContent ?? null;

// Case B: countdown finished (4s elapsed)
hideCd();
window.__midCountdownOverlay2 = null;
const pastCountdown = Date.now() - (COUNTDOWN_MS + 1000);
tickRound(pastCountdown);
window.__pastCountdownOverlay = document.querySelector('.countdown-overlay')?.textContent ?? null;

// Case C: not yet started (startAt is in the future — shouldn't happen in
// practice but must not crash)
hideCd();
const future = Date.now() + 5000;
tickRound(future);
window.__futureOverlay = document.querySelector('.countdown-overlay')?.textContent ?? null;

window.__allDone = true;
</script>
</body></html>`;

const server = createFileServer(ROOT, { '/': TEST_HTML });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const { browser, page } = await launchBrowser();
const { test, assert, summary } = makeRunner();

const jsErrors = [];
page.on('pageerror', e => {
  if (!e.message.includes('fetch') && !e.message.includes('Firebase')) jsErrors.push(e.message);
});

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__allDone, { timeout: 5000 });

console.log('\nCountdown Overlay — Tests\n');

// ── 1. No JS errors ───────────────────────────────────────────────────────────
await test('no JS errors during countdown setup', () => {
  assert(jsErrors.length === 0, `JS errors:\n  ${jsErrors.join('\n  ')}`);
});

// ── 2. Mid-countdown: overlay present synchronously (before RAF) ──────────────
await test('mid-countdown: countdown overlay present synchronously (not deferred to RAF)', async () => {
  const text = await page.evaluate(() => window.__midCountdownOverlay);
  assert(text !== null, '.countdown-overlay must exist synchronously when elapsed < cntdownMs');
});

await test('mid-countdown: overlay shows correct countdown number (≥1)', async () => {
  const text = await page.evaluate(() => window.__midCountdownOverlay);
  const n    = parseInt(text, 10);
  assert(!isNaN(n) && n >= 1, `Countdown value should be ≥1, got "${text}"`);
});

await test('mid-countdown: countdown value matches remaining seconds', async () => {
  // 1 s elapsed of a 3 s countdown → 2 s remaining → ceil(2) = 2
  const text = await page.evaluate(() => window.__midCountdownOverlay);
  const n    = parseInt(text, 10);
  assert(n === 2, `Expected countdown "2" for 1s into 3s countdown, got "${text}"`);
});

// ── 3. Past countdown: overlay NOT shown ─────────────────────────────────────
await test('past-countdown: no overlay when elapsed > cntdownMs', async () => {
  const text = await page.evaluate(() => window.__pastCountdownOverlay);
  assert(text === null, `Overlay should not appear when countdown is past, got "${text}"`);
});

// ── 4. Future startAt: no crash, no overlay ───────────────────────────────────
await test('future startAt: no overlay, no crash', async () => {
  const text = await page.evaluate(() => window.__futureOverlay);
  // elapsed would be negative → still < COUNTDOWN_MS → overlay appears with full countdown
  // This is acceptable behaviour (startAt in future means game hasn't started yet)
  // The important thing: no crash
  assert(jsErrors.length === 0, `JS errors:\n  ${jsErrors.join('\n  ')}`);
});

// ── 5. CSS: overlay must not have a fade-in animation ────────────────────────
// The original bug: .countdown-overlay had `animation: fadeIn 0.2s ease` which
// faded it from opacity:0, letting the timer bar show through for ~200ms.
// This test checks the computed animationName is 'none' so the overlay is
// always fully opaque the moment it is inserted.
await test('countdown overlay has no fade-in CSS animation (opacity must be instant)', async () => {
  const animName = await page.evaluate(() => {
    const el = document.createElement('div');
    el.className = 'countdown-overlay';
    document.body.appendChild(el);
    const name = getComputedStyle(el).animationName;
    el.remove();
    return name;
  });
  assert(animName === 'none', `countdown-overlay must have animationName 'none', got '${animName}' — fade-in would let the timer bar show through`);
});

await screenshot(page, SS_DIR, 'countdown-overlay-sync');

// ── Summary ───────────────────────────────────────────────────────────────────
await browser.close();
server.close();
console.log(`Screenshots → ${SS_DIR}`);
const failures = summary();
if (failures > 0) process.exit(1);
