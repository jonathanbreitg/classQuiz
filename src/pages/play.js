import { navigate } from '../router.js';
import { rtdb, db, serverNow } from '../firebase.js';
import {
  ref, onValue, update, get, set, serverTimestamp, onDisconnect, increment,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';
import {
  doc, getDoc,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { createMatchingGame } from '../components/matchingGame.js';
import { createFillGame } from '../components/fillGame.js';
import { createSelectGame } from '../components/selectGame.js';
import { createTypeGame } from '../components/typeGame.js';
import { createPodium } from '../components/podium.js';
import { dedupeNickname, validateNickname } from '../lib/nicknames.js';
import { gradeRound, gradeFillRound } from '../lib/grading.js';
import { parseParagraph } from '../lib/fillParsing.js';
import { computeTimeBonus, computeRoundScore, computeTotalScore } from '../lib/scoring.js';
import { rankPlayers } from '../lib/ranking.js';
import { normalizeTemplate } from '../lib/templateNormalize.js';
import { randomUUID } from '../lib/codeGen.js';
import { READY_COUNTDOWN_SECONDS, FILL_SCORE_MAX } from '../lib/constants.js';

export function mountPlay(container, code) {
  const matchRef = ref(rtdb, `matches/${code}`);

  let playerId = localStorage.getItem(`playerId_${code}`) || null;
  let nickname = localStorage.getItem(`nickname_${code}`) || null;

  let match          = null;
  let currentView    = null;
  let gameInstance   = null;
  let tickInterval   = null;
  let cdOverlay      = null;
  const submitted    = {};

  // Full Firestore template data (rounds, pairsPool per round, etc.)
  let templateData     = null;
  let templateFetching = false;

  let myPlayerData   = null;
  let unsubMyPlayer  = null;

  let finalPlayers   = null;
  let unsubFinal     = null;

  let unsubConnected = null;

  showLoading(container);

  const unsubMatch = onValue(matchRef, snap => {
    if (!snap.exists()) return showErrPage(container, '🔍', 'Game not found', 'This code doesn\'t match any active game.');
    match = snap.val();
    ensureTemplate();
    dispatch();
  });

  // ── Template fetch ────────────────────────────────────────────────────────

  async function ensureTemplate() {
    if (templateData || templateFetching || !match?.templateId) return;
    templateFetching = true;
    try {
      const snap = await getDoc(doc(db, 'templates', match.templateId));
      if (snap.exists()) {
        templateData = normalizeTemplate(snap.data());
      }
    } catch (e) { console.error('Template fetch failed:', e); }
    templateFetching = false;
    dispatch();
  }

  // ── Own player subscription ───────────────────────────────────────────────

  function subscribeToMyPlayer() {
    if (unsubMyPlayer || !playerId) return;
    unsubMyPlayer = onValue(ref(rtdb, `matchPlayers/${code}/${playerId}`), snap => {
      myPlayerData = snap.val();
      if (currentView?.startsWith('results-')) {
        const roundIdx = Number(currentView.split('-')[1]);
        const r = myPlayerData?.rounds?.[roundIdx];
        if (r && submitted[roundIdx]) showRoundResult(r, roundIdx);
      }
    });
  }

  // ── Presence ──────────────────────────────────────────────────────────────

  function setupPresence() {
    if (unsubConnected || !playerId) return;
    const playerRef = ref(rtdb, `matchPlayers/${code}/${playerId}`);
    unsubConnected = onValue(ref(rtdb, '.info/connected'), snap => {
      if (!snap.val()) return;
      onDisconnect(ref(rtdb, `matchPlayers/${code}/${playerId}/connected`)).set(false);
      update(playerRef, { connected: true });
    });
  }

  // ── Dispatch ──────────────────────────────────────────────────────────────

  function dispatch() {
    if (!match) return;
    const state = match.state;

    if (state === 'finished') {
      if (currentView !== 'final') { currentView = 'final'; renderFinal(); }
      return;
    }

    if (!playerId || !nickname) {
      if (state !== 'lobby') return showErrPage(container, '🚫', 'Game already started', 'You can only join during the lobby.');
      if (currentView !== 'join') { currentView = 'join'; renderJoinForm(); }
      return;
    }

    if (playerId && !unsubMyPlayer) subscribeToMyPlayer();

    if (state === 'lobby') {
      if (currentView !== 'lobby') { currentView = 'lobby'; renderLobby(); }
      else { updateLobbyCount(); }
      return;
    }

    if (!templateData) { ensureTemplate(); return; }

    const roundIdx = match.currentRound;

    if (state === 'playing') {
      const key = `playing-${roundIdx}`;
      if (currentView !== key) {
        currentView = key;
        clearTick();
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
        if (!submitted[roundIdx] && gameInstance) {
          submitted[roundIdx] = true;
          gameInstance.reveal();
          const r = myPlayerData?.rounds?.[roundIdx];
          if (r) showRoundResult(r, roundIdx);
        }
      }
      return;
    }
  }

  // ── Join form ─────────────────────────────────────────────────────────────

  function renderJoinForm() {
    if (match.state !== 'lobby') return showErrPage(container, '🚫', 'Game already started', 'You can only join during the lobby.');
    if ((match.playerCount ?? 0) >= match.maxPlayers) {
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
              <input id="nick-input" class="input" type="text" maxlength="20" placeholder="e.g. Alex"
                autocomplete="off" autocorrect="off">
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
        const pSnap = await get(ref(rtdb, `matchPlayers/${code}`));
        const sSnap = await get(ref(rtdb, `matches/${code}/state`));
        const existing = pSnap.val() || {};

        if (sSnap.val() !== 'lobby') return showErrPage(container, '🚫', 'Game already started', '');
        if (Object.keys(existing).length >= match.maxPlayers) return showErrPage(container, '😅', 'Game full', '');

        const finalNick = dedupeNickname(validated, Object.values(existing).map(p => p.nickname));
        if (!playerId) {
          playerId = randomUUID();
          localStorage.setItem(`playerId_${code}`, playerId);
        }
        nickname = finalNick;
        localStorage.setItem(`nickname_${code}`, finalNick);

        const playerRef = ref(rtdb, `matchPlayers/${code}/${playerId}`);
        await set(playerRef, {
          nickname: finalNick, joinedAt: serverTimestamp(),
          connected: true, totalScore: 0, rounds: {},
        });
        await update(matchRef, { playerCount: increment(1) });

        subscribeToMyPlayer();
        setupPresence();
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

  // ── Lobby ──────────────────────────────────────────────────────────────────

  function renderLobby() {
    container.innerHTML = `
      <div class="page play-page">
        <div class="play-waiting">
          <div style="font-size:3rem;">👋</div>
          <h2>You're in!</h2>
          <p style="color:var(--text-2);">Welcome, <strong>${esc(nickname)}</strong></p>
          <div class="divider" style="width:60px;"></div>
          <div class="spinner"></div>
          <p class="text-muted">Waiting for the host to start…</p>
          <div class="badge badge--primary" id="lobby-count">— players joined</div>
        </div>
      </div>
    `;
    updateLobbyCount();
  }

  function updateLobbyCount() {
    const el = container.querySelector('#lobby-count');
    if (!el) return;
    const n = match.playerCount ?? 0;
    el.textContent = `${n} player${n !== 1 ? 's' : ''} joined`;
  }

  // ── Playing ───────────────────────────────────────────────────────────────

  function renderPlaying() {
    const roundIdx = match.currentRound;
    if (submitted[roundIdx]) return renderWaiting();

    const round    = match.rounds[roundIdx];
    const cfg      = match.template.config;
    const roundDef = templateData.rounds[roundIdx];

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

    if (round.type === 'fill') {
      gameInstance = createFillGame({
        paragraph:    roundDef.paragraph,
        wordBankSize: roundDef.wordBankSize,
        onSubmit(answers, finished) {
          handleSubmit(roundIdx, round, roundDef, cfg, answers, finished);
        },
      });
    } else if (round.type === 'select') {
      gameInstance = createSelectGame({
        paragraph: roundDef.paragraph,
        choices:   roundDef.choices,
        onSubmit(answers, finished) {
          handleSubmit(roundIdx, round, roundDef, cfg, answers, finished);
        },
      });
    } else if (round.type === 'type') {
      gameInstance = createTypeGame({
        paragraph: roundDef.paragraph,
        onSubmit(answers, finished) {
          handleSubmit(roundIdx, round, roundDef, cfg, answers, finished);
        },
      });
    } else {
      // match round
      const pairs = (round.pairIndices ?? []).map(i => (roundDef.pairsPool ?? [])[i]);
      gameInstance = createMatchingGame({
        pairs,
        onSubmit(connections, finished) {
          handleSubmit(roundIdx, round, roundDef, cfg, connections, finished);
        },
      });
    }

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

  // ── Tick ──────────────────────────────────────────────────────────────────

  function tickRound() {
    if (submitted[match.currentRound]) return;
    clearTick();
    hideCd();
    const roundIdx = match.currentRound;
    const round    = match.rounds?.[roundIdx];
    if (!round?.startAt) return;

    const cfg       = match.template.config;
    const totalMs   = (round.seconds ?? cfg.minigameSeconds) * 1000;
    const cntdownMs = READY_COUNTDOWN_SECONDS * 1000;

    let rafId = null;
    let lastCdN = -1;

    function frame() {
      if (!currentView?.startsWith('playing') || submitted[roundIdx]) { clearTick(); return; }

      const now     = serverNow();
      const elapsed = now - round.startAt;
      const timerEl = container.querySelector('#game-timer');
      const barEl   = container.querySelector('#game-bar');
      if (!timerEl) { clearTick(); return; }

      if (elapsed < cntdownMs) {
        const n = Math.ceil((cntdownMs - elapsed) / 1000);
        if (n !== lastCdN) {
          lastCdN = n;
          timerEl.textContent = n;
          timerEl.className   = 'game-timer-num';
          if (barEl) barEl.style.width = '100%';
          showCd(n);
        }
      } else {
        if (lastCdN !== 0) { lastCdN = 0; hideCd(); }
        const gameArea = container.querySelector('#game-area');
        if (gameArea?.style.visibility) gameArea.style.visibility = '';
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

        if (gameInstance?.setProgress) {
          gameInstance.setProgress(1 - pct);
        }

        if (remaining === 0) {
          clearTick();
          if (!submitted[roundIdx]) gameInstance?.forceSubmit();
          return;
        }
      }

      rafId = requestAnimationFrame(frame);
    }

    // Store cancel handle in tickInterval slot so clearTick() works
    tickInterval = { _raf: null };
    rafId = requestAnimationFrame(frame);
    tickInterval._raf = () => { if (rafId) cancelAnimationFrame(rafId); };
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

  // ── Submit ────────────────────────────────────────────────────────────────

  async function handleSubmit(roundIdx, round, roundDef, cfg, submittedData, finished) {
    if (submitted[roundIdx]) return;
    submitted[roundIdx] = true;
    clearTick(); hideCd();

    const now         = serverNow();
    const gameStart   = round.startAt + READY_COUNTDOWN_SECONDS * 1000;
    const elapsed     = now - gameStart;
    const remainingMs = Math.max(0, cfg.minigameSeconds * 1000 - elapsed);

    let correctCount, totalItems, roundScore;

    if (round.type === 'fill' || round.type === 'select' || round.type === 'type') {
      const { answers } = parseParagraph(roundDef.paragraph);
      totalItems   = answers.length;
      correctCount = gradeFillRound(submittedData, answers);
      const normalized = totalItems > 0
        ? Math.round(correctCount / totalItems * FILL_SCORE_MAX)
        : 0;
      const timeBonus = computeTimeBonus(finished, remainingMs, cfg.minigameSeconds, cfg.bonusMax);
      roundScore = normalized + timeBonus;
    } else {
      // match
      totalItems   = 6;
      correctCount = gradeRound(submittedData);
      const timeBonus = computeTimeBonus(finished, remainingMs, cfg.minigameSeconds, cfg.bonusMax);
      roundScore = computeRoundScore(correctCount, timeBonus);
    }

    if (gameInstance) gameInstance.reveal();
    showRoundResult({ correctPairs: correctCount, score: roundScore, finished }, roundIdx, totalItems);

    try {
      const existing   = myPlayerData?.rounds || {};
      const allRounds  = { ...existing, [roundIdx]: { finished, correctPairs: correctCount, timeLeftMs: remainingMs, score: roundScore } };
      const totalScore = computeTotalScore(Object.values(allRounds));

      await update(ref(rtdb, `matchPlayers/${code}/${playerId}`), {
        [`rounds/${roundIdx}`]: {
          finished, correctPairs: correctCount, timeLeftMs: remainingMs, score: roundScore,
          submittedAt: serverTimestamp(),
        },
        totalScore,
      });
    } catch (err) { console.error('Save failed:', err); }
  }

  function showRoundResult(r, roundIdx, totalItems) {
    const timerRow = container.querySelector('.game-timer-row');
    if (!timerRow) return;
    const total  = totalItems ?? 6;
    const round  = match?.rounds?.[roundIdx];
    const isParagraphGame = round?.type === 'fill' || round?.type === 'select' || round?.type === 'type';
    const label  = isParagraphGame
      ? `${r.correctPairs ?? 0}/${total} blanks correct`
      : `${r.correctPairs ?? 0}/${total} correct`;
    const timeBonus = Math.max(0, (r.score ?? 0) - (r.correctPairs ?? 0));
    const bonusTxt  = r.finished
      ? `<span style="color:var(--primary)">${timeBonus >= 0 ? '+' : ''}${timeBonus}</span> bonus`
      : 'no bonus';
    timerRow.innerHTML = `
      <div class="game-score-summary">
        <span class="game-score-summary__pill">${label}</span>
        <span class="game-score-summary__stat">${bonusTxt}</span>
        <span class="game-score-summary__score">${r.score ?? 0} pts</span>
        <span class="game-score-summary__waiting">Waiting…</span>
      </div>
    `;
  }

  // ── Final / Podium ─────────────────────────────────────────────────────────

  function renderFinal() {
    clearTick();

    if (!finalPlayers) {
      if (!unsubFinal) {
        unsubFinal = onValue(ref(rtdb, `matchPlayers/${code}`), snap => {
          finalPlayers = Object.values(snap.val() || {});
          if (currentView === 'final') renderFinal();
        });
      }
      container.innerHTML = `<div class="loading-page"><div class="spinner"></div><span>Loading standings…</span></div>`;
      return;
    }

    const ranked   = rankPlayers(finalPlayers);
    const myData   = finalPlayers.find(p => p.nickname === nickname);
    const myRanked = ranked.find(p => p.nickname === nickname);

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
    container.querySelector('#pod-area').appendChild(createPodium(finalPlayers));
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  function clearTick() {
    if (tickInterval?._raf) tickInterval._raf();
    else if (tickInterval)  clearInterval(tickInterval);
    tickInterval = null;
    hideCd();
  }

  return () => {
    unsubMatch();
    if (unsubMyPlayer)   unsubMyPlayer();
    if (unsubFinal)      unsubFinal();
    if (unsubConnected)  unsubConnected();
    clearTick();
    document.querySelectorAll('.countdown-overlay').forEach(e => e.remove());
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
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
