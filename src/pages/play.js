import { navigate } from '../router.js';
import { rtdb, serverNow } from '../firebase.js';
import {
  ref, onValue, update, get, set, serverTimestamp, onDisconnect,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';
import { createMatchingGame } from '../components/matchingGame.js';
import { createPodium } from '../components/podium.js';
import { dedupeNickname, validateNickname } from '../lib/nicknames.js';
import { gradeRound } from '../lib/grading.js';
import { computeTimeBonus, computeRoundScore, computeTotalScore } from '../lib/scoring.js';
import { rankPlayers } from '../lib/ranking.js';
import { READY_COUNTDOWN_SECONDS } from '../lib/constants.js';

export function mountPlay(container, code) {
  const matchRef = ref(rtdb, `matches/${code}`);

  let playerId = localStorage.getItem(`playerId_${code}`) || null;
  let nickname = localStorage.getItem(`nickname_${code}`) || null;

  let match        = null;
  let currentView  = null;
  let gameInstance = null;
  let tickInterval = null;
  let cdOverlay    = null;
  let revealTimer  = null;
  const submitted  = {};  // roundIdx → true once submitted

  showLoading(container);

  const unsubscribe = onValue(matchRef, snap => {
    if (!snap.exists()) return showErrPage(container, '🔍', 'Game not found', 'This code doesn\'t match any active game.');
    match = snap.val();
    dispatch();
  });

  function dispatch() {
    if (!match) return;
    const state = match.state;

    if (state === 'finished' || state === 'podium') {
      if (currentView !== 'final') { currentView = 'final'; renderFinal(); }
      return;
    }

    if (!playerId || !nickname) {
      if (state !== 'lobby') return showErrPage(container, '🚫', 'Game already started', 'You can only join during the lobby.');
      if (currentView !== 'join') { currentView = 'join'; renderJoinForm(); }
      return;
    }

    if (state === 'lobby') {
      if (currentView !== 'lobby') {
        currentView = 'lobby';
        renderLobby();
      } else {
        // Realtime update: refresh player count in place
        const countEl = container.querySelector('#lobby-count');
        if (countEl) {
          const n = Object.keys(match.players || {}).length;
          countEl.textContent = `${n} player${n !== 1 ? 's' : ''} joined`;
        }
      }
      return;
    }

    const roundIdx = match.currentRound;

    if (state === 'playing') {
      const key = `playing-${roundIdx}`;
      if (currentView !== key) {
        currentView = key;
        clearTick();
        document.querySelectorAll('.round-result-overlay').forEach(e => e.remove());
        if (gameInstance) { gameInstance.cleanup(); gameInstance = null; }
        renderPlaying();
      } else {
        tickRound();
      }
      return;
    }

    if (state === 'results') {
      const key = `results-${roundIdx}`;
      if (currentView !== key) {
        currentView = key;
        clearTick();
        document.querySelectorAll('.round-result-overlay').forEach(e => e.remove());
        renderResults();
      }
      return;
    }
  }

  // ── Join form ────────────────────────────────────────────

  function renderJoinForm() {
    if (match.state !== 'lobby') return showErrPage(container, '🚫', 'Game already started', 'You can only join during the lobby.');
    if (Object.keys(match.players || {}).length >= match.maxPlayers) {
      return showErrPage(container, '😅', 'Game full', `This game has reached its player limit (${match.maxPlayers}).`);
    }

    container.innerHTML = `
      <div class="page play-page">
        <div class="play-nickname-form">
          <div style="text-align:center;margin-bottom:8px;">
            <div style="font-size:2rem;font-weight:900;margin-bottom:6px;">Join Game</div>
            <div style="color:var(--text-2);">Code: <strong>${code}</strong> · ${esc(match.template.title)}</div>
          </div>
          <div class="card" style="width:100%;max-width:400px;">
            <div class="form-group" style="margin-bottom:16px;">
              <label class="form-label" for="nick-input">Your nickname</label>
              <input id="nick-input" class="input" type="text" maxlength="20" placeholder="e.g. Alex" autocomplete="off" autocorrect="off">
              <span id="nick-error" class="form-error" style="display:none;"></span>
            </div>
            <button class="btn btn--primary btn--full btn--lg" id="join-btn">Join →</button>
          </div>
        </div>
      </div>
    `;

    const nickInput = container.querySelector('#nick-input');
    const joinBtn   = container.querySelector('#join-btn');
    const errEl     = container.querySelector('#nick-error');

    nickInput.addEventListener('keydown', e => { if (e.key === 'Enter') joinBtn.click(); });
    setTimeout(() => nickInput.focus(), 80);

    joinBtn.addEventListener('click', async () => {
      const validated = validateNickname(nickInput.value);
      if (!validated) {
        errEl.textContent = 'Nickname must be 1–20 characters.';
        errEl.style.display = 'block';
        return;
      }
      joinBtn.disabled = true;
      try {
        const pSnap = await get(ref(rtdb, `matches/${code}/players`));
        const sSnap = await get(ref(rtdb, `matches/${code}/state`));
        const existing = pSnap.val() || {};

        if (sSnap.val() !== 'lobby') return showErrPage(container, '🚫', 'Game already started', '');
        if (Object.keys(existing).length >= match.maxPlayers) return showErrPage(container, '😅', 'Game full', '');

        const finalNick = dedupeNickname(validated, Object.values(existing).map(p => p.nickname));
        if (!playerId) {
          playerId = crypto.randomUUID();
          localStorage.setItem(`playerId_${code}`, playerId);
        }
        nickname = finalNick;
        localStorage.setItem(`nickname_${code}`, finalNick);

        const playerRef = ref(rtdb, `matches/${code}/players/${playerId}`);
        await set(playerRef, {
          nickname: finalNick, joinedAt: serverTimestamp(),
          connected: true, totalScore: 0, rounds: {},
        });
        onDisconnect(ref(rtdb, `matches/${code}/players/${playerId}/connected`)).set(false);

        currentView = 'lobby';
        renderLobby();
      } catch (err) {
        console.error(err);
        errEl.textContent = 'Failed to join. Try again.';
        errEl.style.display = 'block';
        joinBtn.disabled = false;
      }
    });
  }

  // ── Lobby ────────────────────────────────────────────────

  function renderLobby() {
    const n = Object.keys(match.players || {}).length;
    container.innerHTML = `
      <div class="page play-page">
        <div class="play-waiting">
          <div style="font-size:3rem;">👋</div>
          <h2>You're in!</h2>
          <p style="color:var(--text-2);">Welcome, <strong>${esc(nickname)}</strong></p>
          <div class="divider" style="width:60px;"></div>
          <div class="spinner"></div>
          <p class="text-muted">Waiting for the host to start…</p>
          <div class="badge badge--primary" id="lobby-count">${n} player${n !== 1 ? 's' : ''} joined</div>
        </div>
      </div>
    `;
  }

  // ── Playing ──────────────────────────────────────────────

  function renderPlaying() {
    const roundIdx = match.currentRound;
    if (submitted[roundIdx]) return renderWaiting();

    const round    = match.rounds[roundIdx];
    const cfg      = match.template.config;
    const pool     = match.template.pairsPool;
    const pairs    = round.pairIndices.map(i => pool[i]);

    container.innerHTML = `
      <div class="page play-page">
        <div class="game-wrap">
          <div class="game-timer-row">
            <div class="timer-bar-wrap" style="flex:1;">
              <div class="timer-bar" id="game-bar" style="width:100%"></div>
            </div>
            <div class="game-timer-num" id="game-timer">—</div>
          </div>
          <div id="game-area" style="flex:1;display:flex;flex-direction:column;min-height:0;visibility:hidden;"></div>
        </div>
      </div>
    `;

    gameInstance = createMatchingGame({
      pairs,
      onSubmit(connections, finished) {
        handleSubmit(roundIdx, round, cfg, connections, finished);
      },
    });
    container.querySelector('#game-area').appendChild(gameInstance.el);

    if (round.startAt) tickRound();
  }

  function renderWaiting() {
    container.innerHTML = `
      <div class="page play-page">
        <div class="play-waiting">
          <div class="spinner"></div>
          <p class="text-muted">Waiting for the round to end…</p>
        </div>
      </div>
    `;
  }

  function tickRound() {
    clearTick();
    const roundIdx = match.currentRound;
    const round    = match.rounds?.[roundIdx];
    if (!round?.startAt) return;

    const cfg        = match.template.config;
    const totalMs    = cfg.minigameSeconds * 1000;
    const cntdownMs  = READY_COUNTDOWN_SECONDS * 1000;

    tickInterval = setInterval(() => {
      if (!currentView?.startsWith('playing')) { clearTick(); return; }

      const now      = serverNow();
      const elapsed  = now - round.startAt;
      const timerEl  = container.querySelector('#game-timer');
      const barEl    = container.querySelector('#game-bar');
      if (!timerEl) { clearTick(); return; }

      if (elapsed < cntdownMs) {
        const n = Math.ceil((cntdownMs - elapsed) / 1000);
        timerEl.textContent = n;
        timerEl.className   = 'game-timer-num';
        if (barEl) barEl.style.width = '100%';
        showCd(n);
      } else {
        hideCd();
        const gameArea = container.querySelector('#game-area');
        if (gameArea) gameArea.style.visibility = '';
        const gameElapsed = elapsed - cntdownMs;
        const remaining   = Math.max(0, totalMs - gameElapsed);
        const pct         = remaining / totalMs;
        const col         = timeColor(pct);
        timerEl.textContent  = (remaining / 1000).toFixed(1);
        timerEl.className    = 'game-timer-num';
        timerEl.style.color  = col;
        if (barEl) {
          barEl.style.width      = `${pct * 100}%`;
          barEl.className        = 'timer-bar';
          barEl.style.background = col;
        }
        if (remaining === 0 && gameInstance && !submitted[roundIdx]) {
          clearTick(); gameInstance.forceSubmit();
        }
      }
    }, 100);
  }

  function showCd(n) {
    if (!cdOverlay) {
      cdOverlay = document.createElement('div');
      cdOverlay.className = 'countdown-overlay';
      document.body.appendChild(cdOverlay);
    }
    if (cdOverlay._n === n) return;
    cdOverlay._n = n;
    const numEl = document.createElement('div');
    numEl.className = 'countdown-number';
    numEl.textContent = n;
    cdOverlay.replaceChildren(numEl);
  }
  function hideCd() { if (cdOverlay) { cdOverlay.remove(); cdOverlay = null; } }

  async function handleSubmit(roundIdx, round, cfg, connections, finished) {
    if (submitted[roundIdx]) return;
    submitted[roundIdx] = true;
    clearTick(); hideCd();

    const now          = serverNow();
    const gameStart    = round.startAt + READY_COUNTDOWN_SECONDS * 1000;
    const elapsed      = now - gameStart;
    const remainingMs  = Math.max(0, cfg.minigameSeconds * 1000 - elapsed);

    const correctPairs = gradeRound(connections);
    const timeBonus    = computeTimeBonus(finished, remainingMs, cfg.minigameSeconds, cfg.bonusMax);
    const roundScore   = computeRoundScore(correctPairs, timeBonus);

    if (gameInstance) gameInstance.reveal();
    // Show green/red reveal for 2 seconds before the score overlay
    revealTimer = setTimeout(() => {
      revealTimer = null;
      showRoundResult(correctPairs, timeBonus, roundScore, finished);
    }, 4000);

    try {
      const player       = match.players?.[playerId] || {};
      const existing     = player.rounds || {};
      const allRounds    = { ...existing, [roundIdx]: {finished, correctPairs, timeLeftMs: remainingMs, score: roundScore} };
      const totalScore   = computeTotalScore(Object.values(allRounds));

      await update(ref(rtdb, `matches/${code}/players/${playerId}`), {
        [`rounds/${roundIdx}`]: {
          finished, correctPairs, timeLeftMs: remainingMs, score: roundScore,
          submittedAt: serverTimestamp(),
        },
        totalScore,
      });
    } catch (err) { console.error('Save failed:', err); }
  }

  function showRoundResult(correctPairs, timeBonus, roundScore, finished) {
    const el = document.createElement('div');
    el.className = 'round-result-overlay';
    el.innerHTML = `
      <div class="round-result-pill">${correctPairs}/6 correct</div>
      <div class="round-result-stats">
        <div class="round-result-stat">
          <div class="round-result-stat__val">${correctPairs}</div>
          <div class="round-result-stat__label">Pairs</div>
        </div>
        <div class="round-result-stat">
          <div class="round-result-stat__val" style="color:${finished ? 'var(--primary)' : 'var(--text-3)'}">+${timeBonus}</div>
          <div class="round-result-stat__label">Time bonus</div>
        </div>
        <div class="round-result-stat">
          <div class="round-result-stat__val round-result-stat__val--score">${roundScore}</div>
          <div class="round-result-stat__label">Points</div>
        </div>
      </div>
      <div class="round-result-waiting">Waiting for others…</div>
    `;
    document.body.appendChild(el);
  }

  // ── Results ──────────────────────────────────────────────

  function renderResults() {
    const roundIdx  = match.currentRound;
    const myData    = match.players?.[playerId];
    const res       = myData?.rounds?.[roundIdx];
    const total     = myData?.totalScore ?? 0;
    const players   = Object.values(match.players || {});
    const ranked    = rankPlayers(players);
    const myRank    = ranked.find(p => p.nickname === myData?.nickname);

    container.innerHTML = `
      <div class="page play-page">
        <div class="play-result">
          <div>
            <div style="font-size:0.8rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-3);margin-bottom:6px;">Round ${roundIdx + 1}</div>
            <div class="result-score">${res?.score ?? 0}</div>
            <div style="font-size:0.9rem;color:var(--text-2);margin-top:4px;">pts this round</div>
          </div>
          <div class="result-breakdown">
            <div class="result-stat"><div class="result-stat__value">${res?.correctPairs ?? 0}/6</div><div class="result-stat__label">Correct</div></div>
            <div class="result-stat"><div class="result-stat__value" style="color:var(--primary);">+${res ? res.score - res.correctPairs : 0}</div><div class="result-stat__label">Time bonus</div></div>
            <div class="result-stat"><div class="result-stat__value">${total}</div><div class="result-stat__label">Total</div></div>
          </div>
          ${myRank ? `<div class="badge badge--primary" style="font-size:.95rem;padding:6px 16px;">Rank #${myRank.rank} of ${players.length}</div>` : ''}
          <div class="spinner"></div>
          <p class="text-muted">Waiting for next round…</p>
        </div>
      </div>
    `;
  }

  // ── Final / Podium ───────────────────────────────────────

  function renderFinal() {
    document.querySelectorAll('.round-result-overlay').forEach(e => e.remove());
    clearTick();

    const players  = Object.values(match.players || {});
    const ranked   = rankPlayers(players);
    const myData   = match.players?.[playerId];
    const myRanked = ranked.find(p => p.nickname === myData?.nickname);

    container.innerHTML = `
      <div class="page play-page" style="background:radial-gradient(ellipse 80% 50% at 50% 0%,rgba(123,104,255,.1) 0%,transparent 60%);">
        <div style="padding:32px 20px 16px;text-align:center;">
          <div style="font-size:.8rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-3);">Your final rank</div>
          <div class="final-rank__num">#${myRanked?.rank ?? '?'}</div>
          <div style="color:var(--text-2);font-weight:700;">${myData?.totalScore ?? 0} total points</div>
          <div style="color:var(--text-3);font-size:.85rem;margin-top:4px;">${esc(nickname ?? '')}</div>
        </div>
        <div id="pod-area" style="flex:1;display:flex;flex-direction:column;"></div>
        <div style="padding:20px;text-align:center;">
          <button class="btn btn--secondary" id="home">← Home</button>
        </div>
      </div>
    `;

    container.querySelector('#home').addEventListener('click', () => navigate('/'));
    container.querySelector('#pod-area').appendChild(createPodium(players));
  }

  // ── Helpers ──────────────────────────────────────────────

  function clearTick() {
    if (tickInterval) { clearInterval(tickInterval); tickInterval = null; }
    if (revealTimer)  { clearTimeout(revealTimer);   revealTimer  = null; }
    hideCd();
  }

  return () => {
    unsubscribe();
    clearTick();
    document.querySelectorAll('.round-result-overlay,.countdown-overlay').forEach(e => e.remove());
    if (gameInstance) gameInstance.cleanup();
  };
}

function timeColor(frac) {
  const f = Math.max(0, Math.min(1, frac));
  return `hsl(${Math.round(f * 130)} 78% 56%)`;
}

function showLoading(c) {
  c.innerHTML = `<div class="loading-page"><div class="spinner"></div><span>Connecting…</span></div>`;
}
function showErrPage(c, icon, title, msg) {
  c.innerHTML = `
    <div class="page error-page">
      <div class="icon">${icon}</div><h2>${esc(title)}</h2>
      <p>${esc(msg)}</p>
      <button class="btn btn--secondary" id="h">Go home</button>
    </div>`;
  c.querySelector('#h').addEventListener('click', () => navigate('/'));
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
