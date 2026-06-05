import { buildPodium } from '../lib/ranking.js';
import { PODIUM_REVEAL_SECONDS } from '../lib/constants.js';

const MEDALS = { 1: '🥇', 2: '🥈', 3: '🥉' };

// Returns a DOM element; starts the reveal animation automatically
export function createPodium(players) {
  const podiumPlayers = buildPodium(players);

  // Group by rank position
  const byRank = {};
  for (const p of podiumPlayers) {
    if (!byRank[p.rank]) byRank[p.rank] = [];
    byRank[p.rank].push(p);
  }

  const ranks = Object.keys(byRank).map(Number).sort((a, b) => a - b);

  const el = document.createElement('div');
  el.className = 'podium-wrap';

  const stage = document.createElement('div');
  stage.className = 'podium-stage';
  el.appendChild(stage);

  // Build columns for positions 1, 2, 3 (only those that exist)
  const columns = {};
  for (const rank of ranks) {
    if (rank > 3) continue;
    const col = document.createElement('div');
    col.className = 'podium-column';

    const playersEl = document.createElement('div');
    playersEl.className = 'podium-players';

    const medal = document.createElement('div');
    medal.className = 'podium-medal';
    medal.textContent = MEDALS[rank] ?? '';
    playersEl.appendChild(medal);

    for (const p of byRank[rank]) {
      const nick = document.createElement('div');
      nick.className = 'podium-nickname';
      nick.textContent = p.nickname;
      playersEl.appendChild(nick);
    }

    const score = document.createElement('div');
    score.className = 'podium-score';
    const scores = byRank[rank].map(p => p.totalScore);
    const uniqueScores = [...new Set(scores)];
    score.textContent = uniqueScores.join(' / ') + ' pts';
    playersEl.appendChild(score);

    const step = document.createElement('div');
    step.className = `podium-step podium-step--${rank}`;
    step.textContent = rank;

    col.appendChild(playersEl);
    col.appendChild(step);
    stage.appendChild(col);
    columns[rank] = { col, playersEl, step };
  }

  // Reveal bottom-up: highest rank # first (3rd, then 2nd, then 1st)
  const revealOrder = [...ranks].sort((a, b) => b - a);
  let i = 0;

  function revealNext() {
    if (i >= revealOrder.length) return;
    const rank = revealOrder[i++];
    const { playersEl, step } = columns[rank];
    step.classList.add('revealed');
    setTimeout(() => {
      playersEl.classList.add('revealed');
    }, 200);
    if (i < revealOrder.length) {
      setTimeout(revealNext, PODIUM_REVEAL_SECONDS * 1000);
    }
  }

  // Start after a short initial pause
  setTimeout(revealNext, 600);

  return el;
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
