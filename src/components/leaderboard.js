import { rankPlayers } from '../lib/ranking.js';

export function createLeaderboard(players, { currentRound = null, gridMode = false } = {}) {
  const ranked = rankPlayers(players);
  const maxScore = ranked.reduce((m, p) => Math.max(m, p.totalScore), 1);

  const el = document.createElement('div');
  el.className = gridMode ? 'leaderboard leaderboard--grid' : 'leaderboard';

  if (ranked.length === 0) {
    el.innerHTML = '<p style="color:var(--text-3);text-align:center;padding:20px;">No players yet</p>';
    return el;
  }

  for (const p of ranked) {
    const row = document.createElement('div');
    row.className = 'lb-row';
    row.style.animationDelay = `${ranked.indexOf(p) * 0.05}s`;

    const barPct = maxScore > 0 ? (p.totalScore / maxScore) * 100 : 0;
    const chipClass = p.rank <= 3 ? ` lb-rankchip--${p.rank}` : '';

    const delta = currentRound !== null
      ? (p.rounds?.[currentRound]?.score ?? null)
      : null;
    const deltaHtml = delta !== null
      ? `<span class="lb-delta">+${delta}</span>`
      : '';

    row.innerHTML = `
      <div class="lb-bar" style="width:${barPct.toFixed(1)}%"></div>
      <span class="lb-rankchip${chipClass}">${p.rank}</span>
      <span class="lb-name">${escHtml(p.nickname)}</span>
      <span class="lb-score">${deltaHtml}${p.totalScore}<small>pts</small></span>
    `;
    el.appendChild(row);
  }

  return el;
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
