/**
 * create-page.test.mjs — Integration tests for the Create page.
 *
 * Screenshots + all functional coverage.
 *
 * Run: node tests/create-page.test.mjs
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { launchBrowser, createFileServer, makeRunner, screenshot } from './lib/testUtils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');
const SS_DIR    = path.join(__dirname, 'screenshots');

const TEST_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/style.css">
<style>html,body{height:100%;margin:0}#root{display:flex;flex-direction:column;min-height:100dvh}</style>
</head><body>
<div id="root"></div>
<script type="module">
window.addEventListener('unhandledrejection', e => {
  if (e.reason?.message?.includes('fetch') || e.reason?.code?.startsWith?.('firestore') || e.reason?.code?.startsWith?.('auth')) e.preventDefault();
});
import { mountCreate } from '/src/pages/create.js';
mountCreate(document.getElementById('root'));
</script></body></html>`;

const server = createFileServer(ROOT, { '/': TEST_HTML });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const { browser, page } = await launchBrowser();
const { test, assert, summary } = makeRunner();

async function loadPage() {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#title', { timeout: 15000 });
}
async function reloadPage() {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#title', { timeout: 10000 });
}

console.log('\nCreate Page — Tests\n');

await loadPage();
await screenshot(page, SS_DIR, 'create-empty-page');

// ── 1. Basic render ───────────────────────────────────────────────────────────
await test('page renders with a title input', async () => {
  const el = await page.$('#title');
  assert(el !== null, 'Title input should exist');
});

await test('all 6 add-round buttons exist', async () => {
  const btns = await page.$$('.add-round-btn');
  assert(btns.length === 6, `Expected 6 add-round buttons, got ${btns.length}`);
});

await test('add-round button text does not overflow on 390px mobile', async () => {
  const bad = await page.$$eval('.add-round-btn', btns =>
    btns.filter(b => b.scrollWidth > b.offsetWidth + 2).map(b => b.textContent.trim())
  );
  assert(bad.length === 0, `Buttons overflow: ${bad.map(b => `"${b}"`).join(', ')}`);
});

// ── 2. Adding rounds individually ─────────────────────────────────────────────
await test('clicking "+ Match" adds a match round card', async () => {
  await page.click('#add-match-btn');
  await page.waitForSelector('.round-card');
  const cards = await page.$$('.round-card');
  assert(cards.length === 1, `Expected 1 card, got ${cards.length}`);
});

await test('match round has a seconds field defaulting to 20', async () => {
  const val = await page.$eval('[data-round-seconds="0"]', e => e.value);
  assert(val === '20', `Expected default seconds=20, got ${val}`);
});

await test('clicking "+ Fill-in-blank" adds a fill round card', async () => {
  await page.click('#add-fill-btn');
  await page.waitForFunction(() => document.querySelectorAll('.round-card').length >= 2);
  const secInput = await page.$('[data-round-seconds="1"]');
  const wbInput  = await page.$('[data-fill-wb="1"]');
  assert(secInput !== null, 'Fill round should have a seconds input');
  assert(wbInput  !== null, 'Fill round should have a word-bank-size input');
});

await test('clicking "+ Select word" adds a select round card', async () => {
  await page.click('#add-select-btn');
  await page.waitForFunction(() => document.querySelectorAll('.round-card').length >= 3);
  const para = await page.$('[data-select-para="2"]');
  assert(para !== null, 'Select round should have a paragraph textarea');
});

await test('clicking "+ Type answer" adds a type round card', async () => {
  await page.click('#add-type-btn');
  await page.waitForFunction(() => document.querySelectorAll('.round-card').length >= 4);
  const para = await page.$('[data-type-para="3"]');
  assert(para !== null, 'Type round should have a paragraph textarea');
});

await test('no "blanks visible" field in any round card', async () => {
  const bvInputs = await page.$$('[data-fill-bv],[data-select-bv],[data-type-bv]');
  assert(bvInputs.length === 0, `Found ${bvInputs.length} blanksVisible inputs — should be removed`);
  const labels = await page.$$eval('label', els =>
    els.filter(l => l.textContent.toLowerCase().includes('blank') && l.textContent.toLowerCase().includes('visible')).length
  );
  assert(labels === 0, `Found ${labels} "blanks visible" labels`);
});

// ── 3. All 4 round types: seconds default to 20 + screenshot ─────────────────
await test('all round types have seconds fields defaulting to 20', async () => {
  const vals = await page.$$eval('[data-round-seconds]', els => els.map(e => e.value));
  assert(vals.length === 4, `Expected 4 seconds fields, got ${vals.length}`);
  assert(vals.every(v => v === '20'), `All should default to 20, got ${JSON.stringify(vals)}`);
});

await screenshot(page, SS_DIR, 'create-all-rounds');

// ── 4. Paragraph preview updates ──────────────────────────────────────────────
await test('fill round: typing paragraph shows blank count', async () => {
  await page.evaluate(() => {
    const ta = document.querySelector('[data-fill-para="1"]');
    ta.value = 'He ate a [red] apple and a [green] salad.';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForFunction(() => {
    const el = document.querySelector('#fill-preview-1');
    return el && el.textContent.includes('2');
  }, { timeout: 2000 });
  const preview = await page.$eval('#fill-preview-1', e => e.textContent.trim());
  assert(preview.includes('2'), `Expected "2 blanks" in preview, got: "${preview}"`);
  await screenshot(page, SS_DIR, 'create-fill-preview');
});

await test('type round: typing paragraph shows blank count', async () => {
  await page.evaluate(() => {
    const ta = document.querySelector('[data-type-para="3"]');
    ta.value = 'The [cat] sat on the [mat].';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForFunction(() => {
    const el = document.querySelector('#type-preview-3');
    return el && el.textContent.includes('2');
  }, { timeout: 2000 });
  const preview = await page.$eval('#type-preview-3', e => e.textContent.trim());
  assert(preview.includes('2'), `Expected "2 blanks" in preview, got: "${preview}"`);
});

await test('select round: typing paragraph reveals choices section', async () => {
  await page.evaluate(() => {
    const ta = document.querySelector('[data-select-para="2"]');
    ta.value = 'She [ran] to the [store].';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForFunction(() => {
    const el = document.querySelector('#select-choices-section-2');
    return el && el.style.display !== 'none';
  }, { timeout: 2000 });
  const visible = await page.$eval('#select-choices-section-2', e => e.style.display !== 'none');
  assert(visible, 'Choices section should be visible after typing a paragraph with blanks');
  await screenshot(page, SS_DIR, 'create-select-choices');
});

await test('select round: choices section hidden when paragraph has no blanks', async () => {
  await page.evaluate(() => {
    const ta = document.querySelector('[data-select-para="2"]');
    ta.value = 'No blanks here.';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForFunction(() => {
    const el = document.querySelector('#select-choices-section-2');
    return el && el.style.display === 'none';
  }, { timeout: 2000 });
  const hidden = await page.$eval('#select-choices-section-2', e => e.style.display === 'none');
  assert(hidden, 'Choices section should be hidden when no blanks');
});

// ── 5. Seconds field interactivity ────────────────────────────────────────────
await test('changing seconds field updates value', async () => {
  await page.$eval('[data-round-seconds="0"]', e => {
    e.value = '45';
    e.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const val = await page.$eval('[data-round-seconds="0"]', e => e.value);
  assert(val === '45', `Expected 45, got ${val}`);
});

// ── 6. Validation ─────────────────────────────────────────────────────────────
await test('submitting with no title shows an error', async () => {
  await reloadPage();
  await page.$eval('#title', e => { e.value = ''; });
  await page.click('#submit-btn');
  await page.waitForFunction(() => {
    const el = document.querySelector('#submit-error');
    return el && el.style.display !== 'none' && el.textContent.trim().length > 0;
  }, { timeout: 2000 });
  const errVisible = await page.$eval('#submit-error', e => e.style.display !== 'none' && e.textContent.trim().length > 0);
  assert(errVisible, 'Submit error should show when title is empty');
  await screenshot(page, SS_DIR, 'create-validation-error');
});

await test('submitting with no rounds shows an error mentioning rounds', async () => {
  await reloadPage();
  await page.$eval('#title', e => { e.value = 'Test'; e.dispatchEvent(new Event('input')); });
  await page.click('#submit-btn');
  await page.waitForFunction(() => {
    const el = document.querySelector('#submit-error');
    return el && el.textContent.toLowerCase().includes('round');
  }, { timeout: 2000 });
  const errText = await page.$eval('#submit-error', e => e.textContent.trim());
  assert(errText.toLowerCase().includes('round'), `Error should mention rounds, got: "${errText}"`);
});

await test('submitting fill round with no blanks shows an error mentioning blanks', async () => {
  await page.click('#add-fill-btn');
  await page.waitForSelector('.round-card');
  await page.evaluate(() => {
    const ta = document.querySelector('[data-fill-para="0"]');
    ta.value = 'No blanks here.';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.click('#submit-btn');
  await page.waitForFunction(() => {
    const el = document.querySelector('#submit-error');
    return el && el.textContent.toLowerCase().includes('blank');
  }, { timeout: 2000 });
  const errText = await page.$eval('#submit-error', e => e.textContent.trim());
  assert(errText.toLowerCase().includes('blank'), `Error should mention blanks, got: "${errText}"`);
});

// ── Summary ───────────────────────────────────────────────────────────────────
await browser.close();
server.close();
console.log(`Screenshots → ${SS_DIR}`);
const failures = summary();
if (failures > 0) process.exit(1);
