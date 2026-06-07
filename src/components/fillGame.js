import { createParagraphScroller } from './paragraphScroller.js';

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// paragraph    : raw string with [word] markers
// wordBankSize : max words shown in bank at once
// onSubmit(answers: {[blankIdx]: word}, finished: bool)
export function createFillGame({ paragraph, wordBankSize = 6, onSubmit }) {

  // ── State ──────────────────────────────────────────────────────────────────
  const placed = {};
  let disabled = false;

  // Drag state
  let dragAnsIdx    = null;
  let dragGhost     = null;
  let dragOverBlank = null;
  let isDragging    = false;
  let ptStartX = 0, ptStartY = 0;
  const DRAG_THRESHOLD = 10;

  // ── Paragraph scroller ─────────────────────────────────────────────────────
  const scroller = createParagraphScroller({
    paragraph,
    isBlankFilled:  idx => placed[idx] !== undefined,
    onLocksChanged: syncBankWithVisible,
  });

  const { paraWrapEl, paraEl, blankEls, answers, totalBlanks } = scroller;

  if (totalBlanks === 0) {
    const el = document.createElement('div');
    el.className = 'fill-game';
    el.appendChild(paraWrapEl);
    paraWrapEl.style.overflow = 'auto';
    return { el, setProgress() {}, forceSubmit() { onSubmit({}, true); }, reveal() {}, cleanup() {} };
  }

  // ── Bank state ─────────────────────────────────────────────────────────────
  // Invariant: words for up to wordBankSize visible blanks are always in the bank.
  // Bank never exceeds wordBankSize entries.
  const firstVis   = totalBlanks > 0 ? [0] : [];
  const rest       = shuffle(Array.from({ length: totalBlanks - firstVis.length }, (_, i) => i + firstVis.length));
  const extraSlots = Math.max(0, wordBankSize - firstVis.length);
  let bankIndices  = shuffle([...firstVis, ...rest.slice(0, extraSlots)]);
  let queueIndices = rest.slice(extraSlots);

  let selectedAnsIdx = null;

  // ── DOM ────────────────────────────────────────────────────────────────────
  const el = document.createElement('div');
  el.className = 'fill-game';

  const bankEl = document.createElement('div');
  bankEl.className = 'fill-bank';
  el.appendChild(bankEl);
  el.appendChild(paraWrapEl);

  // Add __text + __icon inside each blank (scroller leaves them empty)
  for (const blankEl of blankEls) {
    if (!blankEl) continue;
    const textSpan = document.createElement('span');
    textSpan.className = 'fill-blank__text';
    const iconSpan = document.createElement('span');
    iconSpan.className = 'fill-blank__icon';
    iconSpan.setAttribute('aria-hidden', 'true');
    blankEl.append(textSpan, iconSpan);
  }

  renderBank([]);

  // ── Render ─────────────────────────────────────────────────────────────────

  function renderBank(newlyAddedIdxs) {
    bankEl.innerHTML = '';
    for (const ansIdx of bankIndices) {
      const chip = document.createElement('div');
      chip.className = 'fill-word';
      chip.dataset.ansIdx = ansIdx;
      chip.textContent = answers[ansIdx];
      if (ansIdx === selectedAnsIdx) chip.classList.add('fill-word--selected');
      if (newlyAddedIdxs.includes(ansIdx)) {
        chip.classList.add('fill-word--new');
        chip.addEventListener('animationend', () => chip.classList.remove('fill-word--new'), { once: true });
      }
      bankEl.appendChild(chip);
    }
  }

  function renderBlank(idx) {
    const blank = blankEls[idx];
    if (!blank) return;
    const ansIdx = placed[idx];
    const textEl = blank.querySelector('.fill-blank__text');
    const iconEl = blank.querySelector('.fill-blank__icon');
    blank.className = 'fill-blank';
    if (ansIdx !== undefined) {
      blank.classList.add('fill-blank--filled');
      textEl.textContent = answers[ansIdx];
    } else {
      textEl.textContent = '';
    }
    if (scroller.isLocked(idx)) blank.classList.add('fill-blank--locked');
    iconEl.textContent = '';
    iconEl.removeAttribute('aria-label');
  }

  // ── Bank invariant ─────────────────────────────────────────────────────────
  // Ensure the bank contains words for up to wordBankSize visible blanks.
  // The bank NEVER grows beyond wordBankSize.

  function syncBankWithVisible() {
    const vis    = scroller.getVisibleBlankIdxs(); // all unfilled+unlocked
    const needed = vis.slice(0, wordBankSize);      // at most wordBankSize to represent
    const newlyAdded = [];

    for (const bi of needed) {
      if (bankIndices.includes(bi)) continue;
      const qi = queueIndices.indexOf(bi);
      if (qi === -1) continue;
      queueIndices.splice(qi, 1);
      // Displace a bank entry whose blank is NOT in needed (a filler/old entry)
      const displacePos = bankIndices.findIndex(b => !needed.includes(b));
      if (displacePos !== -1) {
        queueIndices.unshift(bankIndices[displacePos]);
        bankIndices[displacePos] = bi;
      } else if (bankIndices.length < wordBankSize) {
        // All bank entries are needed but bank isn't full yet — grow it
        bankIndices.push(bi);
      }
      // else: bank full and all entries are needed; nowhere to add bi — skip
      newlyAdded.push(bi);
    }

    // Pad with queue entries up to wordBankSize (fillers/distractors)
    while (bankIndices.length < wordBankSize && queueIndices.length > 0) {
      const next = queueIndices.shift();
      bankIndices.push(next);
      newlyAdded.push(next);
    }

    if (!isDragging) renderBank(newlyAdded);
  }

  // ── Word placement ─────────────────────────────────────────────────────────

  function placeWord(ansIdx, blankIdx) {
    if (disabled || scroller.isLocked(blankIdx)) return;
    if (placed[blankIdx] !== undefined) {
      queueIndices.unshift(placed[blankIdx]);
      delete placed[blankIdx];
    }
    const pos = bankIndices.indexOf(ansIdx);
    if (pos === -1) return;
    bankIndices.splice(pos, 1);
    placed[blankIdx] = ansIdx;
    selectedAnsIdx = null;
    syncBankWithVisible();
    renderBlank(blankIdx);
    scroller.onBlankAnswered();
    checkAllPlaced();
  }

  function unplaceBlank(blankIdx) {
    if (disabled || scroller.isLocked(blankIdx)) return;
    const ansIdx = placed[blankIdx];
    if (ansIdx === undefined) return;
    delete placed[blankIdx];
    queueIndices.unshift(ansIdx);
    syncBankWithVisible();
    renderBlank(blankIdx);
    scroller.onBlankAnswered();
  }

  function checkAllPlaced() {
    if (Object.keys(placed).length === totalBlanks && !disabled) {
      setTimeout(() => submitGame(true), 150);
    }
  }

  // ── Submit ─────────────────────────────────────────────────────────────────

  function submitGame(finished) {
    if (disabled) return;
    disabled = true;
    selectedAnsIdx = null;
    cleanupDrag();
    renderBank([]);
    const wordAnswers = {};
    for (const [bi, ai] of Object.entries(placed)) {
      wordAnswers[Number(bi)] = answers[ai];
    }
    onSubmit(wordAnswers, finished);
  }

  // ── Reveal ─────────────────────────────────────────────────────────────────

  function reveal() {
    disabled = true;
    selectedAnsIdx = null;
    cleanupDrag();
    bankEl.style.display = 'none';
    scroller.reveal(idx => placed[idx] !== undefined ? answers[placed[idx]] : undefined);
  }

  // ── Drag ───────────────────────────────────────────────────────────────────

  function cleanupDrag() {
    if (dragGhost) { dragGhost.remove(); dragGhost = null; }
    if (dragOverBlank) { dragOverBlank.classList.remove('fill-blank--drag-over'); dragOverBlank = null; }
    dragAnsIdx = null;
    isDragging = false;
    renderBank([]);
  }

  bankEl.addEventListener('pointerdown', e => {
    if (disabled) return;
    const chipEl = e.target.closest('.fill-word');
    if (!chipEl) return;
    const ansIdx = Number(chipEl.dataset.ansIdx);
    e.preventDefault();
    ptStartX = e.clientX; ptStartY = e.clientY;
    dragAnsIdx = ansIdx;
    isDragging = false;
    chipEl.setPointerCapture(e.pointerId);
  });

  bankEl.addEventListener('pointermove', e => {
    if (dragAnsIdx === null) return;
    const dx = e.clientX - ptStartX, dy = e.clientY - ptStartY;
    if (!isDragging && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
      isDragging = true;
      const origChip = bankEl.querySelector(`[data-ans-idx="${dragAnsIdx}"]`);
      if (origChip) origChip.classList.add('fill-word--dragging');
      dragGhost = document.createElement('div');
      dragGhost.className = 'fill-word fill-word--ghost';
      dragGhost.textContent = answers[dragAnsIdx];
      document.body.appendChild(dragGhost);
    }
    if (isDragging && dragGhost) {
      dragGhost.style.left = `${e.clientX}px`;
      dragGhost.style.top  = `${e.clientY}px`;
      const hitEl    = document.elementFromPoint(e.clientX, e.clientY);
      const hitBlank = hitEl?.closest('.fill-blank');
      if (hitBlank !== dragOverBlank) {
        dragOverBlank?.classList.remove('fill-blank--drag-over');
        dragOverBlank = hitBlank && !hitBlank.classList.contains('fill-blank--locked') ? hitBlank : null;
        dragOverBlank?.classList.add('fill-blank--drag-over');
      }
    }
  });

  bankEl.addEventListener('pointerup', e => {
    if (dragAnsIdx === null) return;
    if (isDragging) {
      const hitEl    = document.elementFromPoint(e.clientX, e.clientY);
      const hitBlank = hitEl?.closest('.fill-blank');
      if (hitBlank && !hitBlank.classList.contains('fill-blank--locked')) {
        placeWord(dragAnsIdx, Number(hitBlank.dataset.idx));
      }
      cleanupDrag();
    } else {
      selectedAnsIdx = selectedAnsIdx === dragAnsIdx ? null : dragAnsIdx;
      dragAnsIdx = null;
      renderBank([]);
    }
  });

  bankEl.addEventListener('pointercancel', () => cleanupDrag());

  // ── Blank clicks ───────────────────────────────────────────────────────────

  paraEl.addEventListener('click', e => {
    if (disabled) return;
    const blank = e.target.closest('.fill-blank');
    if (!blank || blank.classList.contains('fill-blank--locked')) return;
    const blankIdx = Number(blank.dataset.idx);
    if (selectedAnsIdx !== null) {
      placeWord(selectedAnsIdx, blankIdx);
    } else if (placed[blankIdx] !== undefined) {
      unplaceBlank(blankIdx);
    }
  });

  return {
    el,
    setProgress: pct => scroller.setProgress(pct),
    forceSubmit() { submitGame(false); },
    reveal,
    cleanup() {
      cleanupDrag();
      scroller.cleanup();
    },
    _syncBank: syncBankWithVisible, // test-only: directly triggers the isDragging guard path
  };
}
