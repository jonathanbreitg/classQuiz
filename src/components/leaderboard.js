import { rankPlayers } from '../lib/ranking.js';

// Returns a DOM element showing a ranked leaderboard
export function createLeaderboard(players) {
  const ranked = rankPlayers(players);
  const el = document.createElement('div');
  el.className = 'leaderboard';

  if (ranked.length === 0) {
    el.innerHTML = '<p style="color:var(--text-3);text-align:center;padding:20px;">No players yet</p>';
    return el;
  }

  for (const p of ranked) {
    const row = document.createElement('div');
    row.className = 'lb-row';
    row.style.animationDelay = `${ranked.indexOf(p) * 0.05}s`;

    const rankDisplay = p.rank <= 3
      ? ['🥇', '🥈', '🥉'][p.rank - 1]
      : `#${p.rank}`;

    row.innerHTML = `
      <span class="lb-rank lb-rank--${p.rank}">${rankDisplay}</span>
      <span class="lb-name">${escHtml(p.nickname)}</span>
      <span class="lb-score">${p.totalScore}</span>
    `;
    el.appendChild(row);
  }

  return el;
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
