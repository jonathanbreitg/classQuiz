/**
 * Shared test suites for all 3 paragraph-based games: fill, select, type.
 * They all use paragraphScroller.js so share identical scroll/timer mechanics.
 *
 * Each exported function accepts (page, test, assert, opts) so the caller
 * can run the same invariants in both standard (snap) and heavy (animated) modes.
 *
 * opts.waitForScroll  — called after setProgress(); no-op in standard (snap),
 *                       waitForScrollSettled(page) in heavy tests.
 * opts.lastIdx        — data-idx of the last blank in the paragraph.
 * opts.minPct         — threshold for blank 0 bottom-position check (default 0.70).
 */

/** Check that blank 0 appears near the bottom of the visible wrap. */
export async function assertBlankNearBottom(page, assert, { minPct = 0.70 } = {}) {
  const { top, h } = await page.evaluate(() => {
    const wR = document.querySelector('.fill-para-wrap').getBoundingClientRect();
    const bR = document.querySelector('[data-idx="0"]').getBoundingClientRect();
    return { top: bR.top - wR.top, h: wR.height };
  });
  assert(top > h * minPct, `Blank 0 top ${top.toFixed(0)}px — expected >${Math.round(minPct * 100)}% of wrap (${h}px)`);
  assert(top < h, 'Blank 0 should be within the visible wrap');
}

/**
 * Run the 5 core scroll/timer invariants shared by all paragraph games:
 *   1. Blank 0 near bottom on initial load (relative to para-wrap)
 *   2. Blank 0 in the lower portion of the screen viewport (catches CSS max-height regressions)
 *   3. Last blank NOT locked at setProgress(0.95)
 *   4. Last blank NOT locked at setProgress(1.0)
 *   5. Last blank visible within wrap at setProgress(0.99)
 */
export async function runScrollInvariants(page, test, assert, opts) {
  const { lastIdx, minPct = 0.70, waitForScroll = async () => {} } = opts;

  await test('blank 0 top is in the lower portion of wrap', async () => {
    await assertBlankNearBottom(page, assert, { minPct });
  });

  await test('blank 0 is in the lower portion of the screen viewport', async () => {
    // Checks the absolute screen position of blank 0, catching any CSS change that
    // constrains para-wrap to be too small (e.g. a max-height: 45vh regression would
    // put blank 0 at ~52% of the screen even while the within-wrap check still passes).
    const { blankTop, viewportH } = await page.evaluate(() => {
      const bR = document.querySelector('[data-idx="0"]').getBoundingClientRect();
      return { blankTop: bR.top, viewportH: window.innerHeight };
    });
    assert(blankTop > viewportH * 0.65,
      `Blank 0 at ${blankTop.toFixed(0)}px from screen top — expected >65% of viewport (${viewportH}px). ` +
      'A CSS max-height on .fill-para-wrap can cause this to fail even when the within-wrap check passes.');
  });

  await test(`last blank (idx=${lastIdx}) NOT locked at setProgress(0.95)`, async () => {
    await page.evaluate(() => window.__game.setProgress(0.95));
    await waitForScroll();
    const locked = await page.$eval(`[data-idx="${lastIdx}"]`, e => e.classList.contains('fill-blank--locked'));
    assert(!locked, `Last blank (idx=${lastIdx}) must NOT be locked at 95%`);
  });

  await test(`last blank (idx=${lastIdx}) NOT locked at setProgress(1.0)`, async () => {
    await page.evaluate(() => window.__game.setProgress(1.0));
    await waitForScroll();
    const locked = await page.$eval(`[data-idx="${lastIdx}"]`, e => e.classList.contains('fill-blank--locked'));
    assert(!locked, `Last blank (idx=${lastIdx}) must NOT be locked at 100%`);
  });

  await test(`last blank (idx=${lastIdx}) visible within wrap at setProgress(0.99)`, async () => {
    await page.evaluate(() => window.__game.setProgress(0.99));
    await waitForScroll();
    const { top, h } = await page.evaluate((idx) => {
      const wR = document.querySelector('.fill-para-wrap').getBoundingClientRect();
      const bR = document.querySelector(`[data-idx="${idx}"]`).getBoundingClientRect();
      return { top: bR.top - wR.top, h: wR.height };
    }, lastIdx);
    assert(top >= 0 && top < h, `Last blank top (${top.toFixed(0)}) must be within wrap (h=${h})`);
  });
}

/** Check that no visible blank has fill-blank--future (interactability invariant). */
export async function assertNoFutureBlanks(page, assert) {
  const n = await page.$$eval('.fill-blank--future', e => e.length);
  assert(n === 0, `Expected 0 blanks with fill-blank--future, got ${n}`);
}

/** Layout checks shared by heavy test versions. */
export async function runLayoutChecks(page, test, assert) {
  await test('para-wrap height > 350px on mobile viewport', async () => {
    const h = await page.$eval('.fill-para-wrap', e => e.clientHeight);
    assert(h > 350, `Para-wrap height should exceed 350px, got ${h}px`);
  });

  await test('paragraph content extends below visible area (scroll mechanic active)', async () => {
    const { sh, ch } = await page.$eval('.fill-para-wrap', e => ({ sh: e.scrollHeight, ch: e.clientHeight }));
    assert(sh > ch, `scrollHeight (${sh}) must exceed clientHeight (${ch})`);
  });
}

/**
 * Single-blank edge case: navigate to single-blank URL, verify blank is in lower
 * half of wrap, and verify setProgress edge cases don't crash.
 *
 * opts.navFn(url)   — async, navigates to the given URL and waits for game ready
 * opts.singleUrl    — full URL for the single-blank page
 * opts.triggerSubmit — async fn that triggers a submit via game-specific UI interaction
 * opts.expectedAnswer — the answer string to check in the result
 */
export async function runSingleBlankEdgeCases(page, test, assert, opts) {
  const { navFn, singleUrl, triggerSubmit, expectedAnswer } = opts;

  await navFn(singleUrl);

  await test('single-blank: blank is in lower half of wrap', async () => {
    const { top, h } = await page.evaluate(() => {
      const wR = document.querySelector('.fill-para-wrap').getBoundingClientRect();
      const bR = document.querySelector('[data-idx="0"]').getBoundingClientRect();
      return { top: bR.top - wR.top, h: wR.height };
    });
    assert(top > h * 0.5, `Single-blank top ${top.toFixed(0)} should be in lower half (h=${h})`);
  });

  await test('single-blank: setProgress(0) and setProgress(1.0) do not crash', async () => {
    await page.evaluate(() => { window.__game.setProgress(0); window.__game.setProgress(1.0); });
    const blank = await page.$('.fill-blank');
    assert(blank !== null, 'Blank should still exist after setProgress calls');
  });

  await test('single-blank: interaction auto-submits with finished=true', async () => {
    await navFn(singleUrl);
    await triggerSubmit();
    await page.waitForFunction(() => window.__results.length > 0, { timeout: 3000 });
    const last = await page.evaluate(() => window.__results.at(-1));
    assert(last.finished === true, `Single blank auto-submit should have finished=true`);
    if (expectedAnswer !== undefined) {
      assert(last.answers[0] === expectedAnswer, `Expected answers[0]='${expectedAnswer}', got '${last.answers[0]}'`);
    }
  });
}
