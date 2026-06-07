/**
 * app-smoke.test.mjs — Sanity check that the real app (all modules loaded together)
 * renders visible content and has no fatal JS errors on key routes.
 *
 * This catches module-level syntax errors, duplicate declarations, and bad imports
 * that component-isolation tests would miss because those tests never load the full
 * module graph.
 *
 * Run: node tests/app-smoke.test.mjs
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { launchBrowser, createFileServer, makeRunner, screenshot } from './lib/testUtils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');
const SS_DIR    = path.join(__dirname, 'screenshots');

// Serve the real app — no synthetic HTML, just the project directory.
// Puppeteer loads index.html which imports app.js which pulls in every page module.
const server = createFileServer(ROOT);
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const { browser, page } = await launchBrowser();
const { test, assert, summary } = makeRunner();

// Collect fatal errors: syntax errors, duplicate declarations, missing modules.
// Ignore known-harmless Firebase network errors (no credentials in test env).
const fatalErrors = [];
page.on('pageerror', e => {
  const msg = e.message;
  const isFatal = !msg.includes('fetch') &&
                  !msg.includes('firestore') &&
                  !msg.includes('Firebase') &&
                  !msg.includes('PERMISSION_DENIED') &&
                  !msg.includes('ERR_NAME_NOT_RESOLVED') &&
                  !msg.includes('net::');
  if (isFatal) fatalErrors.push(msg);
});

async function loadRoute(hash) {
  fatalErrors.length = 0;
  await page.goto(`${BASE}/${hash}`, { waitUntil: 'domcontentloaded', timeout: 10000 });
  // Give modules a moment to parse and execute
  await new Promise(r => setTimeout(r, 600));
}

function appContent() {
  return page.$eval('#app', el => el.innerHTML.trim());
}

console.log('\nApp Smoke Tests\n');

// ── Home page ─────────────────────────────────────────────────────────────
await loadRoute('');

await test('home page: no fatal JS errors', () => {
  assert(fatalErrors.length === 0,
    `Fatal JS error(s):\n  ${fatalErrors.join('\n  ')}`);
});

await test('home page: #app is not blank', async () => {
  const html = await appContent();
  assert(html.length > 50, `#app is nearly empty (${html.length} chars)`);
});

await test('home page: renders recognisable content', async () => {
  const text = await page.evaluate(() => document.body.innerText);
  const lower = text.toLowerCase();
  assert(lower.includes('join') || lower.includes('create') || lower.includes('quiz'),
    `Home page text doesn't look right: "${text.substring(0, 200)}"`);
});

await screenshot(page, SS_DIR, 'smoke-home');

// ── Create page ───────────────────────────────────────────────────────────
await loadRoute('#/create');

await test('create page: no fatal JS errors', () => {
  assert(fatalErrors.length === 0,
    `Fatal JS error(s):\n  ${fatalErrors.join('\n  ')}`);
});

await test('create page: #app is not blank', async () => {
  const html = await appContent();
  assert(html.length > 50, `#app is nearly empty (${html.length} chars)`);
});

await test('create page: add-round buttons are present', async () => {
  const n = await page.$$eval('.add-round-btn', e => e.length);
  assert(n >= 6, `Expected ≥6 add-round buttons on create page, got ${n}`);
});

await screenshot(page, SS_DIR, 'smoke-create');

// ── 404 route ─────────────────────────────────────────────────────────────
await loadRoute('#/this-route-does-not-exist');

await test('unknown route: no fatal JS errors', () => {
  assert(fatalErrors.length === 0,
    `Fatal JS error(s):\n  ${fatalErrors.join('\n  ')}`);
});

await test('unknown route: shows some content (not blank)', async () => {
  const html = await appContent();
  assert(html.length > 10, `#app is blank on unknown route`);
});

// ── Summary ───────────────────────────────────────────────────────────────
await browser.close();
server.close();
console.log(`Screenshots → ${SS_DIR}`);
const failures = summary();
if (failures > 0) process.exit(1);
