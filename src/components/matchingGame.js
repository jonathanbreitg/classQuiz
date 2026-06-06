import { gradeRound } from '../lib/grading.js';

const LINE_COLOR = 'rgba(255, 255, 255, 0.35)';
const N       = 14;       // chain segments (N+1 points)
const GRAVITY = 0.28;     // px/frame² downward pull
const DAMPING = 0.986;    // velocity multiplier per frame (1=no damping)
const SLACK   = 1.26;     // chain resting length vs straight-line distance
const ITERS   = 14;       // constraint relaxation iterations per frame

// ── Physics chain (verlet + distance constraints) ─────────
class Chain {
  constructor() {
    this.pts = Array.from({length: N + 1}, () => ({x: 0, y: 0, px: 0, py: 0}));
    this.pinA = {x: 0, y: 0};
    this.pinB = null; // null = free end (during drag)
    this.segLen = 20;
  }

  // Initialise points along the straight line A→B.
  // Pass `inherit` (array of pts) to carry over physics state (e.g. when grabbing a connected line).
  init(x1, y1, x2, y2, inherit = null) {
    this.pinA = {x: x1, y: y1};
    this.pinB = {x: x2, y: y2};
    const dist = Math.hypot(x2 - x1, y2 - y1);
    this.segLen = Math.max(8, (dist / N) * SLACK);
    if (inherit) {
      for (let i = 0; i <= N; i++) {
        this.pts[i].x  = inherit[i].x;
        this.pts[i].y  = inherit[i].y;
        this.pts[i].px = inherit[i].px;
        this.pts[i].py = inherit[i].py;
      }
    } else {
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        this.pts[i].x = this.pts[i].px = x1 + (x2 - x1) * t;
        this.pts[i].y = this.pts[i].py = y1 + (y2 - y1) * t;
      }
    }
  }

  step() {
    const pts = this.pts;
    const pa  = this.pinA;
    const pb  = this.pinB;

    // Verlet integration — interior + optional free tip
    const lastFree = pb ? N - 1 : N;
    for (let i = 1; i <= lastFree; i++) {
      const p = pts[i];
      const vx = (p.x - p.px) * DAMPING;
      const vy = (p.y - p.py) * DAMPING;
      p.px = p.x; p.py = p.y;
      p.x += vx;
      p.y += vy + GRAVITY;
    }

    // Distance constraints
    const sl = this.segLen;
    for (let iter = 0; iter < ITERS; iter++) {
      for (let i = 0; i < N; i++) {
        const a = pts[i], b = pts[i + 1];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d < 1e-4) continue;
        const corr = (d - sl) / d;
        const aPin = i === 0;
        const bPin = i === N - 1 && pb !== null;
        if (aPin && bPin) {
          /* both fixed */
        } else if (aPin) {
          b.x -= dx * corr; b.y -= dy * corr;
        } else if (bPin) {
          a.x += dx * corr; a.y += dy * corr;
        } else {
          const h = corr * 0.5;
          a.x += dx * h; a.y += dy * h;
          b.x -= dx * h; b.y -= dy * h;
        }
      }
      // Re-anchor after each pass
      pts[0].x = pa.x; pts[0].y = pa.y;
      if (pb) { pts[N].x = pb.x; pts[N].y = pb.y; }
    }

    // Final stable anchor (zero out velocity so pins don't drift)
    pts[0].x = pa.x; pts[0].y = pa.y; pts[0].px = pa.x; pts[0].py = pa.y;
    if (pb) {
      pts[N].x = pb.x; pts[N].y = pb.y; pts[N].px = pb.x; pts[N].py = pb.y;
    }
  }

  // Catmull-Rom → cubic bezier path string
  path() {
    const pts = this.pts;
    let d = `M ${r(pts[0].x)} ${r(pts[0].y)}`;
    for (let i = 0; i < N; i++) {
      const p0 = pts[Math.max(0, i - 1)];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[Math.min(N, i + 2)];
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      d += ` C ${r(cp1x)} ${r(cp1y)},${r(cp2x)} ${r(cp2y)},${r(p2.x)} ${r(p2.y)}`;
    }
    return d;
  }
}

const r = n => n.toFixed(1);

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Public API ────────────────────────────────────────────
// pairs: [{word, definition}] in pair-index order (0-5)
// onSubmit(connections, finished)
// Returns { el, forceSubmit(), reveal(), cleanup() }
export function createMatchingGame({ pairs, onSubmit }) {
  const wordOrder = shuffle([0, 1, 2, 3, 4, 5]);
  const defOrder  = shuffle([0, 1, 2, 3, 4, 5]);

  // connections: wordPairIdx → defPairIdx
  const connections = {};

  // chains: wordPairIdx → { chain, pathEl }
  const chains = new Map();
  // drag: { side, pairIdx, chain, pathEl } | null
  let dragEntry = null;
  let drag = null; // pointer state { side, pairIdx }

  let disabled = false;
  let revealed  = false;
  let rafId     = null;

  // ── DOM ─────────────────────────────────────────────────
  const el = document.createElement('div');
  el.className = 'game-board';
  el.style.fontSize = '2rem'; // fitFontSize will reduce this to the maximum that fits
  el.innerHTML = `
    <div class="game-column" id="words-col"></div>
    <svg class="connections-svg" id="conn-svg" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible;z-index:1;"></svg>
    <div class="game-column" id="defs-col"></div>
  `;

  const wordsCol = el.querySelector('#words-col');
  const defsCol  = el.querySelector('#defs-col');
  const svg      = el.querySelector('#conn-svg');

  const wordEls = wordOrder.map((pairIdx, _) => {
    const box = document.createElement('div');
    box.className = 'match-box';
    box.dataset.side = 'word';
    box.dataset.pairIdx = pairIdx;
    box.innerHTML = `<span class="match-box__text">${esc(pairs[pairIdx].word)}</span><span class="match-box__icon" aria-hidden="true"></span>`;
    wordsCol.appendChild(box);
    return box;
  });

  const defEls = defOrder.map((pairIdx, _) => {
    const box = document.createElement('div');
    box.className = 'match-box';
    box.dataset.side = 'def';
    box.dataset.pairIdx = pairIdx;
    box.innerHTML = `<span class="match-box__text">${esc(pairs[pairIdx].definition)}</span><span class="match-box__icon" aria-hidden="true"></span>`;
    defsCol.appendChild(box);
    return box;
  });

  // ── Coordinate helpers ───────────────────────────────────
  function svgXY(clientX, clientY) {
    const r = svg.getBoundingClientRect();
    return {x: clientX - r.left, y: clientY - r.top};
  }

  // Right edge of word box, or left edge of def box, in SVG space
  function boxEdge(boxEl, side) {
    const br = boxEl.getBoundingClientRect();
    const sr = svg.getBoundingClientRect();
    return {
      x: side === 'right' ? br.right - sr.left : br.left - sr.left,
      y: (br.top + br.bottom) / 2 - sr.top,
    };
  }

  function wordEdge(pairIdx) {
    const el = wordEls.find(e => +e.dataset.pairIdx === pairIdx);
    return el ? boxEdge(el, 'right') : {x: 0, y: 0};
  }
  function defEdge(pairIdx) {
    const el = defEls.find(e => +e.dataset.pairIdx === pairIdx);
    return el ? boxEdge(el, 'left') : {x: 0, y: 0};
  }

  // ── SVG path helpers ─────────────────────────────────────
  function makePath(color, extraClass = '') {
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.classList.add('conn-line');
    if (extraClass) p.classList.add(extraClass);
    p.setAttribute('stroke', color);
    svg.appendChild(p);
    return p;
  }

  // ── Paired class ─────────────────────────────────────────
  function applyPairedClass() {
    for (const b of [...wordEls, ...defEls]) b.classList.remove('match-box--paired');
    for (const [wStr, dIdx] of Object.entries(connections)) {
      const wIdx = +wStr;
      const we = wordEls.find(e => +e.dataset.pairIdx === wIdx);
      const de = defEls.find(e => +e.dataset.pairIdx === dIdx);
      if (we) we.classList.add('match-box--paired');
      if (de) de.classList.add('match-box--paired');
    }
  }

  // ── RAF loop ─────────────────────────────────────────────
  function startLoop() {
    if (rafId) return;
    function tick() {
      let alive = false;

      // Connected chains
      for (const [wIdx, entry] of chains) {
        const dIdx = connections[wIdx];
        if (dIdx === undefined) { removeChain(wIdx); continue; }
        const we = wordEdge(wIdx);
        const de = defEdge(dIdx);
        entry.chain.pinA = we;
        entry.chain.pinB = de;
        entry.chain.step();
        entry.pathEl.setAttribute('d', entry.chain.path());
        alive = true;
      }

      // Drag chain
      if (dragEntry) {
        dragEntry.chain.step();
        dragEntry.pathEl.setAttribute('d', dragEntry.chain.path());
        alive = true;
      }

      rafId = alive ? requestAnimationFrame(tick) : null;
    }
    rafId = requestAnimationFrame(tick);
  }

  function stopLoop() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  }

  function removeChain(wIdx) {
    const entry = chains.get(wIdx);
    if (entry) { entry.pathEl.remove(); chains.delete(wIdx); }
  }

  // ── Connection logic ─────────────────────────────────────
  function connect(wIdx, dIdx) {
    // Unlink old connections
    if (connections[wIdx] !== undefined) {
      removeChain(wIdx);
    }
    for (const [w, d] of Object.entries(connections)) {
      if (+d === dIdx && +w !== wIdx) {
        removeChain(+w);
        delete connections[+w];
      }
    }

    connections[wIdx] = dIdx;

    // Use drag chain (carries physics state) or create fresh
    let chain, pathEl;
    if (dragEntry) {
      chain = dragEntry.chain;
      pathEl = dragEntry.pathEl;
      pathEl.classList.remove('conn-line--drag');
      pathEl.setAttribute('stroke', LINE_COLOR);
      dragEntry = null;
    } else {
      const we = wordEdge(wIdx), de = defEdge(dIdx);
      chain = new Chain();
      chain.init(we.x, we.y, de.x, de.y);
      pathEl = makePath(LINE_COLOR);
    }
    chain.pinA = wordEdge(wIdx);
    chain.pinB = defEdge(dIdx);
    chains.set(wIdx, {chain, pathEl});

    applyPairedClass();
    startLoop();

    if (Object.keys(connections).length === 6) {
      setTimeout(() => submitGame(true), 120);
    }
  }

  function disconnect(wIdx) {
    removeChain(wIdx);
    delete connections[wIdx];
    applyPairedClass();
  }

  // ── Pointer events ───────────────────────────────────────
  function boxAt(clientX, clientY) {
    for (const e of document.elementsFromPoint(clientX, clientY)) {
      if (e.classList.contains('match-box')) return e;
    }
    return null;
  }

  el.addEventListener('pointerdown', e => {
    if (disabled || revealed) return;
    const box = e.target.closest('.match-box');
    if (!box) return;
    e.preventDefault();

    const side   = box.dataset.side;
    const pairIdx = +box.dataset.pairIdx;

    el.querySelectorAll('.match-box--selected,.match-box--candidate').forEach(b => {
      b.classList.remove('match-box--selected', 'match-box--candidate');
    });
    box.classList.add('match-box--selected');
    box.setPointerCapture(e.pointerId);

    // Grab existing chain if this box was connected
    let inheritChain = null;
    if (side === 'word' && connections[pairIdx] !== undefined) {
      const existing = chains.get(pairIdx);
      if (existing) {
        inheritChain = existing.chain.pts.map(p => ({...p}));
        existing.pathEl.remove();
        chains.delete(pairIdx);
      }
      disconnect(pairIdx);
    } else if (side === 'def') {
      for (const [wStr, dIdx] of Object.entries(connections)) {
        if (dIdx === pairIdx) {
          const wIdx = +wStr;
          const existing = chains.get(wIdx);
          if (existing) {
            inheritChain = existing.chain.pts.map(p => ({...p}));
            existing.pathEl.remove();
            chains.delete(wIdx);
          }
          disconnect(wIdx);
        }
      }
    }

    drag = {side, pairIdx};

    // Create drag chain pinned at both ends (box edge ↔ pointer)
    const chain = new Chain();
    const ptr   = svgXY(e.clientX, e.clientY);
    if (side === 'word') {
      const edge = wordEdge(pairIdx);
      chain.init(edge.x, edge.y, ptr.x, ptr.y, inheritChain);
    } else {
      const edge = defEdge(pairIdx);
      chain.init(edge.x, edge.y, ptr.x, ptr.y, inheritChain);
    }
    // pinA = box edge, pinB = pointer (both set by init, both ends pinned)

    const pathEl = makePath('rgba(255,255,255,0.55)', 'conn-line--drag');
    dragEntry = {chain, pathEl};
    startLoop();
  });

  el.addEventListener('pointermove', e => {
    if (!drag || !dragEntry) return;
    e.preventDefault();
    const ptr = svgXY(e.clientX, e.clientY);

    // Both ends always pinned: box edge stays at pinA, pointer tracks as pinB
    dragEntry.chain.pinA = drag.side === 'word'
      ? wordEdge(drag.pairIdx)
      : defEdge(drag.pairIdx);
    dragEntry.chain.pinB = ptr;

    // Highlight candidate target
    el.querySelectorAll('.match-box--candidate').forEach(b => b.classList.remove('match-box--candidate'));
    const target = boxAt(e.clientX, e.clientY);
    if (target && target.dataset.side !== drag.side) {
      target.classList.add('match-box--candidate');
    }
  });

  el.addEventListener('pointerup', e => {
    if (!drag) return;
    el.querySelectorAll('.match-box--selected,.match-box--candidate').forEach(b => {
      b.classList.remove('match-box--selected', 'match-box--candidate');
    });

    const target = boxAt(e.clientX, e.clientY);
    if (target && target.classList.contains('match-box') && target.dataset.side !== drag.side) {
      const targetPairIdx = +target.dataset.pairIdx;
      if (drag.side === 'word') {
        connect(drag.pairIdx, targetPairIdx);
      } else {
        connect(targetPairIdx, drag.pairIdx);
      }
    } else {
      // Dropped on nothing — release drag chain (it falls under gravity)
      if (dragEntry) {
        dragEntry.pathEl.remove();
        dragEntry = null;
      }
    }
    drag = null;
  });

  el.addEventListener('pointercancel', () => {
    drag = null;
    if (dragEntry) { dragEntry.pathEl.remove(); dragEntry = null; }
    el.querySelectorAll('.match-box--selected,.match-box--candidate').forEach(b => {
      b.classList.remove('match-box--selected', 'match-box--candidate');
    });
  });

  // ── Font sizing ──────────────────────────────────────────
  function fitFontSize() {
    const boxes = [...el.querySelectorAll('.match-box')];
    if (!boxes.length) return;
    if (!boxes[0].clientHeight) { requestAnimationFrame(fitFontSize); return; }

    // overflow:hidden is required for scrollHeight to correctly reflect content
    // height on flex items (with overflow:visible the browser may not report overflow)
    boxes.forEach(b => { b.style.overflow = 'hidden'; });

    const MAX_REM = 2.00;
    const MIN_REM = 0.75;
    const STEP    = 0.05;
    let size = MAX_REM;
    while (size > MIN_REM) {
      el.style.fontSize = `${size.toFixed(2)}rem`;
      if (boxes.every(b => b.scrollHeight <= b.clientHeight + 2)) break;
      size -= STEP;
    }

    boxes.forEach(b => { b.style.overflow = ''; });
  }

  // Reflow lines on resize
  const ro = new ResizeObserver(() => { startLoop(); fitFontSize(); });
  ro.observe(el);

  // ── Submit & reveal ──────────────────────────────────────
  function submitGame(finished) {
    if (disabled) return;
    disabled = true;
    onSubmit({...connections}, finished);
  }

  function reveal() {
    revealed = true;
    disabled = true;
    stopLoop();
    // Remove all physics lines
    for (const [wIdx, entry] of chains) entry.pathEl.remove();
    chains.clear();
    if (dragEntry) { dragEntry.pathEl.remove(); dragEntry = null; }

    for (const box of [...wordEls, ...defEls]) {
      const side     = box.dataset.side;
      const pairIdx  = +box.dataset.pairIdx;
      const iconEl   = box.querySelector('.match-box__icon');
      box.classList.remove('match-box--paired', 'match-box--selected', 'match-box--candidate');

      let correct;
      if (side === 'word') {
        correct = connections[pairIdx] === pairIdx;
      } else {
        const matched = Object.entries(connections).find(([, d]) => +d === pairIdx);
        correct = matched ? +matched[0] === pairIdx : false;
      }

      box.classList.add(correct ? 'match-box--correct' : 'match-box--wrong');
      iconEl.textContent = correct ? '✓' : '✗';
      iconEl.setAttribute('aria-label', correct ? 'Correct' : 'Wrong');
    }
  }

  return {
    el,
    forceSubmit() { submitGame(false); },
    reveal,
    cleanup() { stopLoop(); ro.disconnect(); },
  };
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
