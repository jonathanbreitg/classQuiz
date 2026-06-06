import { buildPodium } from '../lib/ranking.js';
import { PODIUM_REVEAL_SECONDS } from '../lib/constants.js';
import { icon } from '../lib/icons.js';

const MAX_HEIGHT_VH = 55; // 1st place step height in vh units — independent of parent chain

export function createPodium(players) {
  const podiumPlayers = buildPodium(players);

  const byRank = {};
  for (const p of podiumPlayers) {
    if (!byRank[p.rank]) byRank[p.rank] = [];
    byRank[p.rank].push(p);
  }

  const ranks = Object.keys(byRank).map(Number).sort((a, b) => a - b);
  const maxScore = Math.max(...podiumPlayers.map(p => p.totalScore), 1);

  const el = document.createElement('div');
  el.className = 'podium-wrap';

  const stage = document.createElement('div');
  stage.className = 'podium-stage';
  el.appendChild(stage);

  const columns = {};
  for (const rank of ranks) {
    if (rank > 3) continue;
    const isFirst = rank === 1;

    const col = document.createElement('div');
    col.className = isFirst ? 'podium-column podium-column--first' : 'podium-column';

    const playersEl = document.createElement('div');
    playersEl.className = 'podium-players';

    for (const p of byRank[rank]) {
      const nick = document.createElement('div');
      nick.className = 'podium-nickname';
      nick.textContent = p.nickname;
      playersEl.appendChild(nick);
    }

    const scoreEl = document.createElement('div');
    scoreEl.className = 'podium-score';
    const scores = byRank[rank].map(p => p.totalScore);
    scoreEl.textContent = [...new Set(scores)].join(' / ') + ' pts';
    playersEl.appendChild(scoreEl);

    const step = document.createElement('div');
    step.className = `podium-step podium-step--${rank}`;
    step.textContent = rank;

    // Height proportional to score — 1st place is always MAX_HEIGHT_PCT
    const rankScore = byRank[rank][0].totalScore;
    step.style.height = `${((rankScore / maxScore) * MAX_HEIGHT_VH).toFixed(1)}vh`;

    col.appendChild(playersEl);
    col.appendChild(step);
    stage.appendChild(col);
    columns[rank] = { col, playersEl, step };
  }

  const revealOrder = [...ranks].sort((a, b) => b - a);
  let i = 0;

  function revealNext() {
    if (i >= revealOrder.length) return;
    const rank = revealOrder[i++];
    const { playersEl, step } = columns[rank];
    step.classList.add('revealed');
    setTimeout(() => { playersEl.classList.add('revealed'); }, 200);
    if (i < revealOrder.length) setTimeout(revealNext, PODIUM_REVEAL_SECONDS * 1000);
  }

  setTimeout(revealNext, 600);

  return el;
}
