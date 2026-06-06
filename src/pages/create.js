import { navigate } from '../router.js';
import { db } from '../firebase.js';
import { collection, addDoc, doc, getDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { MINIGAME_SECONDS, INTER_STAGE_SECONDS, BONUS_MAX } from '../lib/constants.js';

export async function mountEdit(container, templateId) {
  container.innerHTML = `<div class="loading-page"><div class="spinner"></div><span>Loading…</span></div>`;
  try {
    const snap = await getDoc(doc(db, 'templates', templateId));
    if (!snap.exists()) {
      container.innerHTML = `<div class="page error-page"><div class="icon">🔍</div><h2>Template not found</h2><button class="btn btn--secondary" id="h">Go home</button></div>`;
      container.querySelector('#h').addEventListener('click', () => navigate('/'));
      return;
    }
    const data = { id: snap.id, ...snap.data() };
    mountCreate(container, data);
  } catch (err) {
    console.error(err);
    container.innerHTML = `<div class="page error-page"><div class="icon">⚠️</div><h2>Failed to load</h2><button class="btn btn--secondary" id="h">Go home</button></div>`;
    container.querySelector('#h').addEventListener('click', () => navigate('/'));
  }
}

export function mountCreate(container, initialData = null) {
  const isEdit = !!initialData;

  let pairs = initialData?.pairsPool
    ? initialData.pairsPool.map(p => ({ word: p.word, definition: p.definition }))
    : [
        { word: '', definition: '' },
        { word: '', definition: '' },
        { word: '', definition: '' },
        { word: '', definition: '' },
        { word: '', definition: '' },
        { word: '', definition: '' },
      ];

  function render() {
    container.innerHTML = `
      <div class="page create-page">
        <div class="page-header">
          <button class="back-btn" id="back-btn">←</button>
          <h2>${isEdit ? 'Edit Template' : 'New Game Template'}</h2>
        </div>

        <div class="container">
          <div class="form-group">
            <label class="form-label" for="title">Title</label>
            <input id="title" class="input" type="text" maxlength="80" placeholder="e.g. Unit 3 Vocabulary" value="${escHtml(titleVal)}">
          </div>

          <div class="form-group">
            <label class="form-label" for="num-rounds">Number of rounds</label>
            <input id="num-rounds" class="input" type="number" min="1" max="20" value="${numRoundsVal}">
            <span class="form-hint">Each round uses 6 word/definition pairs drawn from your pool.</span>
          </div>

          <div class="divider"></div>

          <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:14px;">
            <h3>Word / Definition pairs</h3>
            <span class="badge">${pairs.length} pairs</span>
          </div>

          <div id="warn-banner" style="display:none;margin-bottom:14px;"></div>

          <div class="pairs-list" id="pairs-list">
            ${pairs.map((p, i) => renderPairRow(p, i)).join('')}
          </div>

          <button class="add-pair-btn" id="add-pair-btn" style="margin-top:12px;">
            + Add pair
          </button>

          <div class="divider"></div>

          <details style="margin-bottom:20px;">
            <summary style="cursor:pointer;font-weight:700;color:var(--text-2);font-size:0.9rem;padding:6px 0;">Advanced settings</summary>
            <div style="padding-top:16px;display:flex;flex-direction:column;gap:16px;">
              <div class="form-group" style="margin:0;">
                <label class="form-label" for="cfg-seconds">Seconds per round</label>
                <input id="cfg-seconds" class="input" type="number" min="5" max="120" value="${cfgSeconds}">
              </div>
              <div class="form-group" style="margin:0;">
                <label class="form-label" for="cfg-inter">Results screen seconds</label>
                <input id="cfg-inter" class="input" type="number" min="3" max="60" value="${cfgInter}">
              </div>
              <div class="form-group" style="margin:0;">
                <label class="form-label" for="cfg-bonus">Max time bonus per round</label>
                <input id="cfg-bonus" class="input" type="number" min="0" max="20" value="${cfgBonus}">
              </div>
            </div>
          </details>

          <div id="submit-error" style="display:none;" class="form-error" style="margin-bottom:12px;"></div>

          <button class="btn btn--primary btn--full btn--lg" id="submit-btn">
            ${isEdit ? 'Save changes →' : 'Save template →'}
          </button>

          <div style="height:40px;"></div>
        </div>
      </div>
    `;

    // Re-attach state values
    titleEl = container.querySelector('#title');
    numRoundsEl = container.querySelector('#num-rounds');
    cfgSecondsEl = container.querySelector('#cfg-seconds');
    cfgInterEl = container.querySelector('#cfg-inter');
    cfgBonusEl = container.querySelector('#cfg-bonus');

    titleEl.addEventListener('input', () => { titleVal = titleEl.value; });
    numRoundsEl.addEventListener('input', () => { numRoundsVal = parseInt(numRoundsEl.value) || 1; updateWarn(); });
    cfgSecondsEl.addEventListener('input', () => { cfgSeconds = parseInt(cfgSecondsEl.value) || MINIGAME_SECONDS; });
    cfgInterEl.addEventListener('input', () => { cfgInter = parseInt(cfgInterEl.value) || INTER_STAGE_SECONDS; });
    cfgBonusEl.addEventListener('input', () => { cfgBonus = parseInt(cfgBonusEl.value) || BONUS_MAX; });

    container.querySelector('#back-btn').addEventListener('click', () => navigate(isEdit ? `/t/${initialData.id}` : '/'));

    container.querySelectorAll('.pair-row').forEach((row, i) => {
      row.querySelector('.pair-word').addEventListener('input', e => { pairs[i].word = e.target.value; updateWarn(); });
      row.querySelector('.pair-def').addEventListener('input', e => { pairs[i].definition = e.target.value; updateWarn(); });
      row.querySelector('.pair-remove').addEventListener('click', () => {
        if (pairs.length <= 1) return;
        pairs.splice(i, 1);
        render();
      });
    });

    container.querySelector('#add-pair-btn').addEventListener('click', () => {
      pairs.push({ word: '', definition: '' });
      render();
      const rows = container.querySelectorAll('.pair-row');
      rows[rows.length - 1].querySelector('.pair-word').focus();
    });

    container.querySelector('#submit-btn').addEventListener('click', handleSubmit);

    updateWarn();
  }

  function renderPairRow(p, i) {
    return `
      <div class="pair-row">
        <input class="input pair-word" type="text" placeholder="Word" maxlength="100" value="${escHtml(p.word)}">
        <input class="input pair-def" type="text" placeholder="Definition" maxlength="200" value="${escHtml(p.definition)}">
        <button class="pair-remove" title="Remove pair">×</button>
      </div>
    `;
  }

  function updateWarn() {
    const banner = container.querySelector('#warn-banner');
    if (!banner) return;
    const needed = numRoundsVal * 6;
    const valid = pairs.filter(p => p.word.trim() && p.definition.trim()).length;
    if (valid > 0 && valid < needed) {
      banner.style.display = 'flex';
      banner.innerHTML = `
        <span>⚠️</span>
        <span>You have ${valid} valid pair${valid !== 1 ? 's' : ''} but ${numRoundsVal} round${numRoundsVal !== 1 ? 's' : ''} needs ${needed}. Later rounds will repeat pairs.</span>
      `;
      banner.className = 'warn-banner';
    } else {
      banner.style.display = 'none';
    }
  }

  async function handleSubmit() {
    const submitBtn = container.querySelector('#submit-btn');
    const errorEl = container.querySelector('#submit-error');

    titleVal = container.querySelector('#title').value.trim();
    numRoundsVal = parseInt(container.querySelector('#num-rounds').value) || 1;

    const validPairs = pairs.filter(p => p.word.trim() && p.definition.trim())
      .map(p => ({ word: p.word.trim(), definition: p.definition.trim() }));

    errorEl.style.display = 'none';

    if (!titleVal) { showError('Title is required.'); return; }
    if (numRoundsVal < 1) { showError('At least 1 round required.'); return; }
    if (validPairs.length < 6) { showError('At least 6 complete word/definition pairs are required.'); return; }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving…';

    try {
      const payload = {
        title: titleVal,
        numRounds: numRoundsVal,
        pairsPool: validPairs,
        config: {
          minigameSeconds: cfgSeconds,
          interStageSeconds: cfgInter,
          bonusMax: cfgBonus,
        },
      };

      let templateId;
      if (isEdit) {
        const { setDoc } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
        await setDoc(doc(db, 'templates', initialData.id), {
          ...payload,
          forkedFrom: initialData.forkedFrom ?? null,
          createdAt: initialData.createdAt,
          updatedAt: serverTimestamp(),
        });
        templateId = initialData.id;
      } else {
        const docRef = await addDoc(collection(db, 'templates'), {
          ...payload,
          forkedFrom: null,
          createdAt: serverTimestamp(),
        });
        templateId = docRef.id;
      }
      navigate(`/t/${templateId}`);
    } catch (err) {
      console.error(err);
      showError('Failed to save. Please check your connection.');
      submitBtn.disabled = false;
      submitBtn.textContent = isEdit ? 'Save changes →' : 'Save template →';
    }

    function showError(msg) {
      errorEl.textContent = msg;
      errorEl.style.display = 'block';
    }
  }

  // Mutable state persisted across re-renders
  let titleVal      = initialData?.title        ?? '';
  let numRoundsVal  = initialData?.numRounds    ?? 1;
  let cfgSeconds    = initialData?.config?.minigameSeconds  ?? MINIGAME_SECONDS;
  let cfgInter      = initialData?.config?.interStageSeconds ?? INTER_STAGE_SECONDS;
  let cfgBonus      = initialData?.config?.bonusMax         ?? BONUS_MAX;
  let titleEl, numRoundsEl, cfgSecondsEl, cfgInterEl, cfgBonusEl;

  render();
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
