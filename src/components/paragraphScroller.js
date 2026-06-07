import { parseParagraph, normalizeWord } from '../lib/fillParsing.js';

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── createParagraphScroller ──────────────────────────────────────────────────
//
// Shared base for ALL paragraph-style games (fill, select, type).
// Handles: DOM building, auto-scroll, lock mechanic, reveal rendering.
//
// Scroll design:
//   • paddingTop = wrapH is added to .fill-para so blank 0 starts at the
//     BOTTOM of the visible window (scroll=0 → blank 0 half-visible at bottom)
//   • gameMinScroll: scroll position where blank 0's bottom is at the window bottom
//   • gameMaxScroll: scroll position where the LAST blank just exits the top
//     (= lastBlank.offsetTop after padding = wrapH + lastBlankOriginalTop)
//   • Timer drives linearly from gameMinScroll to gameMaxScroll, giving every
//     blank the same dwell time (wrapH pixels of scroll travel).
//
// Options:
//   paragraph       raw string with [word] markers
//   isBlankFilled   (idx: number) => boolean  — game tells base when a blank is done
//   onLocksChanged  () => void                — called after any blank gets locked
//
// Returned API:
//   paraWrapEl          the scrollable container element
//   paraEl              the paragraph text div (inside paraWrapEl)
//   blankEls            array[idx] of .fill-blank span elements
//   answers             string[] of correct answers
//   totalBlanks         number
//   setProgress(0–1)    timer-based autoscroll
//   onBlankAnswered()   call whenever a blank is answered/cleared
//   getVisibleBlankIdxs() → number[]  all unfilled+unlocked blank indices
//   isLocked(idx)       boolean
//   reveal(getPlayerAnswer)  switch to review mode
//   cleanup()           cancel pending RAF

export function createParagraphScroller({
  paragraph,
  isBlankFilled  = () => false,
  onLocksChanged = () => {},
}) {
  const { segments, answers } = parseParagraph(paragraph);
  const totalBlanks = answers.length;

  // ── Scroll state ──────────────────────────────────────────────────────────
  const locked = new Set();
  let disabled     = false;
  let minScroll    = 0;   // ratchet: never scrolls back above this
  let gameMinScroll = 0;  // fixed initial scroll (blank 0 at bottom)
  let gameMaxScroll = 0;  // fixed end scroll (last blank exits top)
  let scrollTarget = 0;
  let scrollRaf    = null;

  // ── DOM ───────────────────────────────────────────────────────────────────
  const paraWrapEl = document.createElement('div');
  paraWrapEl.className = 'fill-para-wrap';

  const paraEl = document.createElement('div');
  paraEl.className = 'fill-para';
  paraWrapEl.appendChild(paraEl);

  const blankEls = [];

  for (const seg of segments) {
    if (seg.type === 'text') {
      paraEl.appendChild(document.createTextNode(seg.text));
    } else {
      const span = document.createElement('span');
      span.className = 'fill-blank';
      span.dataset.idx = seg.index;
      blankEls[seg.index] = span;
      paraEl.appendChild(span);
    }
  }

  // Block user touch-scroll during gameplay; allow after reveal
  paraWrapEl.addEventListener('touchmove', e => {
    if (!disabled) e.preventDefault();
  }, { passive: false });

  // ── Smooth lerp scroll ────────────────────────────────────────────────────

  // Position of blank in paraWrapEl's scrollable content, independent of offsetParent chain.
  // Using BRC+scrollTop so this is correct even when paraWrapEl isn't a positioned ancestor.
  function blankContentTop(b) {
    return b.getBoundingClientRect().top - paraWrapEl.getBoundingClientRect().top + paraWrapEl.scrollTop;
  }

  function lerpScrollTo(target) {
    scrollTarget = Math.max(0, target);
    // Test environments inject window.__TEST_SNAP_SCROLL to skip animation.
    if (window.__TEST_SNAP_SCROLL) {
      paraWrapEl.scrollTop = scrollTarget;
      return;
    }
    if (!scrollRaf) scrollRaf = requestAnimationFrame(scrollStep);
  }

  function scrollStep() {
    const cur  = paraWrapEl.scrollTop;
    const diff = scrollTarget - cur;
    if (Math.abs(diff) < 0.5) {
      paraWrapEl.scrollTop = scrollTarget;
      scrollRaf = null;
      return;
    }
    paraWrapEl.scrollTop = cur + diff * 0.14;
    scrollRaf = requestAnimationFrame(scrollStep);
  }

  // ── Visible-blank window ──────────────────────────────────────────────────
  // Returns ALL unfilled+unlocked blanks. Games may slice this as needed.

  function getVisibleBlankIdxs() {
    const vis = [];
    for (let i = 0; i < totalBlanks; i++) {
      if (!locked.has(i) && !isBlankFilled(i)) vis.push(i);
    }
    return vis;
  }

  // ── Timer-driven scroll ───────────────────────────────────────────────────

  function setProgress(pct) {
    if (gameMaxScroll <= gameMinScroll) return;
    // Linear drive from gameMinScroll (blank 0 at bottom) to gameMaxScroll (last blank exits top).
    // Math.max with minScroll ratchet so player-triggered advances are not reversed.
    const timerPos = gameMinScroll + pct * (gameMaxScroll - gameMinScroll);
    lerpScrollTo(Math.max(minScroll, timerPos));
    updateLocks();
  }

  // ── Answer-driven scroll ──────────────────────────────────────────────────
  // After any blank is answered, scroll so the first remaining blank appears
  // at 85% down the window (same dwell budget as timer-driven scroll).

  function onBlankAnswered() {
    const vis = getVisibleBlankIdxs();
    if (!vis.length) return;
    const wrapH = paraWrapEl.clientHeight;
    if (!wrapH) return;
    const firstEl = blankEls[vis[0]];
    // With paddingTop=wrapH: blankContentTop = wrapH + original_top
    // desired puts blank at 85% down: desired = blankTop - wrapH*0.85
    const desired = blankContentTop(firstEl) - wrapH * 0.85;
    if (desired > minScroll) {
      minScroll = desired;
      lerpScrollTo(Math.max(minScroll, scrollTarget));
    }
  }

  // ── Lock mechanic ─────────────────────────────────────────────────────────

  function updateLocks() {
    const scrollTop = paraWrapEl.scrollTop;
    let anyNew = false;
    for (let i = 0; i < totalBlanks; i++) {
      if (!locked.has(i) && blankEls[i] && blankContentTop(blankEls[i]) < scrollTop - 4) {
        locked.add(i);
        blankEls[i].classList.add('fill-blank--locked');
        anyNew = true;
      }
    }
    if (anyNew) onLocksChanged();
  }

  // ── Initial scroll setup ──────────────────────────────────────────────────
  // Runs after the game element is appended to the DOM (first paint).
  //
  // Strategy:
  //   1. Measure blank positions BEFORE adding padding (original layout).
  //   2. Force para content to overflow so para-wrap is capped at its constrained
  //      height (max-height or available flex space) — not at content height.
  //      Without this step, if the paragraph is short and the container lacks a
  //      definite height (e.g. min-height instead of height, as on mobile Safari),
  //      clientHeight reads content height, not the capped height, so paddingTop
  //      is too small and the content never overflows → no scroll possible.
  //   3. Add paddingTop = wrapH to fill-para. This shifts every blank down by wrapH.
  //      After padding: blankContentTop(blankEls[i]) = wrapH + originalTop[i].
  //   4. gameMinScroll puts blank 0 at 90% of wrapH from the top.
  //   5. gameMaxScroll = wrapH + originalTop[last] — last blank exits top at pct=1.

  requestAnimationFrame(() => {
    if (!blankEls[0] || !paraWrapEl || !paraEl) return;
    const firstEl = blankEls[0];
    const lastEl  = blankEls[totalBlanks - 1] ?? firstEl;
    // Measure blank positions before any padding (natural layout).
    const origFirstTop = blankContentTop(firstEl);
    const origLastTop  = blankContentTop(lastEl);
    // Force content to overflow. In a constrained container (flex cap or max-height),
    // clientHeight stays at the cap. In an unconstrained container, the element grows
    // beyond the viewport with the content.
    paraEl.style.paddingTop = '9999px';
    let wrapH = paraWrapEl.clientHeight;
    // If unconstrained (wrapH > viewport) or collapsed (wrapH = 0), set an explicit
    // fallback height so the scroll mechanic has space to work. This covers mobile
    // Safari where min-height ancestors don't propagate definite flex heights.
    if (!wrapH || wrapH > window.innerHeight) {
      // `style.height` is overridden by `flex: 1` in a content-sized container;
      // `max-height` caps after flex sizing and respects overflow-y:scroll.
      paraWrapEl.style.maxHeight = `${Math.round(window.innerHeight * 0.85)}px`;
      wrapH = paraWrapEl.clientHeight || 400;
    }
    // Now set the correct paddingTop so content overflows by exactly wrapH.
    paraEl.style.paddingTop = `${wrapH}px`;
    // gameMinScroll: blank 0 at 90% down the para-wrap (clearly visible near bottom).
    //   scrollTop = (wrapH + origFirstTop) - 0.9*wrapH = 0.1*wrapH + origFirstTop
    gameMinScroll = Math.max(0, 0.1 * wrapH + origFirstTop);
    gameMaxScroll = wrapH + origLastTop;
    minScroll = gameMinScroll;
    paraWrapEl.scrollTop = gameMinScroll;
    scrollTarget = gameMinScroll;
  });

  // ── Reveal ────────────────────────────────────────────────────────────────

  function reveal(getPlayerAnswer) {
    disabled = true;
    if (scrollRaf) { cancelAnimationFrame(scrollRaf); scrollRaf = null; }
    paraWrapEl.style.overflowY   = 'auto';
    paraWrapEl.style.touchAction = 'pan-y';
    paraWrapEl.style.maxHeight   = 'none';
    paraEl.style.paddingTop      = '0';
    paraWrapEl.scrollTop = 0;

    for (let i = 0; i < totalBlanks; i++) {
      const blank = blankEls[i];
      if (!blank) continue;
      const playerW = getPlayerAnswer(i);
      const correct = playerW !== undefined
        && normalizeWord(playerW) === normalizeWord(answers[i]);

      blank.className = `fill-blank fill-blank--revealed ${correct ? 'fill-blank--correct' : 'fill-blank--wrong'}`;
      blank.innerHTML = '';

      const textEl = document.createElement('span');
      textEl.className = 'fill-blank__text';
      if (correct) {
        textEl.textContent = playerW;
      } else {
        textEl.innerHTML =
          `<span class="fill-blank__wrong-ans">${esc(playerW ?? '—')}</span>` +
          `<span class="fill-blank__correct-ans">${esc(answers[i])}</span>`;
      }

      const iconEl = document.createElement('span');
      iconEl.className = 'fill-blank__icon';
      iconEl.setAttribute('aria-label', correct ? 'Correct' : 'Wrong');
      iconEl.textContent = correct ? '✓' : '✗';

      blank.append(textEl, iconEl);
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  return {
    paraWrapEl,
    paraEl,
    blankEls,
    answers,
    totalBlanks,
    setProgress,
    onBlankAnswered,
    getVisibleBlankIdxs,
    isLocked: idx => locked.has(idx),
    reveal,
    cleanup() { if (scrollRaf) { cancelAnimationFrame(scrollRaf); scrollRaf = null; } },
  };
}
