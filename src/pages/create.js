import { navigate } from '../router.js';
import { db } from '../firebase.js';
import { collection, addDoc, doc, getDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { MINIGAME_SECONDS, INTER_STAGE_SECONDS, BONUS_MAX, FILL_WORD_BANK_SIZE } from '../lib/constants.js';
import { normalizeTemplate } from '../lib/templateNormalize.js';
import { parseParagraph } from '../lib/fillParsing.js';

export async function mountEdit(container, templateId) {
  container.innerHTML = `<div class="loading-page"><div class="spinner"></div><span>Loading…</span></div>`;
  try {
    const snap = await getDoc(doc(db, 'templates', templateId));
    if (!snap.exists()) {
      container.innerHTML = `<div class="page error-page"><div class="icon">🔍</div><h2>Template not found</h2><button class="btn btn--secondary" id="h">Go home</button></div>`;
      container.querySelector('#h').addEventListener('click', () => navigate('/'));
      return;
    }
    mountCreate(container, { id: snap.id, ...snap.data() });
  } catch (err) {
    console.error(err);
    container.innerHTML = `<div class="page error-page"><div class="icon">⚠️</div><h2>Failed to load</h2><button class="btn btn--secondary" id="h">Go home</button></div>`;
    container.querySelector('#h').addEventListener('click', () => navigate('/'));
  }
}

export function mountCreate(container, initialData = null) {
  const isEdit = !!initialData;
  const norm   = initialData ? normalizeTemplate(initialData) : null;

  // ── Mutable top-level state ──────────────────────────────────────────────
  let titleVal     = norm?.title        ?? '';
  let cfgSeconds   = norm?.config?.minigameSeconds   ?? MINIGAME_SECONDS;
  let cfgInter     = norm?.config?.interStageSeconds ?? INTER_STAGE_SECONDS;
  let cfgBonus     = norm?.config?.bonusMax          ?? BONUS_MAX;

  // rounds: Array<MatchRound | FillRound>
  // MatchRound: { type:'match', pairs:[{word,definition}] }
  // FillRound:  { type:'fill', paragraph:string, blanksVisible:int, wordBankSize:int }
  let rounds = norm?.rounds
    ? norm.rounds.map(r => {
        if (r.type === 'fill') {
          return {
            type: 'fill',
            paragraph:    r.paragraph   ?? '',
            wordBankSize: r.wordBankSize ?? FILL_WORD_BANK_SIZE,
            seconds:      r.seconds     ?? MINIGAME_SECONDS,
          };
        }
        if (r.type === 'select') {
          return {
            type: 'select',
            paragraph: r.paragraph ?? '',
            choices:   choicesMapToArray(r.choices),
            seconds:   r.seconds   ?? MINIGAME_SECONDS,
          };
        }
        if (r.type === 'type') {
          return {
            type: 'type',
            paragraph: r.paragraph ?? '',
            seconds:   r.seconds   ?? MINIGAME_SECONDS,
          };
        }
        // match (or legacy match)
        return {
          type: 'match',
          pairs:   (r.pairsPool ?? []).map(p => ({ word: p.word, definition: p.definition })),
          seconds: r.seconds ?? MINIGAME_SECONDS,
        };
      })
    : [];

  function defaultMatchRound() {
    return {
      type: 'match',
      pairs:   Array.from({ length: 6 }, () => ({ word: '', definition: '' })),
      seconds: MINIGAME_SECONDS,
    };
  }
  function defaultFillRound() {
    return { type: 'fill', paragraph: '', wordBankSize: FILL_WORD_BANK_SIZE, seconds: MINIGAME_SECONDS };
  }
  function defaultSelectRound() {
    return { type: 'select', paragraph: '', choices: [], seconds: MINIGAME_SECONDS };
  }
  function defaultTypeRound() {
    return { type: 'type', paragraph: '', seconds: MINIGAME_SECONDS };
  }

  // ── Main render ───────────────────────────────────────────────────────────

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
            <input id="title" class="input" type="text" maxlength="80"
              placeholder="e.g. Unit 3 Vocabulary" value="${escHtml(titleVal)}">
          </div>

          <div class="divider"></div>

          <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:14px;">
            <h3>Rounds</h3>
            <span class="badge">${rounds.length} round${rounds.length !== 1 ? 's' : ''}</span>
          </div>

          <div id="rounds-list">
            ${rounds.length === 0
              ? `<p style="color:var(--text-3);text-align:center;padding:16px 0;">No rounds yet — add one below.</p>`
              : rounds.map((r, i) => renderRoundCard(r, i)).join('')}
          </div>

          <div class="add-round-row">
            <button class="btn btn--secondary add-round-btn" id="add-match-btn">+ Match</button>
            <button class="btn btn--secondary add-round-btn" id="add-fill-btn">+ Fill-in-blank</button>
            <button class="btn btn--secondary add-round-btn" id="add-select-btn">+ Select word</button>
            <button class="btn btn--secondary add-round-btn" id="add-type-btn">+ Type answer</button>
          </div>

          <div class="divider"></div>

          <details style="margin-bottom:20px;">
            <summary style="cursor:pointer;font-weight:700;color:var(--text-2);font-size:0.9rem;padding:6px 0;">Advanced settings</summary>
            <div style="padding-top:16px;display:flex;flex-direction:column;gap:16px;">
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

          <div id="submit-error" style="display:none;" class="form-error"></div>

          <button class="btn btn--primary btn--full btn--lg" id="submit-btn">
            ${isEdit ? 'Save fork →' : 'Save template →'}
          </button>
          <div style="height:40px;"></div>
        </div>
      </div>
    `;

    attachListeners();
  }

  // ── Per-round card HTML ───────────────────────────────────────────────────

  const ROUND_TYPE_LABELS = { fill: 'Fill-in-blank', select: 'Select word', type: 'Type answer', match: 'Match' };
  const ROUND_TYPE_BADGE  = { fill: 'info', select: 'info', type: 'info', match: 'primary' };

  function renderRoundCard(round, i) {
    const typeLabel  = ROUND_TYPE_LABELS[round.type] ?? 'Match';
    const badgeColor = ROUND_TYPE_BADGE[round.type]  ?? 'primary';
    const body = round.type === 'fill'   ? renderFillBody(round, i)
               : round.type === 'select' ? renderSelectBody(round, i)
               : round.type === 'type'   ? renderTypeBody(round, i)
               : renderMatchBody(round, i);
    return `
      <div class="round-card" data-round-idx="${i}">
        <div class="round-card__header">
          <span class="round-card__num">Round ${i + 1}</span>
          <span class="badge badge--${badgeColor}">${typeLabel}</span>
          <button class="round-card__del" data-del="${i}" title="Remove round">×</button>
        </div>
        <div class="round-card__body">
          ${body}
        </div>
      </div>
    `;
  }

  function renderSecondsField(round, ri) {
    return `
      <div class="form-group" style="margin-bottom:12px;">
        <label class="form-label" for="round-sec-${ri}">Duration (seconds)</label>
        <input id="round-sec-${ri}" class="input" type="number" min="5" max="300"
          value="${round.seconds ?? MINIGAME_SECONDS}" data-round-seconds="${ri}" style="max-width:120px;">
      </div>`;
  }

  function renderMatchBody(round, ri) {
    const rows = round.pairs.map((p, pi) => `
      <div class="pair-row" data-ri="${ri}" data-pi="${pi}">
        <input class="input pair-word"  type="text" placeholder="Word"       maxlength="100" value="${escHtml(p.word)}">
        <input class="input pair-def"   type="text" placeholder="Definition" maxlength="200" value="${escHtml(p.definition)}">
        <button class="pair-remove" data-ri="${ri}" data-pi="${pi}" title="Remove pair"
          ${round.pairs.length <= 1 ? 'disabled' : ''}>×</button>
      </div>`).join('');

    const valid = round.pairs.filter(p => p.word.trim() && p.definition.trim()).length;
    const warn  = valid > 0 && valid < 6
      ? `<div class="warn-banner"><span>⚠️</span><span>Need at least 6 complete pairs (have ${valid}).</span></div>`
      : '';

    return `
      ${renderSecondsField(round, ri)}
      <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:10px;">
        <span style="font-weight:700;font-size:.85rem;color:var(--text-2);">Word / Definition pairs</span>
        <span class="badge">${round.pairs.length} pairs</span>
      </div>
      ${warn}
      <div class="pairs-list" id="pairs-${ri}">${rows}</div>
      <button class="add-pair-btn" data-add-pair="${ri}" style="margin-top:10px;">+ Add pair</button>
    `;
  }

  function renderFillBody(round, ri) {
    const { answers } = parseParagraph(round.paragraph);
    const blankCount = answers.length;
    const preview = blankCount > 0
      ? `<span style="color:var(--success);">✓ ${blankCount} blank${blankCount !== 1 ? 's' : ''} found</span>`
      : round.paragraph.trim()
        ? `<span style="color:var(--warning);">No blanks found — wrap answers in [brackets], e.g. <em>He ate a [red] apple</em></span>`
        : '';

    return `
      ${renderSecondsField(round, ri)}
      <div class="form-group" style="margin-bottom:12px;">
        <label class="form-label">Paragraph</label>
        <span class="form-hint" style="display:block;margin-bottom:6px;">Wrap each missing word in [brackets] — e.g. He ate a [red] apple.</span>
        <textarea id="fill-para-${ri}" class="input fill-para-input" rows="5"
          placeholder="He ate a [red] apple and a [green] salad."
          data-fill-para="${ri}">${escHtml(round.paragraph)}</textarea>
        <div id="fill-preview-${ri}" class="form-hint" style="margin-top:4px;">${preview}</div>
      </div>
      <div class="form-group" style="margin:0;">
        <label class="form-label" for="fill-wb-${ri}">Words in bank</label>
        <input id="fill-wb-${ri}" class="input" type="number" min="1" max="20"
          value="${round.wordBankSize}" data-fill-wb="${ri}" style="max-width:120px;">
      </div>
    `;
  }

  function renderSelectBody(round, ri) {
    const { answers } = parseParagraph(round.paragraph);
    // Grow choices array to match blank count (never truncate — save does that)
    while (round.choices.length < answers.length) {
      round.choices.push([answers[round.choices.length]]);
    }

    const blankCount = answers.length;
    const preview = blankCount > 0
      ? `<span style="color:var(--success);">✓ ${blankCount} blank${blankCount !== 1 ? 's' : ''} found</span>`
      : round.paragraph.trim()
        ? `<span style="color:var(--warning);">No blanks found — wrap answers in [brackets]</span>`
        : '';

    return `
      ${renderSecondsField(round, ri)}
      <div class="form-group" style="margin-bottom:12px;">
        <label class="form-label">Paragraph</label>
        <span class="form-hint" style="display:block;margin-bottom:6px;">Wrap each missing word in [brackets] — e.g. She [ran] to the store.</span>
        <textarea class="input fill-para-input" rows="5"
          placeholder="She [ran] to the store."
          data-select-para="${ri}">${escHtml(round.paragraph)}</textarea>
        <div id="select-preview-${ri}" class="form-hint" style="margin-top:4px;">${preview}</div>
      </div>
      <div class="form-group" id="select-choices-section-${ri}" style="${blankCount > 0 ? '' : 'display:none;'}">
        <label class="form-label">Choices per blank</label>
        <span class="form-hint" style="display:block;margin-bottom:8px;">For each blank, type all choices separated by commas — include the correct answer. The game will shuffle them. Example: <em>ran, walked, flew</em></span>
        <div id="select-choices-wrap-${ri}">
          ${renderSelectChoicesInner(round, ri, answers)}
        </div>
      </div>
    `;
  }

  function renderSelectChoicesInner(round, ri, answers) {
    return answers.map((ans, bi) => {
      const choiceStr = (round.choices[bi] ?? [ans]).join(', ');
      return `
        <div class="form-group" style="margin-bottom:8px;">
          <label class="form-label" style="font-size:0.82rem;">
            Blank ${bi + 1} — correct: <strong>${escHtml(ans)}</strong>
          </label>
          <input class="input" type="text"
            data-select-choices="${ri}" data-blank-idx="${bi}"
            value="${escHtml(choiceStr)}"
            placeholder="${escHtml(ans)}, wrong1, wrong2">
        </div>
      `;
    }).join('');
  }

  function renderTypeBody(round, ri) {
    const { answers } = parseParagraph(round.paragraph);
    const blankCount = answers.length;
    const preview = blankCount > 0
      ? `<span style="color:var(--success);">✓ ${blankCount} blank${blankCount !== 1 ? 's' : ''} found</span>`
      : round.paragraph.trim()
        ? `<span style="color:var(--warning);">No blanks found — wrap answers in [brackets]</span>`
        : '';

    return `
      ${renderSecondsField(round, ri)}
      <div class="form-group" style="margin-bottom:12px;">
        <label class="form-label">Paragraph</label>
        <span class="form-hint" style="display:block;margin-bottom:6px;">Wrap each missing word in [brackets] — e.g. She [ran] to the store.</span>
        <textarea class="input fill-para-input" rows="5"
          placeholder="She [ran] to the store."
          data-type-para="${ri}">${escHtml(round.paragraph)}</textarea>
        <div id="type-preview-${ri}" class="form-hint" style="margin-top:4px;">${preview}</div>
      </div>
    `;
  }

  // ── Event listeners ───────────────────────────────────────────────────────

  function attachListeners() {
    const titleEl = container.querySelector('#title');
    titleEl.addEventListener('input', () => { titleVal = titleEl.value; });

    container.querySelector('#back-btn').addEventListener('click',
      () => navigate(isEdit ? `/t/${initialData.id}` : '/'));

    container.querySelector('#cfg-inter').addEventListener('input', e => {
      cfgInter = parseInt(e.target.value) || INTER_STAGE_SECONDS;
    });
    container.querySelector('#cfg-bonus').addEventListener('input', e => {
      cfgBonus = parseInt(e.target.value) || BONUS_MAX;
    });

    function addRoundAndScroll(round) {
      rounds.push(round);
      render();
      const cards = container.querySelectorAll('.round-card');
      cards[cards.length - 1]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    container.querySelector('#add-match-btn').addEventListener('click', () => addRoundAndScroll(defaultMatchRound()));
    container.querySelector('#add-fill-btn').addEventListener('click', () => addRoundAndScroll(defaultFillRound()));
    container.querySelector('#add-select-btn').addEventListener('click', () => addRoundAndScroll(defaultSelectRound()));
    container.querySelector('#add-type-btn').addEventListener('click', () => addRoundAndScroll(defaultTypeRound()));

    // Delete round
    container.querySelectorAll('.round-card__del').forEach(btn => {
      btn.addEventListener('click', () => {
        const i = Number(btn.dataset.del);
        rounds.splice(i, 1);
        render();
      });
    });

    // Match round: pair inputs
    container.querySelectorAll('.pair-row').forEach(row => {
      const ri = Number(row.dataset.ri);
      const pi = Number(row.dataset.pi);
      row.querySelector('.pair-word').addEventListener('input', e => {
        rounds[ri].pairs[pi].word = e.target.value;
        updateMatchWarning(ri);
      });
      row.querySelector('.pair-def').addEventListener('input', e => {
        rounds[ri].pairs[pi].definition = e.target.value;
        updateMatchWarning(ri);
      });
      row.querySelector('.pair-remove').addEventListener('click', () => {
        if (rounds[ri].pairs.length <= 1) return;
        rounds[ri].pairs.splice(pi, 1);
        render();
      });
    });

    // Match round: add pair buttons
    container.querySelectorAll('[data-add-pair]').forEach(btn => {
      btn.addEventListener('click', () => {
        const ri = Number(btn.dataset.addPair);
        rounds[ri].pairs.push({ word: '', definition: '' });
        render();
        const pairsEl = container.querySelector(`#pairs-${ri}`);
        pairsEl?.querySelectorAll('.pair-row').at(-1)?.querySelector('.pair-word')?.focus();
      });
    });

    // Fill round: paragraph textarea
    container.querySelectorAll('[data-fill-para]').forEach(ta => {
      const ri = Number(ta.dataset.fillPara);
      ta.addEventListener('input', () => {
        rounds[ri].paragraph = ta.value;
        updateFillPreview(ri);
      });
    });

    // Fill round: wordBankSize
    container.querySelectorAll('[data-fill-wb]').forEach(inp => {
      inp.addEventListener('input', () => {
        const ri = Number(inp.dataset.fillWb);
        rounds[ri].wordBankSize = Math.max(1, parseInt(inp.value) || FILL_WORD_BANK_SIZE);
      });
    });

    // Select round: paragraph textarea
    container.querySelectorAll('[data-select-para]').forEach(ta => {
      const ri = Number(ta.dataset.selectPara);
      ta.addEventListener('input', () => {
        rounds[ri].paragraph = ta.value;
        updateSelectPreviewAndChoices(ri);
      });
    });

    // Select round: choices inputs (delegated — wrap repopulates on para change)
    container.querySelectorAll('[id^="select-choices-wrap-"]').forEach(wrap => {
      const ri = Number(wrap.id.replace('select-choices-wrap-', ''));
      wrap.addEventListener('input', e => {
        const inp = e.target.closest('[data-select-choices]');
        if (!inp) return;
        const bi = Number(inp.dataset.blankIdx);
        rounds[ri].choices[bi] = inp.value.split(',').map(s => s.trim()).filter(Boolean);
      });
    });

    // Type round: paragraph textarea
    container.querySelectorAll('[data-type-para]').forEach(ta => {
      const ri = Number(ta.dataset.typePara);
      ta.addEventListener('input', () => {
        rounds[ri].paragraph = ta.value;
        updateTypePreview(ri);
      });
    });

    // Per-round seconds
    container.querySelectorAll('[data-round-seconds]').forEach(inp => {
      inp.addEventListener('input', () => {
        const ri = Number(inp.dataset.roundSeconds);
        rounds[ri].seconds = Math.max(5, parseInt(inp.value) || MINIGAME_SECONDS);
      });
    });

    container.querySelector('#submit-btn').addEventListener('click', handleSubmit);
  }

  function updateMatchWarning(ri) {
    const valid = rounds[ri].pairs.filter(p => p.word.trim() && p.definition.trim()).length;
    const card  = container.querySelector(`.round-card[data-round-idx="${ri}"]`);
    if (!card) return;
    let warn = card.querySelector('.warn-banner');
    if (valid > 0 && valid < 6) {
      if (!warn) {
        warn = document.createElement('div');
        warn.className = 'warn-banner';
        card.querySelector('.pairs-list')?.before(warn);
      }
      warn.innerHTML = `<span>⚠️</span><span>Need at least 6 complete pairs (have ${valid}).</span>`;
    } else if (warn) {
      warn.remove();
    }
  }

  function updateFillPreview(ri) {
    const previewEl = container.querySelector(`#fill-preview-${ri}`);
    if (!previewEl) return;
    const { answers } = parseParagraph(rounds[ri].paragraph);
    const n = answers.length;
    if (n > 0) {
      previewEl.innerHTML = `<span style="color:var(--success);">✓ ${n} blank${n !== 1 ? 's' : ''} found</span>`;
    } else if (rounds[ri].paragraph.trim()) {
      previewEl.innerHTML = `<span style="color:var(--warning);">No blanks found — use [brackets] around answers</span>`;
    } else {
      previewEl.textContent = '';
    }
  }

  function updateSelectPreviewAndChoices(ri) {
    const previewEl  = container.querySelector(`#select-preview-${ri}`);
    const sectionEl  = container.querySelector(`#select-choices-section-${ri}`);
    const wrapEl     = container.querySelector(`#select-choices-wrap-${ri}`);
    const round      = rounds[ri];
    const { answers } = parseParagraph(round.paragraph);
    const n = answers.length;

    if (previewEl) {
      if (n > 0) {
        previewEl.innerHTML = `<span style="color:var(--success);">✓ ${n} blank${n !== 1 ? 's' : ''} found</span>`;
      } else if (round.paragraph.trim()) {
        previewEl.innerHTML = `<span style="color:var(--warning);">No blanks found — use [brackets] around answers</span>`;
      } else {
        previewEl.textContent = '';
      }
    }

    if (!sectionEl || !wrapEl) return;

    // Grow choices array to match blank count
    while (round.choices.length < n) {
      round.choices.push([answers[round.choices.length]]);
    }

    if (n > 0) {
      sectionEl.style.display = '';
      wrapEl.innerHTML = renderSelectChoicesInner(round, ri, answers);
    } else {
      sectionEl.style.display = 'none';
      wrapEl.innerHTML = '';
    }
  }

  function updateTypePreview(ri) {
    const previewEl = container.querySelector(`#type-preview-${ri}`);
    if (!previewEl) return;
    const { answers } = parseParagraph(rounds[ri].paragraph);
    const n = answers.length;
    if (n > 0) {
      previewEl.innerHTML = `<span style="color:var(--success);">✓ ${n} blank${n !== 1 ? 's' : ''} found</span>`;
    } else if (rounds[ri].paragraph.trim()) {
      previewEl.innerHTML = `<span style="color:var(--warning);">No blanks found — use [brackets] around answers</span>`;
    } else {
      previewEl.textContent = '';
    }
  }

  // ── Validation & submit ───────────────────────────────────────────────────

  async function handleSubmit() {
    const submitBtn = container.querySelector('#submit-btn');
    const errorEl   = container.querySelector('#submit-error');

    titleVal = container.querySelector('#title').value.trim();
    errorEl.style.display = 'none';

    if (!titleVal) { showError('Title is required.'); return; }
    if (rounds.length < 1) { showError('Add at least one round using the buttons above.'); return; }

    for (let i = 0; i < rounds.length; i++) {
      const r = rounds[i];
      if (r.type === 'match') {
        const valid = r.pairs.filter(p => p.word.trim() && p.definition.trim());
        if (valid.length < 6) {
          showError(`Round ${i + 1} (Match) needs at least 6 complete word/definition pairs.`);
          return;
        }
      } else if (r.type === 'fill') {
        if (!r.paragraph.trim()) {
          showError(`Round ${i + 1} (Fill-in-blank) has no paragraph.`);
          return;
        }
        const { answers } = parseParagraph(r.paragraph);
        if (answers.length < 1) {
          showError(`Round ${i + 1} (Fill-in-blank) has no blanks. Wrap answers in [brackets].`);
          return;
        }
      } else if (r.type === 'select') {
        if (!r.paragraph.trim()) {
          showError(`Round ${i + 1} (Select word) has no paragraph.`);
          return;
        }
        const { answers } = parseParagraph(r.paragraph);
        if (answers.length < 1) {
          showError(`Round ${i + 1} (Select word) has no blanks. Wrap answers in [brackets].`);
          return;
        }
        for (let bi = 0; bi < answers.length; bi++) {
          const ch = r.choices[bi] ?? [];
          if (ch.filter(c => c.trim()).length < 2) {
            showError(`Round ${i + 1} (Select word): Blank ${bi + 1} needs at least 2 choices.`);
            return;
          }
        }
      } else if (r.type === 'type') {
        if (!r.paragraph.trim()) {
          showError(`Round ${i + 1} (Type answer) has no paragraph.`);
          return;
        }
        const { answers } = parseParagraph(r.paragraph);
        if (answers.length < 1) {
          showError(`Round ${i + 1} (Type answer) has no blanks. Wrap answers in [brackets].`);
          return;
        }
      }
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving…';

    try {
      const firestoreRounds = rounds.map(r => {
        if (r.type === 'fill') {
          return {
            type: 'fill',
            paragraph:    r.paragraph,
            wordBankSize: r.wordBankSize,
            seconds:      r.seconds,
          };
        }
        if (r.type === 'select') {
          const { answers } = parseParagraph(r.paragraph);
          // Store as a map {idx: string[]} — Firestore does not support nested arrays
          const choices = {};
          answers.forEach((ans, bi) => {
            const ch = (r.choices[bi] ?? [ans]).filter(c => c.trim());
            if (!ch.map(c => c.toLowerCase()).includes(ans.toLowerCase())) ch.unshift(ans);
            choices[bi] = ch;
          });
          return { type: 'select', paragraph: r.paragraph, choices, seconds: r.seconds };
        }
        if (r.type === 'type') {
          return { type: 'type', paragraph: r.paragraph, seconds: r.seconds };
        }
        return {
          type: 'match',
          seconds: r.seconds,
          pairsPool: r.pairs
            .filter(p => p.word.trim() && p.definition.trim())
            .map(p => ({ word: p.word.trim(), definition: p.definition.trim() })),
        };
      });

      const payload = {
        title:  titleVal,
        rounds: firestoreRounds,
        config: { minigameSeconds: cfgSeconds, interStageSeconds: cfgInter, bonusMax: cfgBonus },
      };

      // Always create a new document — templates are immutable once published.
      // When editing a fork, forkedFrom tracks the original source template.
      const docRef = await addDoc(collection(db, 'templates'), {
        ...payload,
        forkedFrom: initialData?.id ?? null,
        createdAt:  serverTimestamp(),
      });
      navigate(`/t/${docRef.id}`);
    } catch (err) {
      console.error(err);
      showError('Failed to save. Please check your connection.');
      submitBtn.disabled = false;
      submitBtn.textContent = isEdit ? 'Save fork →' : 'Save template →';
    }

    function showError(msg) {
      errorEl.textContent = msg;
      errorEl.style.display = 'block';
    }
  }

  render();
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Firestore stores choices as {idx: string[]} map; convert to array for in-memory use.
function choicesMapToArray(choices) {
  if (!choices) return [];
  if (Array.isArray(choices)) return choices;
  const arr = [];
  for (const [k, v] of Object.entries(choices)) arr[Number(k)] = v;
  return arr;
}
