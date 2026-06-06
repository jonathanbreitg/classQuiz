import { navigate } from '../router.js';
import { icon } from '../lib/icons.js';
import { db, rtdb } from '../firebase.js';
import {
  doc, getDoc, addDoc, collection, serverTimestamp as fsTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import {
  ref, get, set, serverTimestamp as rtdbTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';
import { generateUniqueCode } from '../lib/codeGen.js';
import { sampleRounds } from '../lib/poolSampling.js';
import { STALE_MATCH_HOURS } from '../lib/constants.js';

export async function mountTemplate(container, templateId) {
  showLoading(container);

  let template;
  try {
    const snap = await getDoc(doc(db, 'templates', templateId));
    if (!snap.exists()) return showNotFound(container);
    template = { id: snap.id, ...snap.data() };
  } catch (err) {
    console.error(err);
    return showError(container, 'Failed to load template.');
  }

  render(container, template);
}

function render(container, template) {
  const forkedNote = template.forkedFrom
    ? `<p class="forked-from">Forked from another template</p>`
    : '';

  container.innerHTML = `
    <div class="page template-page">
      <div class="template-card card card--elevated">
        <div class="template-card__title">${escHtml(template.title)}</div>
        <div class="template-meta">
          <span class="badge badge--primary">${template.numRounds} round${template.numRounds !== 1 ? 's' : ''}</span>
          <span class="badge">${template.pairsPool.length} pairs</span>
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

  container.querySelector('#fork-btn').addEventListener('click', async () => {
    const btn = container.querySelector('#fork-btn');
    btn.disabled = true;
    statusEl.textContent = 'Forking…';
    try {
      const docRef = await addDoc(collection(db, 'templates'), {
        title: template.title,
        numRounds: template.numRounds,
        pairsPool: template.pairsPool,
        config: template.config,
        forkedFrom: template.id,
        createdAt: fsTimestamp(),
      });
      navigate(`/t/${docRef.id}`);
    } catch (err) {
      console.error(err);
      statusEl.textContent = 'Fork failed. Try again.';
      btn.disabled = false;
    }
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

      const rounds = sampleRounds(template.pairsPool.length, template.numRounds)
        .map(pairIndices => ({ pairIndices, startAt: null }));

      const hostToken = crypto.randomUUID();
      localStorage.setItem(`hostToken_${code}`, hostToken);

      await set(ref(rtdb, `matches/${code}`), {
        templateId: template.id,
        template: {
          title: template.title,
          numRounds: template.numRounds,
          pairsPool: template.pairsPool,
          config: template.config,
        },
        hostToken,
        maxPlayers: 100,
        state: 'lobby',
        currentRound: -1,
        rounds,
        createdAt: rtdbTimestamp(),
        lastActiveAt: rtdbTimestamp(),
        players: {},
      });

      navigate(`/host/${code}`);
    } catch (err) {
      console.error(err);
      statusEl.textContent = 'Failed to start game. Try again.';
      btn.disabled = false;
    }
  });
}

async function pruneStaleMatches() {
  const threshold = Date.now() - STALE_MATCH_HOURS * 3600 * 1000;
  try {
    const snap = await get(ref(rtdb, 'matches'));
    if (!snap.exists()) return;
    const updates = {};
    snap.forEach(child => {
      const m = child.val();
      const lastActive = m.lastActiveAt || m.createdAt || 0;
      if (lastActive < threshold) updates[child.key] = null;
    });
    if (Object.keys(updates).length) {
      const { update } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js');
      await update(ref(rtdb, 'matches'), updates);
    }
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
      <button class="btn btn--secondary" onclick="navigate('/')">Go home</button>
    </div>
  `;
  container.querySelector('button').addEventListener('click', () => navigate('/'));
}

function showError(container, msg) {
  container.innerHTML = `
    <div class="page error-page">
      <div class="icon">⚠️</div>
      <h2>Something went wrong</h2>
      <p>${escHtml(msg)}</p>
      <button class="btn btn--secondary">Go home</button>
    </div>
  `;
  container.querySelector('button').addEventListener('click', () => navigate('/'));
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
