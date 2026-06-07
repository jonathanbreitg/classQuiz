import { attachDrag } from '../lib/dragDrop.js';

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// sentences: string[] (in correct order) — game shuffles them
// onSubmit(answers: {[slotIdx]: sentenceText}, finished: bool)
export function createOrderGame({ sentences, onSubmit }) {
  const n = sentences.length;
  const shuffled = shuffle([...sentences]);

  // tileSlot[ti] = si where tile ti is placed, or null
  // slotTile[si] = ti of tile in slot si, or null
  const tileSlot = new Array(n).fill(null);
  const slotTile = new Array(n).fill(null);
  let selectedTile = null;
  let hoveredSlot = null;
  let disabled = false;

  const el = document.createElement('div');
  el.className = 'order-game';

  // ── Tiles section ─────────────────────────────────────────────────────────

  const tilesLabel = document.createElement('div');
  tilesLabel.className = 'order-row-label';
  tilesLabel.textContent = 'Sentences';
  el.appendChild(tilesLabel);

  const tilesRow = document.createElement('div');
  tilesRow.className = 'order-tiles';

  const tileEls = shuffled.map((text, ti) => {
    const tile = document.createElement('div');
    tile.className = 'order-tile';
    tile.textContent = text;
    tile.dataset.ti = ti;
    tilesRow.appendChild(tile);
    return tile;
  });

  el.appendChild(tilesRow);

  // ── Slots section ─────────────────────────────────────────────────────────

  const slotsLabel = document.createElement('div');
  slotsLabel.className = 'order-row-label';
  slotsLabel.textContent = 'Your order';
  el.appendChild(slotsLabel);

  const slotsRow = document.createElement('div');
  slotsRow.className = 'order-slots';

  const slotEls = Array.from({ length: n }, (_, si) => {
    const slot = document.createElement('div');
    slot.className = 'order-slot';
    slot.dataset.si = si;

    const num = document.createElement('div');
    num.className = 'order-slot__num';
    num.textContent = si + 1;
    slot.appendChild(num);

    const text = document.createElement('div');
    text.className = 'order-slot__text';
    slot.appendChild(text);

    slotsRow.appendChild(slot);
    return slot;
  });

  el.appendChild(slotsRow);

  // ── Drag — tile bank → slots ──────────────────────────────────────────────

  const cleanupTileDrag = attachDrag(tilesRow, {
    itemSelector:  '.order-tile:not(.order-tile--placed)',
    getItemData:   el => Number(el.dataset.ti),
    ghostText:     ti => shuffled[ti],
    ghostClass:    'order-tile order-tile--ghost',
    draggingClass: 'order-tile--dragging',
    findTarget:    el => el.closest('.order-slot'),
    onDrop:        (ti, slotEl) => placeTile(ti, Number(slotEl.dataset.si)),
    onTap:         (ti) => onTileClick(ti),
    onEnterTarget: target => {
      if (hoveredSlot) hoveredSlot.classList.remove('order-slot--over');
      hoveredSlot = target;
      hoveredSlot?.classList.add('order-slot--over');
    },
  });

  // ── Drag — filled slots → slots (reorder) ────────────────────────────────

  const cleanupSlotDrag = attachDrag(slotsRow, {
    itemSelector:  '.order-slot',
    getItemData:   el => Number(el.dataset.si),
    ghostText:     si => slotTile[si] !== null ? shuffled[slotTile[si]] : '',
    ghostClass:    'order-tile order-tile--ghost',
    draggingClass: 'order-slot--dragging',
    findTarget:    el => el.closest('.order-slot'),
    onDrop: (fromSi, toSlotEl) => {
      const ti = slotTile[fromSi];
      if (ti !== null) placeTile(ti, Number(toSlotEl.dataset.si));
    },
    onTap: (si) => onSlotClick(si),
    onEnterTarget: target => {
      if (hoveredSlot) hoveredSlot.classList.remove('order-slot--over');
      hoveredSlot = target;
      hoveredSlot?.classList.add('order-slot--over');
    },
  });

  // ── Click handlers ────────────────────────────────────────────────────────

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
    if (disabled) return;
    if (tileSlot[ti] !== null) removeTileFromSlot(tileSlot[ti]);
    if (slotTile[si] !== null) removeTileFromSlot(si);

    tileSlot[ti] = si;
    slotTile[si] = ti;
    slotEls[si].querySelector('.order-slot__text').textContent = shuffled[ti];
    slotEls[si].classList.add('order-slot--filled');
    tileEls[ti].classList.add('order-tile--placed');

    setSelected(null);
    checkAllPlaced();
  }

  function removeTileFromSlot(si) {
    const ti = slotTile[si];
    if (ti === null) return;
    tileSlot[ti] = null;
    slotTile[si] = null;
    slotEls[si].querySelector('.order-slot__text').textContent = '';
    slotEls[si].classList.remove('order-slot--filled');
    tileEls[ti].classList.remove('order-tile--placed');
  }

  function setSelected(ti) {
    if (selectedTile !== null) tileEls[selectedTile].classList.remove('order-tile--selected');
    selectedTile = ti;
    if (ti !== null) tileEls[ti].classList.add('order-tile--selected');
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
    if (hoveredSlot) { hoveredSlot.classList.remove('order-slot--over'); hoveredSlot = null; }
    for (let si = 0; si < n; si++) {
      const slot = slotEls[si];
      const placedText = slotTile[si] !== null ? shuffled[slotTile[si]] : null;
      const correctText = sentences[si];
      const isCorrect = placedText !== null && placedText.trim() === correctText.trim();
      slot.classList.add(isCorrect ? 'order-slot--correct' : 'order-slot--wrong');
      if (!isCorrect) {
        const textEl = slot.querySelector('.order-slot__text');
        if (!placedText) textEl.textContent = '—';
        const hint = document.createElement('div');
        hint.className = 'order-slot__hint';
        hint.textContent = correctText;
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
