import { navigate } from '../router.js';
import { rtdb, serverNow } from '../firebase.js';
import {
  ref, onValue, update, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';
import { createLeaderboard } from '../components/leaderboard.js';
import { createPodium } from '../components/podium.js';
import { computeRoundScore, computeTotalScore } from '../lib/scoring.js';
import { gradeRound } from '../lib/grading.js';
import { READY_COUNTDOWN_SECONDS, INTER_STAGE_SECONDS } from '../lib/constants.js';

// Inject qrcodejs as a plain script (not an ES module) on first call
let qrReady = false;
function loadQR() {
  if (qrReady || window.QRCode) { qrReady = true; return Promise.resolve(); }
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
    s.onload = () => { qrReady = true; resolve(); };
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

export function mountHost(container, code) {
  const storedToken = localStorage.getItem(`hostToken_${code}`);
  const matchRef    = ref(rtdb, `matches/${code}`);

  let match        = null;
  let currentView  = null; // includes round index for 'playing'
  let roundTick    = null;
  let autoAdvance  = null;
  let countdownEl  = null; // overlay DOM node

  showLoading(container);

  const unsubscribe = onValue(matchRef, snap => {
    if (!snap.exists()) return showErr(container, 'Match not found.');
    match = snap.val();
    render();
  });

  function viewKey() {
    if (!match) return '';
    if (match.state === 'playing') return `playing-${match.currentRound}`;
    return match.state;
  }

  function render() {
    if (!match) return;
    const isHost = match.hostToken === storedToken;
    const key    = viewKey();

    // Lobby always refreshes (player list); other views refresh only on state/round change
    if (key === currentView && match.state !== 'lobby') {
      // Special case: playing but tick not running yet (startAt just appeared)
      if (match.state === 'playing') {
        const round = match.rounds?.[match.currentRound];
        if (round?.startAt && !roundTick) tickPlaying(round, match.template.config, isHost);
      }
      return;
    }

    clearTimers();
    currentView = key;

    if (match.state === 'lobby')   return renderLobby(isHost);
    if (match.state === 'playing') return renderPlaying(isHost);
    if (match.state === 'results') return renderResults(isHost);
    if (match.state === 'podium' || match.state === 'finished') return renderPodium();
  }

  // ── Lobby ────────────────────────────────────────────────

  function renderLobby(isHost) {
    const joinUrl = `${location.origin}${location.pathname}#/play/${code}`;

    container.innerHTML = `
      <div class="page host-page">
        <div class="host-header-slim">
          <span class="host-game-title">${esc(match.template.title)}</span>
          <span class="badge badge--primary">${match.template.numRounds} round${match.template.numRounds !== 1 ? 's' : ''}</span>
        </div>

        <div class="lobby-hero">
          <div class="lobby-code-label">Join with code</div>
          <div class="lobby-code-big">${code}</div>
          <div class="lobby-qr-row">
            <div id="qr-wrap" class="lobby-qr-canvas"></div>
            <div class="lobby-qr-url">${joinUrl}</div>
          </div>
        </div>

        <div class="lobby-players-section">
          <div class="player-list-header">
            <h3>Players</h3>
            <span class="player-count" id="player-count">0 / ${match.maxPlayers}</span>
          </div>
          <div class="player-grid" id="player-grid"></div>
        </div>

        <div class="lobby-footer">
          ${isHost
            ? `<button class="btn btn--success btn--lg btn--full" id="start-btn" disabled>Start Game →</button>`
            : `<p class="text-muted" style="text-align:center;">Waiting for host to start…</p>`
          }
        </div>
      </div>
    `;

    // QR code
    loadQR().then(() => {
      const wrap = container.querySelector('#qr-wrap');
      if (!wrap || !window.QRCode) return;
      try {
        new window.QRCode(wrap, {
          text: joinUrl, width: 148, height: 148,
          colorDark: '#0a0a14', colorLight: '#ffffff',
        });
      } catch {}
    }).catch(() => {});

    if (isHost) {
      const startBtn = container.querySelector('#start-btn');
      startBtn.addEventListener('click', hostStartGame);
    }

    // Subscribe to players for live updates
    const playersRef      = ref(rtdb, `matches/${code}/players`);
    const unsubPlayers    = onValue(playersRef, snap => updateLobbyPlayers(snap.val() || {}));
    container._cleanup    = unsubPlayers;
  }

  function updateLobbyPlayers(players) {
    const grid     = container.querySelector('#player-grid');
    const countEl  = container.querySelector('#player-count');
    const startBtn = container.querySelector('#start-btn');
    if (!grid) return;

    const list = Object.values(players);
    if (countEl) countEl.textContent = `${list.length} / ${match.maxPlayers}`;

    grid.innerHTML = '';
    for (const p of list) {
      const chip = document.createElement('div');
      chip.className = `player-chip ${p.connected ? 'player-chip--connected' : 'player-chip--disconnected'}`;
      chip.textContent = p.nickname;
      grid.appendChild(chip);
    }
    if (startBtn) startBtn.disabled = list.length === 0;
  }

  async function hostStartGame() {
    const btn = container.querySelector('#start-btn');
    if (btn) btn.disabled = true;
    await update(matchRef, {
      state: 'playing',
      currentRound: 0,
      lastActiveAt: serverTimestamp(),
      'rounds/0/startAt': serverTimestamp(),
    });
  }

  // ── Playing ──────────────────────────────────────────────

  function renderPlaying(isHost) {
    container.innerHTML = `
      <div class="page host-page">
        <div class="host-header">
          <div class="host-code">
            <span class="host-code__label">Code</span>
            <span class="host-code__value">${code}</span>
          </div>
          <div class="host-title">${esc(match.template.title)}</div>
          <div style="min-width:120px;text-align:right;">
            ${isHost ? `<button class="btn btn--secondary" id="end-btn">End round</button>` : ''}
          </div>
        </div>

        <div class="host-body" style="align-items:center;justify-content:center;gap:28px;">
          <div style="text-align:center;">
            <div class="round-label">Round</div>
            <div class="round-num">${match.currentRound + 1} <span style="font-size:1.2rem;color:var(--text-2);">/ ${match.template.numRounds}</span></div>
          </div>
          <div class="timer-display" id="timer-display">—</div>
          <div style="width:100%;max-width:520px;">
            <div class="timer-bar-wrap">
              <div class="timer-bar" id="timer-bar" style="width:100%"></div>
            </div>
          </div>
          <div class="finish-progress">
            <strong id="fin-count">0</strong>&nbsp;/&nbsp;<span id="conn-count">?</span> finished
          </div>
        </div>
      </div>
    `;

    if (isHost) {
      container.querySelector('#end-btn').addEventListener('click', () => hostEndRound());
    }

    const round = match.rounds?.[match.currentRound];
    if (round?.startAt) tickPlaying(round, match.template.config, isHost);
  }

  function tickPlaying(round, cfg, isHost) {
    if (roundTick) return;
    const totalMs     = cfg.minigameSeconds * 1000;
    const cntdownMs   = READY_COUNTDOWN_SECONDS * 1000;

    roundTick = setInterval(() => {
      const now      = serverNow();
      const elapsed  = now - round.startAt;
      const timerEl  = container.querySelector('#timer-display');
      const barEl    = container.querySelector('#timer-bar');
      const finEl    = container.querySelector('#fin-count');
      const connEl   = container.querySelector('#conn-count');
      if (!timerEl) { clearInterval(roundTick); roundTick = null; return; }

      if (match.players) {
        const all       = Object.values(match.players);
        const connected = all.filter(p => p.connected);
        const finished  = all.filter(p => p.rounds?.[match.currentRound] !== undefined);
        if (connEl) connEl.textContent = connected.length;
        if (finEl)  finEl.textContent  = finished.length;
        if (isHost && connected.length > 0 && finished.length >= connected.length) {
          clearInterval(roundTick); roundTick = null;
          setTimeout(() => hostEndRound(), 400);
          return;
        }
      }

      if (elapsed < cntdownMs) {
        const n = Math.ceil((cntdownMs - elapsed) / 1000);
        timerEl.textContent = n;
        timerEl.className   = 'timer-display';
        if (barEl) barEl.style.width = '100%';
        showCountdown(n);
      } else {
        hideCountdown();
        const gameElapsed = elapsed - cntdownMs;
        const remaining   = Math.max(0, totalMs - gameElapsed);
        const pct         = remaining / totalMs;
        const secs        = Math.ceil(remaining / 1000);

        timerEl.textContent = secs;
        timerEl.className   = `timer-display${pct < 0.25 ? ' timer-display--danger' : pct < 0.5 ? ' timer-display--warning' : ''}`;
        if (barEl) {
          barEl.style.width = `${pct * 100}%`;
          barEl.className   = `timer-bar${pct < 0.25 ? ' timer-bar--danger' : pct < 0.5 ? ' timer-bar--warning' : ''}`;
        }

        if (remaining === 0 && isHost) {
          clearInterval(roundTick); roundTick = null;
          setTimeout(() => hostEndRound(), 600);
        }
      }
    }, 200);
  }

  function showCountdown(n) {
    if (countdownEl && countdownEl._n === n) return;
    if (countdownEl) countdownEl.remove();
    countdownEl = document.createElement('div');
    countdownEl.className = 'countdown-overlay';
    countdownEl._n = n;
    countdownEl.innerHTML = `<div class="countdown-number">${n}</div>`;
    document.body.appendChild(countdownEl);
  }
  function hideCountdown() {
    if (countdownEl) { countdownEl.remove(); countdownEl = null; }
  }

  async function hostEndRound() {
    clearTimers();
    const roundIdx = match.currentRound;
    const players  = match.players || {};
    const updates  = {};

    // Force-submit any connected players who haven't submitted
    for (const [pid, player] of Object.entries(players)) {
      if (!player.connected || player.rounds?.[roundIdx]) continue;
      const score = computeRoundScore(gradeRound({}), 0);
      updates[`players/${pid}/rounds/${roundIdx}`] = {
        finished: false, correctPairs: 0, timeLeftMs: 0, score,
        submittedAt: serverTimestamp(),
      };
    }

    // Recompute totals
    for (const [pid, player] of Object.entries(players)) {
      const allRounds = [];
      for (let i = 0; i <= roundIdx; i++) {
        const r = updates[`players/${pid}/rounds/${i}`] || player.rounds?.[i];
        if (r) allRounds.push(r);
      }
      updates[`players/${pid}/totalScore`] = computeTotalScore(allRounds);
    }

    updates['state']         = 'results';
    updates['lastActiveAt']  = serverTimestamp();
    await update(matchRef, updates);
  }

  // ── Results ──────────────────────────────────────────────

  function renderResults(isHost) {
    const cfg     = match.template.config;
    const players = Object.values(match.players || {});

    container.innerHTML = `
      <div class="page host-page">
        <div class="host-header">
          <div class="host-code">
            <span class="host-code__label">Code</span>
            <span class="host-code__value">${code}</span>
          </div>
          <div class="host-title">Round ${match.currentRound + 1} results</div>
          <div style="min-width:120px;text-align:right;">
            ${isHost ? `<button class="btn btn--secondary" id="next-btn">Next →</button>` : ''}
          </div>
        </div>
        <div class="host-body">
          <div class="results-view">
            <div class="results-header">
              <h3>Leaderboard</h3>
              <span class="results-countdown" id="res-cd"></span>
            </div>
            <div id="lb-wrap"></div>
          </div>
        </div>
      </div>
    `;

    container.querySelector('#lb-wrap').appendChild(createLeaderboard(players));

    if (isHost) {
      container.querySelector('#next-btn').addEventListener('click', () => {
        clearTimers(); hostAdvance();
      });
      let rem = cfg.interStageSeconds;
      const cdEl = container.querySelector('#res-cd');
      if (cdEl) cdEl.textContent = `Next in ${rem}s`;
      autoAdvance = setInterval(() => {
        rem--;
        if (cdEl) cdEl.textContent = rem > 0 ? `Next in ${rem}s` : '';
        if (rem <= 0) { clearInterval(autoAdvance); autoAdvance = null; hostAdvance(); }
      }, 1000);
    }
  }

  async function hostAdvance() {
    clearTimers();
    const next = match.currentRound + 1;
    const updates = {lastActiveAt: serverTimestamp()};
    if (next < match.template.numRounds) {
      updates['state']                    = 'playing';
      updates['currentRound']             = next;
      updates[`rounds/${next}/startAt`]   = serverTimestamp();
    } else {
      updates['state'] = 'podium';
    }
    await update(matchRef, updates);
  }

  // ── Podium ───────────────────────────────────────────────

  function renderPodium() {
    const players = Object.values(match.players || {});
    container.innerHTML = `
      <div class="page host-page host-podium">
        <div class="podium-title">🏆 Final Standings</div>
        <div id="pod-wrap" style="flex:1;display:flex;flex-direction:column;"></div>
      </div>
    `;
    container.querySelector('#pod-wrap').appendChild(createPodium(players));
    if (match.state === 'podium') {
      update(matchRef, {state: 'finished', lastActiveAt: serverTimestamp()});
    }
  }

  // ── Cleanup ──────────────────────────────────────────────

  function clearTimers() {
    if (roundTick)   { clearInterval(roundTick);   roundTick  = null; }
    if (autoAdvance) { clearInterval(autoAdvance); autoAdvance = null; }
    hideCountdown();
    if (container._cleanup) { container._cleanup(); container._cleanup = null; }
  }

  return () => {
    unsubscribe();
    clearTimers();
  };
}

function showLoading(container) {
  container.innerHTML = `<div class="loading-page"><div class="spinner"></div><span>Connecting…</span></div>`;
}

function showErr(container, msg) {
  container.innerHTML = `
    <div class="page error-page">
      <div class="icon">⚠️</div><h2>Oops</h2>
      <p>${esc(msg)}</p>
      <button class="btn btn--secondary" id="h">Go home</button>
    </div>`;
  container.querySelector('#h').addEventListener('click', () => navigate('/'));
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
