import { navigate } from '../router.js';
import { icon } from '../lib/icons.js';
import { rtdb, serverNow } from '../firebase.js';
import {
  ref, onValue, update, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';
import { createLeaderboard } from '../components/leaderboard.js';
import { createPodium } from '../components/podium.js';
import { READY_COUNTDOWN_SECONDS, INTER_STAGE_SECONDS } from '../lib/constants.js';

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
  const storedToken      = localStorage.getItem(`hostToken_${code}`);
  const matchRef         = ref(rtdb, `matches/${code}`);
  const matchPlayersRef  = ref(rtdb, `matchPlayers/${code}`);

  let match        = null;
  let allPlayers   = {};   // FIX 4: players live in matchPlayers/{code}, not in match
  let currentView  = null;
  let roundTick    = null;
  let autoAdvance  = null;
  let countdownEl  = null;

  showLoading(container);

  // FIX 4: two lightweight listeners instead of one fat one
  const unsubMatch = onValue(matchRef, snap => {
    if (!snap.exists()) return showErr(container, 'Match not found.');
    match = snap.val();
    render();
  });

  const unsubPlayers = onValue(matchPlayersRef, snap => {
    allPlayers = snap.val() || {};
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

    // FIX 3: lobby handled inline — no separate onValue sub-listener
    if (match.state === 'lobby') {
      if (currentView !== 'lobby') {
        clearTimers();
        currentView = 'lobby';
        renderLobby(isHost);
      } else {
        updateLobbyPlayers(allPlayers);
      }
      return;
    }

    if (key === currentView) {
      if (match.state === 'playing') {
        const round = match.rounds?.[match.currentRound];
        if (round?.startAt && !roundTick) tickPlaying(round, match.template.config, isHost);
      } else if (match.state === 'results') {
        // Refresh leaderboard live — catches late submissions from players with slow connections
        const lbWrap = container.querySelector('#lb-wrap');
        if (lbWrap) {
          lbWrap.innerHTML = '';
          lbWrap.appendChild(
            createLeaderboard(Object.values(allPlayers), { currentRound: match.currentRound, gridMode: true })
          );
        }
      }
      return;
    }

    clearTimers();
    currentView = key;

    if (match.state === 'playing') return renderPlaying(isHost);
    if (match.state === 'results') return renderResults(isHost);
    if (match.state === 'finished') return renderPodium();
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
      container.querySelector('#start-btn').addEventListener('click', hostStartGame);
    }

    // FIX 3: no sub-listener — allPlayers is already updated by matchPlayersRef listener above
    updateLobbyPlayers(allPlayers);
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
    const round     = match.rounds?.[match.currentRound];
    const roundType = round?.type;
    const CLRS      = ['a', 'b', 'c', 'd'];

    let extraContent = '';
    if (roundType === 'shuffle') {
      extraContent = round.imageUrl
        ? `<img src="${esc(round.imageUrl)}" class="host-shuffle-img" alt="Round image">`
        : `<div class="host-shuffle-noimg">No image provided</div>`;
    } else if (roundType === 'choice') {
      const qa = round.answers ?? [];
      extraContent = `
        <div class="host-choice-view">
          <div class="host-choice-question">${esc(round.question ?? '')}</div>
          <div class="host-choice-answers">
            ${qa.map((a, i) => `
              <div class="host-choice-btn host-choice-btn--${CLRS[i] ?? 'a'}">
                <span class="host-choice-letter">${String.fromCharCode(65 + i)}</span>
                <span>${esc(a.text ?? '')}</span>
              </div>`).join('')}
          </div>
        </div>`;
    } else if (roundType === 'correct') {
      const words = (round.sentence ?? '').trim().split(/\s+/);
      extraContent = `
        <div class="host-correct-view">
          <div class="host-correct-label">Find the mistake</div>
          <div class="host-correct-sentence">
            ${words.map((w, i) =>
              `<span class="host-correct-word${i === round.wrongIndex ? ' host-correct-word--hint' : ''}">${esc(w)}</span>`
            ).join(' ')}
          </div>
        </div>`;
    } else if (roundType === 'order') {
      const sentences = round.sentences ?? [];
      extraContent = `
        <div class="host-order-view">
          <div class="host-order-label">Put in order (${sentences.length} sentences)</div>
          ${sentences.map((s, i) => `<div class="host-order-sentence"><span class="host-order-num">${i + 1}</span>${esc(s)}</div>`).join('')}
        </div>`;
    } else if (roundType === 'connections') {
      const groups = round.groups ?? [];
      const allWords = groups.flatMap(g => g.words ?? []).sort(() => Math.random() - 0.5);
      extraContent = `
        <div class="host-connections-view">
          <div class="host-connections-label">Find the connections</div>
          <div class="host-connections-grid">
            ${allWords.map(w => `<div class="host-connections-chip">${esc(w)}</div>`).join('')}
          </div>
        </div>`;
    } else {
      extraContent = `
        <div style="text-align:center;">
          <div class="round-label">Round</div>
          <div class="round-num">${match.currentRound + 1} <span style="font-size:1.2rem;color:var(--text-2);">/ ${match.template.numRounds}</span></div>
        </div>`;
    }

    container.innerHTML = `
      <div class="page host-page">
        <div class="host-header">
          <div>
            <div class="host-head-sub">Round ${match.currentRound + 1} / ${match.template.numRounds}</div>
            <div class="host-head-title">${esc(match.template.title)}</div>
          </div>
          <div>
            ${isHost ? `<button class="btn btn--secondary" id="end-btn">End round</button>` : ''}
          </div>
        </div>

        <div class="host-body" style="align-items:center;justify-content:center;gap:${roundType === 'shuffle' ? '12px' : '28px'}">
          ${extraContent}
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

    if (round?.startAt) tickPlaying(round, match.template.config, isHost);
  }

  function tickPlaying(round, cfg, isHost) {
    if (roundTick) return;
    const totalMs    = cfg.minigameSeconds * 1000;
    const cntdownMs  = READY_COUNTDOWN_SECONDS * 1000;

    // Show countdown synchronously so the overlay appears before the first interval
    // fires (100ms later), preventing the timer from flickering visible.
    const preElapsed = serverNow() - round.startAt;
    if (preElapsed < cntdownMs) {
      showCountdown(Math.ceil((cntdownMs - preElapsed) / 1000));
    }

    roundTick = setInterval(() => {
      const now     = serverNow();
      const elapsed = now - round.startAt;
      const timerEl = container.querySelector('#timer-display');
      const barEl   = container.querySelector('#timer-bar');
      const finEl   = container.querySelector('#fin-count');
      const connEl  = container.querySelector('#conn-count');
      if (!timerEl) { clearInterval(roundTick); roundTick = null; return; }

      // FIX 4: use allPlayers (separate from match node)
      const all       = Object.values(allPlayers);
      const connected = all.filter(p => p.connected);
      const finished  = all.filter(p => p.rounds?.[match.currentRound] !== undefined);
      if (connEl) connEl.textContent = connected.length;
      if (finEl)  finEl.textContent  = finished.length;
      if (isHost && connected.length > 0 && finished.length >= connected.length) {
        clearInterval(roundTick); roundTick = null;
        setTimeout(() => hostEndRound(), 400);
        return;
      }

      if (elapsed < cntdownMs) {
        const n = Math.ceil((cntdownMs - elapsed) / 1000);
        timerEl.textContent  = n;
        timerEl.className    = 'timer-display';
        timerEl.style.color  = '';
        if (barEl) { barEl.style.width = '100%'; barEl.style.background = ''; }
        showCountdown(n);
      } else {
        hideCountdown();
        const gameElapsed = elapsed - cntdownMs;
        const remaining   = Math.max(0, totalMs - gameElapsed);
        const pct         = remaining / totalMs;
        const col         = timeColor(pct);

        timerEl.textContent  = (remaining / 1000).toFixed(1);
        timerEl.className    = 'timer-display';
        timerEl.style.color  = col;
        if (barEl) {
          barEl.style.width      = `${pct * 100}%`;
          barEl.className        = 'timer-bar';
          barEl.style.background = col;
        }

        if (remaining === 0 && isHost) {
          clearInterval(roundTick); roundTick = null;
          setTimeout(() => hostEndRound(), 600);
        }
      }
    }, 100);
  }

  function showCountdown(n) {
    if (!countdownEl) {
      countdownEl = document.createElement('div');
      countdownEl.className = 'countdown-overlay';
      document.body.appendChild(countdownEl);
    }
    if (countdownEl._n === n) return;
    countdownEl._n = n;
    const numEl = document.createElement('div');
    numEl.className = 'countdown-number';
    numEl.textContent = n;
    countdownEl.replaceChildren(numEl);
  }
  function hideCountdown() {
    if (countdownEl) { countdownEl.remove(); countdownEl = null; }
  }

  async function hostEndRound() {
    clearTimers();
    // Players write their own round results; late submissions are handled by the
    // leaderboard live-refresh in render(). Just flip the state here.
    await update(ref(rtdb, '/'), {
      [`matches/${code}/state`]:        'results',
      [`matches/${code}/lastActiveAt`]: serverTimestamp(),
    });
  }

  // ── Results ──────────────────────────────────────────────

  function renderResults(isHost) {
    const cfg       = match.template.config;
    const players   = Object.values(allPlayers);
    const round     = match.rounds?.[match.currentRound];
    const CLRS      = ['a', 'b', 'c', 'd'];

    let revealContent = '';
    if (round?.type === 'choice') {
      const qa = round.answers ?? [];
      revealContent = `
        <div class="host-choice-reveal">
          ${qa.map((a, i) => `
            <div class="host-choice-btn host-choice-btn--${CLRS[i] ?? 'a'} ${a.correct ? 'host-choice-btn--reveal-correct' : 'host-choice-btn--reveal-wrong'}">
              <span class="host-choice-letter">${String.fromCharCode(65 + i)}</span>
              <span>${esc(a.text ?? '')}</span>
              ${a.correct ? `<span class="host-choice-tick">✓</span>` : ''}
            </div>`).join('')}
        </div>`;
    }

    container.innerHTML = `
      <div class="page host-page">
        <div class="host-header">
          <div>
            <div class="host-head-sub">Round ${match.currentRound + 1} results</div>
            <div class="host-head-title">${esc(match.template.title)}</div>
          </div>
          <div>
            ${isHost ? `<button class="btn btn--secondary" id="next-btn">Next →</button>` : ''}
          </div>
        </div>
        <div class="host-body">
          <div class="results-view">
            ${revealContent}
            <div class="results-header">
              <h3>Leaderboard</h3>
              <span class="results-countdown" id="res-cd"></span>
            </div>
            <div id="lb-wrap"></div>
          </div>
        </div>
      </div>
    `;

    container.querySelector('#lb-wrap').appendChild(
      createLeaderboard(players, { currentRound: match.currentRound, gridMode: true })
    );

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
    const updates = { lastActiveAt: serverTimestamp() };
    if (next < match.template.numRounds) {
      updates['state']                  = 'playing';
      updates['currentRound']           = next;
      updates[`rounds/${next}/startAt`] = serverTimestamp();
    } else {
      updates['state'] = 'finished';
    }
    await update(matchRef, updates);
  }

  // ── Podium ───────────────────────────────────────────────

  function renderPodium() {
    // FIX 4: players come from allPlayers
    const players = Object.values(allPlayers);
    container.innerHTML = `
      <div class="page host-page host-podium">
        <div class="podium-title">${icon('trophy')} Final Standings</div>
        <div id="pod-wrap" style="flex:1;display:flex;flex-direction:column;"></div>
      </div>
    `;
    container.querySelector('#pod-wrap').appendChild(createPodium(players));
  }

  // ── Cleanup ──────────────────────────────────────────────

  function clearTimers() {
    if (roundTick)   { clearInterval(roundTick);   roundTick  = null; }
    if (autoAdvance) { clearInterval(autoAdvance); autoAdvance = null; }
    hideCountdown();
  }

  return () => {
    unsubMatch();
    unsubPlayers();
    clearTimers();
  };
}

function timeColor(frac) {
  const f = Math.max(0, Math.min(1, frac));
  return `hsl(${Math.round(f * 130)} 78% 56%)`;
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
