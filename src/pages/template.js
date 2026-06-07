import { navigate } from '../router.js';
import { icon } from '../lib/icons.js';
import { db, rtdb } from '../firebase.js';
import {
  doc, getDoc,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import {
  ref, get, set, update, serverTimestamp as rtdbTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';
import { generateUniqueCode, randomUUID } from '../lib/codeGen.js';
import { sampleRounds } from '../lib/poolSampling.js';
import { buildRtdbRounds } from '../lib/buildRtdbRounds.js';
import { STALE_MATCH_HOURS } from '../lib/constants.js';
import { findStaleCodes } from '../lib/pruning.js';
import { normalizeTemplate } from '../lib/templateNormalize.js';

export async function mountTemplate(container, templateId) {
  showLoading(container);

  let template;
  try {
    const snap = await getDoc(doc(db, 'templates', templateId));
    if (!snap.exists()) return showNotFound(container);
    template = normalizeTemplate({ id: snap.id, ...snap.data() });
  } catch (err) {
    console.error(err);
    return showError(container, 'Failed to load template.');
  }

  render(container, template);
}

function roundTypeSummary(rounds) {
  const counts = { match: 0, fill: 0, select: 0, type: 0, shuffle: 0, choice: 0 };
  for (const r of rounds) if (r.type in counts) counts[r.type]++;
  const labels = [
    counts.match   && `${counts.match} match`,
    counts.fill    && `${counts.fill} fill-in-blank`,
    counts.select  && `${counts.select} select-word`,
    counts.type    && `${counts.type} type-answer`,
    counts.shuffle && `${counts.shuffle} word-shuffle`,
    counts.choice  && `${counts.choice} multiple-choice`,
  ].filter(Boolean);
  return labels.join(', ');
}

function render(container, template) {
  const numRounds = template.rounds.length;
  const forkedNote = template.forkedFrom
    ? `<p class="forked-from">Forked from another template</p>` : '';

  container.innerHTML = `
    <div class="page template-page">
      <div class="template-card card card--elevated">
        <div class="template-card__title">${escHtml(template.title)}</div>
        <div class="template-meta">
          <span class="badge badge--primary">${numRounds} round${numRounds !== 1 ? 's' : ''}</span>
          <span class="badge">${roundTypeSummary(template.rounds)}</span>
        </div>
        ${forkedNote}
      </div>

      <div class="template-actions">
        <button class="btn btn--primary btn--full btn--lg" id="start-btn">▶ Start a game</button>
        <button class="btn btn--secondary btn--full" id="fork-btn">${icon('fork')} Fork &amp; edit</button>
        <button class="btn btn--secondary btn--full" id="home-btn">← Home</button>
      </div>

      <div id="action-status" style="min-height:24px;text-align:center;color:var(--text-2);font-size:0.9rem;font-weight:600;"></div>
    </div>
  `;

  const statusEl = container.querySelector('#action-status');

  container.querySelector('#home-btn').addEventListener('click', () => navigate('/'));

  container.querySelector('#fork-btn').addEventListener('click', () => {
    // Navigate to the edit page pre-filled with this template's data.
    // Saving from there always creates a new document — the original stays immutable.
    navigate(`/edit/${template.id}`);
  });

  container.querySelector('#start-btn').addEventListener('click', async () => {
    const btn = container.querySelector('#start-btn');
    btn.disabled = true;
    statusEl.textContent = 'Setting up game…';

    try {
      await pruneStaleMatches();

      const code = await generateUniqueCode(async c => {
        const snap = await get(ref(rtdb, `matches/${c}/state`));
        return snap.exists() && snap.val() !== 'finished';
      });

      const rtdbRounds = buildRtdbRounds(template.rounds);

      const hostToken = randomUUID();
      localStorage.setItem(`hostToken_${code}`, hostToken);

      const createdAt = rtdbTimestamp();

      await set(ref(rtdb, `matches/${code}`), {
        templateId: template.id,
        template: {
          title:     template.title,
          numRounds: template.rounds.length,
          config:    template.config,
        },
        hostToken,
        maxPlayers: 100,
        playerCount: 0,
        state: 'lobby',
        currentRound: -1,
        rounds: rtdbRounds,
        createdAt,
        lastActiveAt: createdAt,
      });

      await set(ref(rtdb, `matchMeta/${code}`), { createdAt });

      navigate(`/host/${code}`);
    } catch (err) {
      console.error(err);
      statusEl.textContent = 'Failed to start game. Try again.';
      btn.disabled = false;
    }
  });
}

async function pruneStaleMatches() {
  const staleMs = STALE_MATCH_HOURS * 3600 * 1000;
  try {
    const snap = await get(ref(rtdb, 'matchMeta'));
    if (!snap.exists()) return;
    const staleCodes = findStaleCodes(snap.val(), Date.now(), staleMs);
    if (!staleCodes.length) return;
    const updates = {};
    for (const code of staleCodes) {
      updates[`matches/${code}`]      = null;
      updates[`matchPlayers/${code}`] = null;
      updates[`matchMeta/${code}`]    = null;
    }
    await update(ref(rtdb, '/'), updates);
  } catch { /* best-effort */ }
}

function showLoading(container) {
  container.innerHTML = `<div class="loading-page"><div class="spinner"></div><span>Loading…</span></div>`;
}

function showNotFound(container) {
  container.innerHTML = `
    <div class="page error-page">
      <div class="icon">🔍</div>
      <h2>Template not found</h2>
      <p>This link may be invalid or the template was removed.</p>
      <button class="btn btn--secondary" id="h">Go home</button>
    </div>`;
  container.querySelector('#h').addEventListener('click', () => navigate('/'));
}

function showError(container, msg) {
  container.innerHTML = `
    <div class="page error-page">
      <div class="icon">⚠️</div>
      <h2>Something went wrong</h2>
      <p>${escHtml(msg)}</p>
      <button class="btn btn--secondary" id="h">Go home</button>
    </div>`;
  container.querySelector('#h').addEventListener('click', () => navigate('/'));
}

function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
