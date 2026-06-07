/**
 * Shared test utilities for Puppeteer integration tests.
 */

import puppeteer from 'puppeteer';
import http from 'http';
import fs from 'fs';
import path from 'path';

const MIME = {
  '.js':   'application/javascript',
  '.html': 'text/html',
  '.css':  'text/css',
  '.json': 'application/json',
};

export async function launchBrowser() {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome-stable',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    headless: true,
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  page.on('pageerror', e => {
    if (!e.message.includes('fetch') && !e.message.includes('firestore') &&
        !e.message.includes('Firebase') && !e.message.includes('PERMISSION_DENIED')) {
      console.error('PAGE ERR:', e.message);
    }
  });
  return { browser, page };
}

export function createFileServer(ROOT, pages = {}) {
  return http.createServer((req, res) => {
    const html = pages[req.url] ?? pages[req.url.split('?')[0]];
    if (html !== undefined) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end(html);
    }
    let urlPath = req.url.split('?')[0];
    // Serve index.html for directory roots
    if (urlPath === '/' || urlPath === '') urlPath = '/index.html';
    const filePath = path.join(ROOT, urlPath);
    if (!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    try {
      const content = fs.readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'text/plain' });
      res.end(content);
    } catch { res.writeHead(404); res.end('Not found: ' + req.url); }
  });
}

export function makeRunner() {
  let passed = 0, failed = 0;
  const assert = (cond, msg) => { if (!cond) throw new Error(msg || 'Assertion failed'); };
  const test = async (name, fn) => {
    try { await fn(); console.log(`  ✓ ${name}`); passed++; }
    catch (e) { console.log(`  ✗ ${name}\n    ${e.message}`); failed++; }
  };
  const summary = () => {
    console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
    return failed;
  };
  return { test, assert, summary };
}

/**
 * Wait for a paragraph-scroller game to finish initializing.
 * The scroller sets scrollTop inside a requestAnimationFrame, so we poll
 * until scrollTop > 0 (gameMinScroll is always > 0 for any valid paragraph).
 */
export async function waitForGame(page, extraSelector = null) {
  await page.waitForFunction((sel) => {
    const wrap = document.querySelector('.fill-para-wrap');
    const extra = sel ? document.querySelector(sel) !== null : true;
    return window.__game !== null && wrap && wrap.scrollTop > 0 && extra;
  }, { timeout: 5000 }, extraSelector);
}

/** Navigate to a URL and wait for game readiness. */
export async function nav(page, url, extraSelector) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await waitForGame(page, extraSelector);
}

/** Reload and wait for game readiness. */
export async function reload(page, extraSelector) {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForGame(page, extraSelector);
}

/**
 * Wait for scroll animation to settle (for heavy tests with real lerp).
 * Polls every 50ms; resolves ~50ms after animation stops moving.
 */
export async function waitForScrollSettled(page) {
  await page.evaluate(() => {
    const wrap = document.querySelector('.fill-para-wrap');
    if (wrap) delete wrap.__prevScroll;
  });
  await page.waitForFunction(() => {
    const wrap = document.querySelector('.fill-para-wrap');
    if (!wrap) return false;
    const cur = wrap.scrollTop;
    if (wrap.__prevScroll === undefined) { wrap.__prevScroll = cur; return false; }
    const stable = Math.abs(cur - wrap.__prevScroll) < 0.5;
    wrap.__prevScroll = cur;
    return stable;
  }, { polling: 50, timeout: 2000 }).catch(() => {});
}

export async function screenshot(page, dir, name) {
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, `${name}.png`);
  await page.screenshot({ path: p, fullPage: false });
  return p;
}
