import { attachDrag } from '../lib/dragDrop.js';

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// sentence : string — words separated by spaces
// onSubmit(answers: {[slotIdx]: word}, finished: bool)
export function createShuffleGame({ sentence, onSubmit }) {
  const words    = sentence.trim().split(/\s+/);
  const n        = words.length;
  const shuffled = shuffle([...words]);

  // tileSlot[ti] = si where tile ti is placed, or null
  // slotTile[si] = ti of tile in slot si, or null
  const tileSlot = new Array(n).fill(null);
  const slotTile = new Array(n).fill(null);
  let selectedTile  = null;
  let hoveredSlot   = null;
  let disabled      = false;

  const el = document.createElement('div');
  el.className = 'shuffle-game';

  // ── Tiles row ────────────────────────────────────────────────────────────

  const tilesLabel = document.createElement('div');
  tilesLabel.className = 'shuffle-row-label';
  tilesLabel.textContent = 'Words';
  el.appendChild(tilesLabel);

  const tilesRow = document.createElement('div');
  tilesRow.className = 'shuffle-tiles';

  const tileEls = shuffled.map((word, ti) => {
    const tile = document.createElement('div');
    tile.className = 'shuffle-tile';
    tile.textContent = word;
    tile.dataset.ti = ti;
    tilesRow.appendChild(tile);
    return tile;
  });

  el.appendChild(tilesRow);

  // ── Slots row ────────────────────────────────────────────────────────────

  const slotsLabel = document.createElement('div');
  slotsLabel.className = 'shuffle-row-label';
  slotsLabel.textContent = 'Your answer';
  el.appendChild(slotsLabel);

  const slotsRow = document.createElement('div');
  slotsRow.className = 'shuffle-slots';

  const slotEls = Array.from({ length: n }, (_, si) => {
    const slot = document.createElement('div');
    slot.className = 'shuffle-slot';
    slot.dataset.si = si;
    slotsRow.appendChild(slot);
    return slot;
  });

  el.appendChild(slotsRow);

  // ── Drag — tile row tiles → slots ────────────────────────────────────────

  const cleanupTileDrag = attachDrag(tilesRow, {
    itemSelector:  '.shuffle-tile:not(.shuffle-tile--placed)',
    getItemData:   el => Number(el.dataset.ti),
    ghostText:     ti => shuffled[ti],
    ghostClass:    'shuffle-tile shuffle-tile--ghost',
    draggingClass: 'shuffle-tile--dragging',
    findTarget:    el => el.closest('.shuffle-slot'),
    onDrop:        (ti, slotEl) => placeTile(ti, Number(slotEl.dataset.si)),
    onTap:         (ti, itemEl) => onTileClick(ti),
    onEnterTarget: target => {
      if (hoveredSlot) hoveredSlot.classList.remove('shuffle-slot--over');
      hoveredSlot = target;
      hoveredSlot?.classList.add('shuffle-slot--over');
    },
  });

  // ── Drag — filled slots → slots (reorder by dragging from bottom row) ───

  const cleanupSlotDrag = attachDrag(slotsRow, {
    itemSelector:  '.shuffle-slot',
    getItemData:   el => Number(el.dataset.si),
    ghostText:     si => slotTile[si] !== null ? shuffled[slotTile[si]] : '',
    ghostClass:    'shuffle-tile shuffle-tile--ghost',
    draggingClass: 'shuffle-slot--dragging',
    findTarget:    el => el.closest('.shuffle-slot'),
    onDrop: (fromSi, toSlotEl) => {
      const ti = slotTile[fromSi];
      if (ti !== null) placeTile(ti, Number(toSlotEl.dataset.si));
    },
    onTap: (si) => onSlotClick(si),
    onEnterTarget: target => {
      if (hoveredSlot) hoveredSlot.classList.remove('shuffle-slot--over');
      hoveredSlot = target;
      hoveredSlot?.classList.add('shuffle-slot--over');
    },
  });

  // ── Click handlers (tap fallback from attachDrag) ─────────────────────────

  function onTileClick(ti) {
    if (disabled) return;
    if (selectedTile === ti) {
      setSelected(null);
    } else {
      setSelected(ti);
    }
  }

  function onSlotClick(si) {
    if (disabled) return;
    if (selectedTile !== null) {
      placeTile(selectedTile, si);
    } else if (slotTile[si] !== null) {
      const ti = slotTile[si];
      removeTileFromSlot(si);
      setSelected(ti);
    }
  }

  // ── Placement logic ───────────────────────────────────────────────────────

  function placeTile(ti, si) {
    if (tileSlot[ti] !== null) removeTileFromSlot(tileSlot[ti]);
    if (slotTile[si] !== null) removeTileFromSlot(si);

    tileSlot[ti] = si;
    slotTile[si] = ti;
    slotEls[si].textContent = shuffled[ti];
    slotEls[si].classList.add('shuffle-slot--filled');
    tileEls[ti].classList.add('shuffle-tile--placed');

    setSelected(null);
    checkAllPlaced();
  }

  function removeTileFromSlot(si) {
    const ti = slotTile[si];
    if (ti === null) return;
    tileSlot[ti] = null;
    slotTile[si] = null;
    slotEls[si].textContent = '';
    slotEls[si].classList.remove('shuffle-slot--filled');
    tileEls[ti].classList.remove('shuffle-tile--placed');
  }

  function setSelected(ti) {
    if (selectedTile !== null) tileEls[selectedTile].classList.remove('shuffle-tile--selected');
    selectedTile = ti;
    if (ti !== null) tileEls[ti].classList.add('shuffle-tile--selected');
  }

  function checkAllPlaced() {
    if (!disabled && slotTile.every(ti => ti !== null)) {
      setTimeout(() => submitGame(true), 150);
    }
  }

  function submitGame(finished) {
    if (disabled) return;
    disabled = true;
    const answers = {};
    for (let si = 0; si < n; si++) {
      if (slotTile[si] !== null) answers[si] = shuffled[slotTile[si]];
    }
    onSubmit(answers, finished);
  }

  function reveal() {
    disabled = true;
    setSelected(null);
    if (hoveredSlot) { hoveredSlot.classList.remove('shuffle-slot--over'); hoveredSlot = null; }
    for (let si = 0; si < n; si++) {
      const slot        = slotEls[si];
      const placedWord  = slotTile[si] !== null ? shuffled[slotTile[si]] : null;
      const correctWord = words[si];
      const isCorrect   = placedWord !== null && placedWord.toLowerCase() === correctWord.toLowerCase();
      slot.classList.add(isCorrect ? 'shuffle-slot--correct' : 'shuffle-slot--wrong');
      if (!placedWord) slot.textContent = '—';
      if (!isCorrect) {
        const hint = document.createElement('div');
        hint.className = 'shuffle-slot__hint';
        hint.textContent = correctWord;
        slot.appendChild(hint);
      }
    }
  }

  return {
    el,
    setProgress() {},
    forceSubmit() { submitGame(false); },
    reveal,
    cleanup() { cleanupTileDrag(); cleanupSlotDrag(); },
  };
}
