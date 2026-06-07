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
        if (r.type === 'shuffle') {
          return {
            type:     'shuffle',
            imageUrl: r.imageUrl  ?? '',
            sentence: r.sentence  ?? '',
            seconds:  r.seconds   ?? MINIGAME_SECONDS,
          };
        }
        if (r.type === 'choice') {
          return {
            type:     'choice',
            question: r.question  ?? '',
            answers:  (r.answers ?? []).map(a => ({ text: a.text ?? '', correct: !!a.correct })),
            seconds:  r.seconds   ?? MINIGAME_SECONDS,
          };
        }
        if (r.type === 'correct') {
          return {
            type:       'correct',
            sentence:   r.sentence   ?? '',
            wrongIndex: r.wrongIndex ?? 0,
            correction: r.correction ?? '',
            seconds:    r.seconds    ?? MINIGAME_SECONDS,
          };
        }
        if (r.type === 'order') {
          return {
            type:      'order',
            sentences: (r.sentences ?? []).map(s => s ?? ''),
            seconds:   r.seconds ?? MINIGAME_SECONDS,
          };
        }
        if (r.type === 'connections') {
          return {
            type:    'connections',
            groups:  (r.groups ?? []).map(g => ({
              label: g.label ?? '',
              words: (g.words ?? ['', '', '', '']).map(w => w ?? ''),
            })),
            seconds: r.seconds ?? 60,
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
  function defaultShuffleRound() {
    return { type: 'shuffle', imageUrl: '', sentence: '', seconds: MINIGAME_SECONDS };
  }
  function defaultChoiceRound() {
    return {
      type:     'choice',
      question: '',
      answers:  [
        { text: '', correct: false },
        { text: '', correct: false },
        { text: '', correct: false },
        { text: '', correct: false },
      ],
      seconds: MINIGAME_SECONDS,
    };
  }
  function defaultCorrectRound() {
    return { type: 'correct', sentence: '', wrongIndex: 0, correction: '', seconds: MINIGAME_SECONDS };
  }
  function defaultOrderRound() {
    return { type: 'order', sentences: ['', '', '', ''], seconds: MINIGAME_SECONDS };
  }
  function defaultConnectionsRound() {
    return {
      type: 'connections',
      groups: [
        { label: '', words: ['', '', '', ''] },
        { label: '', words: ['', '', '', ''] },
        { label: '', words: ['', '', '', ''] },
      ],
      seconds: 60,
    };
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
            <button class="btn btn--secondary add-round-btn" id="add-shuffle-btn">+ Word shuffle</button>
            <button class="btn btn--secondary add-round-btn" id="add-choice-btn">+ Multiple choice</button>
            <button class="btn btn--secondary add-round-btn" id="add-correct-btn">+ Correct mistake</button>
            <button class="btn btn--secondary add-round-btn" id="add-order-btn">+ Sentence order</button>
            <button class="btn btn--secondary add-round-btn" id="add-connections-btn">+ Connections</button>
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

  const ROUND_TYPE_LABELS = { fill: 'Fill-in-blank', select: 'Select word', type: 'Type answer', match: 'Match', shuffle: 'Word shuffle', choice: 'Multiple choice', correct: 'Correct the Mistake', order: 'Sentence Order', connections: 'Connections' };
  const ROUND_TYPE_BADGE  = { fill: 'info', select: 'info', type: 'info', match: 'primary', shuffle: 'info', choice: 'info', correct: 'info', order: 'info', connections: 'info' };

  function renderRoundCard(round, i) {
    const typeLabel  = ROUND_TYPE_LABELS[round.type] ?? 'Match';
    const badgeColor = ROUND_TYPE_BADGE[round.type]  ?? 'primary';
    const body = round.type === 'fill'        ? renderFillBody(round, i)
               : round.type === 'select'      ? renderSelectBody(round, i)
               : round.type === 'type'        ? renderTypeBody(round, i)
               : round.type === 'shuffle'     ? renderShuffleBody(round, i)
               : round.type === 'choice'      ? renderChoiceBody(round, i)
               : round.type === 'correct'     ? renderCorrectBody(round, i)
               : round.type === 'order'       ? renderOrderBody(round, i)
               : round.type === 'connections' ? renderConnectionsBody(round, i)
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

  function renderShuffleBody(round, ri) {
    const wordCount = round.sentence.trim() ? round.sentence.trim().split(/\s+/).length : 0;
    const preview = wordCount > 0
      ? `<span style="color:var(--success);">✓ ${wordCount} word${wordCount !== 1 ? 's' : ''}</span>`
      : '';

    return `
      ${renderSecondsField(round, ri)}
      <div class="form-group" style="margin-bottom:12px;">
        <label class="form-label" for="shuffle-img-${ri}">Image URL</label>
        <span class="form-hint" style="display:block;margin-bottom:6px;">Shown on the host screen while players rearrange the words.</span>
        <input id="shuffle-img-${ri}" class="input" type="url"
          placeholder="https://example.com/image.jpg"
          data-shuffle-img="${ri}" value="${escHtml(round.imageUrl)}">
      </div>
      <div class="form-group" style="margin:0;">
        <label class="form-label" for="shuffle-sentence-${ri}">Sentence</label>
        <span class="form-hint" style="display:block;margin-bottom:6px;">Words will be shuffled for the player to reorder.</span>
        <input id="shuffle-sentence-${ri}" class="input" type="text"
          placeholder="The cat sat on the mat"
          maxlength="300"
          data-shuffle-sentence="${ri}" value="${escHtml(round.sentence)}">
        <div id="shuffle-preview-${ri}" class="form-hint" style="margin-top:4px;">${preview}</div>
      </div>
    `;
  }

  function renderChoiceBody(round, ri) {
    const COLORS  = ['#ff5f5f', '#5ba4ff', '#ffd93d', '#51cf66'];
    const LETTERS = ['A', 'B', 'C', 'D'];
    const ansRows = round.answers.map((a, ai) => `
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">
        <span style="width:22px;height:22px;border-radius:50%;background:${COLORS[ai]};flex-shrink:0;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:0.7rem;color:${ai >= 2 ? '#1a1a2e' : '#fff'};">${LETTERS[ai]}</span>
        <input class="input" type="text" placeholder="Answer ${LETTERS[ai]}"
          maxlength="200" value="${escHtml(a.text)}"
          data-choice-answer="${ri}" data-answer-idx="${ai}"
          style="flex:1;">
        <label style="display:flex;align-items:center;gap:6px;white-space:nowrap;cursor:pointer;flex-shrink:0;">
          <input type="checkbox" data-choice-correct="${ri}" data-answer-idx="${ai}"
            ${a.correct ? 'checked' : ''} style="width:16px;height:16px;cursor:pointer;">
          <span style="font-size:0.8rem;font-weight:700;color:var(--text-2);">Correct</span>
        </label>
      </div>`).join('');

    const correctCount = round.answers.filter(a => a.correct).length;
    const warn = round.answers.some(a => a.text.trim()) && correctCount === 0
      ? `<div class="warn-banner" id="choice-warn-${ri}"><span>⚠️</span><span>Mark at least one answer as correct.</span></div>`
      : `<div id="choice-warn-${ri}"></div>`;

    return `
      ${renderSecondsField(round, ri)}
      <div class="form-group" style="margin-bottom:12px;">
        <label class="form-label" for="choice-q-${ri}">Question</label>
        <input id="choice-q-${ri}" class="input" type="text"
          placeholder="What is the capital of France?"
          maxlength="300" value="${escHtml(round.question)}"
          data-choice-question="${ri}">
      </div>
      <div class="form-group" style="margin:0;">
        <label class="form-label">Answers (check all correct)</label>
        ${warn}
        <div id="choice-answers-${ri}">${ansRows}</div>
      </div>
    `;
  }

  function renderCorrectBody(round, ri) {
    const words = round.sentence.trim() ? round.sentence.trim().split(/\s+/) : [];
    const safeIdx = Math.min(round.wrongIndex, Math.max(0, words.length - 1));

    const preview = words.length >= 2
      ? words.map((w, i) =>
          i === safeIdx
            ? `<span style="background:var(--danger-dim);color:var(--danger);padding:1px 6px;border-radius:4px;font-weight:700;">${escHtml(w)}</span>`
            : escHtml(w)
        ).join(' ') + (round.correction.trim() ? ` → <strong>${escHtml(round.correction)}</strong>` : '')
      : '';

    return `
      ${renderSecondsField(round, ri)}
      <div class="form-group" style="margin-bottom:12px;">
        <label class="form-label" for="correct-sentence-${ri}">Sentence (with the mistake)</label>
        <textarea id="correct-sentence-${ri}" class="input fill-para-input" rows="3"
          placeholder="She go to school every day."
          data-correct-sentence="${ri}">${escHtml(round.sentence)}</textarea>
        <div id="correct-preview-${ri}" class="form-hint" style="margin-top:4px;">
          ${preview ? `Preview: ${preview}` : ''}
        </div>
      </div>
      <div class="form-group" style="margin-bottom:12px;">
        <label class="form-label" for="correct-idx-${ri}">Wrong word index (0-based)</label>
        <span class="form-hint" style="display:block;margin-bottom:6px;">Which word position has the mistake? (0 = first word)</span>
        <input id="correct-idx-${ri}" class="input" type="number" min="0" max="${Math.max(0, words.length - 1)}"
          value="${safeIdx}" data-correct-index="${ri}" style="max-width:120px;">
      </div>
      <div class="form-group" style="margin:0;">
        <label class="form-label" for="correct-correction-${ri}">Correct word</label>
        <input id="correct-correction-${ri}" class="input" type="text"
          placeholder="goes" maxlength="100"
          data-correct-correction="${ri}" value="${escHtml(round.correction)}">
      </div>
    `;
  }

  function renderOrderBody(round, ri) {
    const rows = round.sentences.map((s, si) => `
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;" data-order-row="${ri}" data-si="${si}">
        <span style="font-size:0.8rem;font-weight:700;color:var(--text-3);flex-shrink:0;width:20px;">${si + 1}.</span>
        <input class="input" type="text" placeholder="Sentence ${si + 1}"
          maxlength="300" value="${escHtml(s)}"
          data-order-sentence="${ri}" data-si="${si}" style="flex:1;">
        <button class="pair-remove" data-order-remove="${ri}" data-si="${si}"
          ${round.sentences.length <= 2 ? 'disabled' : ''} title="Remove">×</button>
      </div>`).join('');

    const nonEmpty = round.sentences.filter(s => s.trim()).length;

    return `
      ${renderSecondsField(round, ri)}
      <div class="form-group" style="margin:0;">
        <label class="form-label">Sentences (in correct order)</label>
        <span class="form-hint" style="display:block;margin-bottom:8px;">Enter the sentences in the correct order — the game will shuffle them for players.</span>
        <div id="order-sentences-${ri}">${rows}</div>
        <div style="display:flex;gap:8px;margin-top:8px;align-items:center;">
          <button class="add-pair-btn" data-order-add="${ri}"
            ${round.sentences.length >= 8 ? 'disabled' : ''}>+ Add sentence</button>
          <span class="form-hint">${nonEmpty}/${round.sentences.length} filled</span>
        </div>
      </div>
    `;
  }

  function renderConnectionsBody(round, ri) {
    const groupRows = round.groups.map((g, gi) => {
      const wordInputs = g.words.map((w, wi) => `
        <input class="input" type="text" placeholder="Word ${wi + 1}" maxlength="60"
          value="${escHtml(w)}"
          data-conn-word="${ri}" data-gi="${gi}" data-wi="${wi}"
          style="flex:1;min-width:60px;">`).join('');
      return `
        <div class="connections-group-row" data-gi="${gi}" style="margin-bottom:14px;padding:10px;background:rgba(255,255,255,0.04);border-radius:var(--radius);">
          <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">
            <span style="font-size:0.78rem;font-weight:700;color:var(--text-3);flex-shrink:0;">Group ${gi + 1}</span>
            <input class="input" type="text" placeholder="Category label" maxlength="60"
              value="${escHtml(g.label)}"
              data-conn-label="${ri}" data-gi="${gi}" style="flex:1;">
            <button class="pair-remove" data-conn-remove="${ri}" data-gi="${gi}"
              ${round.groups.length <= 3 ? 'disabled' : ''} title="Remove group">×</button>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;">${wordInputs}</div>
        </div>`;
    }).join('');

    return `
      ${renderSecondsField(round, ri)}
      <div class="form-group" style="margin:0;">
        <label class="form-label">Groups</label>
        <span class="form-hint" style="display:block;margin-bottom:8px;">Each group needs a category label and exactly 4 words. Players find the groups.</span>
        <div id="connections-groups-${ri}">${groupRows}</div>
        <button class="add-pair-btn" data-conn-add="${ri}"
          ${round.groups.length >= 4 ? 'disabled' : ''} style="margin-top:4px;">+ Add group</button>
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
    container.querySelector('#add-shuffle-btn').addEventListener('click', () => addRoundAndScroll(defaultShuffleRound()));
    container.querySelector('#add-choice-btn').addEventListener('click', () => addRoundAndScroll(defaultChoiceRound()));
    container.querySelector('#add-correct-btn').addEventListener('click', () => addRoundAndScroll(defaultCorrectRound()));
    container.querySelector('#add-order-btn').addEventListener('click', () => addRoundAndScroll(defaultOrderRound()));
    container.querySelector('#add-connections-btn').addEventListener('click', () => addRoundAndScroll(defaultConnectionsRound()));

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

    // Shuffle round: image URL
    container.querySelectorAll('[data-shuffle-img]').forEach(inp => {
      inp.addEventListener('input', () => {
        rounds[Number(inp.dataset.shuffleImg)].imageUrl = inp.value;
      });
    });

    // Shuffle round: sentence
    container.querySelectorAll('[data-shuffle-sentence]').forEach(inp => {
      const ri = Number(inp.dataset.shuffleSentence);
      inp.addEventListener('input', () => {
        rounds[ri].sentence = inp.value;
        updateShufflePreview(ri);
      });
    });

    // Choice round: question
    container.querySelectorAll('[data-choice-question]').forEach(inp => {
      inp.addEventListener('input', () => {
        rounds[Number(inp.dataset.choiceQuestion)].question = inp.value;
      });
    });

    // Choice round: answer text
    container.querySelectorAll('[data-choice-answer]').forEach(inp => {
      inp.addEventListener('input', () => {
        const ri = Number(inp.dataset.choiceAnswer);
        const ai = Number(inp.dataset.answerIdx);
        rounds[ri].answers[ai].text = inp.value;
        updateChoiceWarn(ri);
      });
    });

    // Choice round: correct checkbox
    container.querySelectorAll('[data-choice-correct]').forEach(chk => {
      chk.addEventListener('change', () => {
        const ri = Number(chk.dataset.choiceCorrect);
        const ai = Number(chk.dataset.answerIdx);
        rounds[ri].answers[ai].correct = chk.checked;
        updateChoiceWarn(ri);
      });
    });

    // Correct round: sentence textarea
    container.querySelectorAll('[data-correct-sentence]').forEach(ta => {
      const ri = Number(ta.dataset.correctSentence);
      ta.addEventListener('input', () => {
        rounds[ri].sentence = ta.value;
        updateCorrectPreview(ri);
      });
    });

    // Correct round: wrong index
    container.querySelectorAll('[data-correct-index]').forEach(inp => {
      inp.addEventListener('input', () => {
        const ri = Number(inp.dataset.correctIndex);
        rounds[ri].wrongIndex = Math.max(0, parseInt(inp.value) || 0);
        updateCorrectPreview(ri);
      });
    });

    // Correct round: correction
    container.querySelectorAll('[data-correct-correction]').forEach(inp => {
      inp.addEventListener('input', () => {
        const ri = Number(inp.dataset.correctCorrection);
        rounds[ri].correction = inp.value;
        updateCorrectPreview(ri);
      });
    });

    // Order round: sentence inputs
    container.querySelectorAll('[data-order-sentence]').forEach(inp => {
      inp.addEventListener('input', () => {
        const ri = Number(inp.dataset.orderSentence);
        const si = Number(inp.dataset.si);
        rounds[ri].sentences[si] = inp.value;
      });
    });

    // Order round: add sentence button
    container.querySelectorAll('[data-order-add]').forEach(btn => {
      btn.addEventListener('click', () => {
        const ri = Number(btn.dataset.orderAdd);
        if (rounds[ri].sentences.length >= 8) return;
        rounds[ri].sentences.push('');
        render();
      });
    });

    // Order round: remove sentence button
    container.querySelectorAll('[data-order-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        const ri = Number(btn.dataset.orderRemove);
        const si = Number(btn.dataset.si);
        if (rounds[ri].sentences.length <= 2) return;
        rounds[ri].sentences.splice(si, 1);
        render();
      });
    });

    // Connections round: group label
    container.querySelectorAll('[data-conn-label]').forEach(inp => {
      inp.addEventListener('input', () => {
        const ri = Number(inp.dataset.connLabel);
        const gi = Number(inp.dataset.gi);
        rounds[ri].groups[gi].label = inp.value;
      });
    });

    // Connections round: word inputs
    container.querySelectorAll('[data-conn-word]').forEach(inp => {
      inp.addEventListener('input', () => {
        const ri = Number(inp.dataset.connWord);
        const gi = Number(inp.dataset.gi);
        const wi = Number(inp.dataset.wi);
        rounds[ri].groups[gi].words[wi] = inp.value;
      });
    });

    // Connections round: add group
    container.querySelectorAll('[data-conn-add]').forEach(btn => {
      btn.addEventListener('click', () => {
        const ri = Number(btn.dataset.connAdd);
        if (rounds[ri].groups.length >= 4) return;
        rounds[ri].groups.push({ label: '', words: ['', '', '', ''] });
        render();
      });
    });

    // Connections round: remove group
    container.querySelectorAll('[data-conn-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        const ri = Number(btn.dataset.connRemove);
        const gi = Number(btn.dataset.gi);
        if (rounds[ri].groups.length <= 3) return;
        rounds[ri].groups.splice(gi, 1);
        render();
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

  function updateShufflePreview(ri) {
    const previewEl = container.querySelector(`#shuffle-preview-${ri}`);
    if (!previewEl) return;
    const s = rounds[ri].sentence.trim();
    const n = s ? s.split(/\s+/).length : 0;
    previewEl.innerHTML = n > 0
      ? `<span style="color:var(--success);">✓ ${n} word${n !== 1 ? 's' : ''}</span>`
      : '';
  }

  function updateChoiceWarn(ri) {
    const warnEl = container.querySelector(`#choice-warn-${ri}`);
    if (!warnEl) return;
    const r = rounds[ri];
    const hasText    = r.answers.some(a => a.text.trim());
    const hasCorrect = r.answers.some(a => a.correct && a.text.trim());
    if (hasText && !hasCorrect) {
      warnEl.className = 'warn-banner';
      warnEl.innerHTML = '<span>⚠️</span><span>Mark at least one answer as correct.</span>';
    } else {
      warnEl.className = '';
      warnEl.innerHTML = '';
    }
  }

  function updateCorrectPreview(ri) {
    const previewEl = container.querySelector(`#correct-preview-${ri}`);
    if (!previewEl) return;
    const r = rounds[ri];
    const words = r.sentence.trim() ? r.sentence.trim().split(/\s+/) : [];
    if (words.length < 2) {
      previewEl.innerHTML = r.sentence.trim()
        ? `<span style="color:var(--warning);">Need at least 2 words</span>`
        : '';
      return;
    }
    const idx = Math.min(r.wrongIndex, words.length - 1);
    const preview = words.map((w, i) =>
      i === idx
        ? `<span style="background:var(--danger-dim);color:var(--danger);padding:1px 6px;border-radius:4px;font-weight:700;">${escHtml(w)}</span>`
        : escHtml(w)
    ).join(' ') + (r.correction.trim() ? ` → <strong>${escHtml(r.correction)}</strong>` : '');
    previewEl.innerHTML = `Preview: ${preview}`;
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
      } else if (r.type === 'shuffle') {
        if (!r.sentence.trim()) {
          showError(`Round ${i + 1} (Word shuffle) needs a sentence.`);
          return;
        }
        if (r.sentence.trim().split(/\s+/).length < 2) {
          showError(`Round ${i + 1} (Word shuffle) sentence needs at least 2 words.`);
          return;
        }
      } else if (r.type === 'choice') {
        if (!r.question.trim()) {
          showError(`Round ${i + 1} (Multiple choice) needs a question.`);
          return;
        }
        if (r.answers.filter(a => a.text.trim()).length < 2) {
          showError(`Round ${i + 1} (Multiple choice) needs at least 2 answer options.`);
          return;
        }
        if (!r.answers.some(a => a.correct && a.text.trim())) {
          showError(`Round ${i + 1} (Multiple choice): Mark at least one answer as correct.`);
          return;
        }
      } else if (r.type === 'correct') {
        const words = r.sentence.trim().split(/\s+/).filter(Boolean);
        if (words.length < 2) {
          showError(`Round ${i + 1} (Correct the Mistake) sentence needs at least 2 words.`);
          return;
        }
        if (r.wrongIndex < 0 || r.wrongIndex >= words.length) {
          showError(`Round ${i + 1} (Correct the Mistake): Wrong word index must be 0–${words.length - 1}.`);
          return;
        }
        if (!r.correction.trim()) {
          showError(`Round ${i + 1} (Correct the Mistake): Correct word is required.`);
          return;
        }
      } else if (r.type === 'order') {
        const filled = r.sentences.filter(s => s.trim());
        if (filled.length < 2) {
          showError(`Round ${i + 1} (Sentence Order) needs at least 2 sentences.`);
          return;
        }
        if (r.sentences.some(s => !s.trim())) {
          showError(`Round ${i + 1} (Sentence Order): All sentence fields must be filled.`);
          return;
        }
        const unique = new Set(r.sentences.map(s => s.trim()));
        if (unique.size < 2) {
          showError(`Round ${i + 1} (Sentence Order): Sentences must be distinct.`);
          return;
        }
      } else if (r.type === 'connections') {
        if (r.groups.length < 3 || r.groups.length > 4) {
          showError(`Round ${i + 1} (Connections) needs 3 or 4 groups.`);
          return;
        }
        for (let gi = 0; gi < r.groups.length; gi++) {
          const g = r.groups[gi];
          if (!g.label.trim()) {
            showError(`Round ${i + 1} (Connections): Group ${gi + 1} needs a category label.`);
            return;
          }
          if (g.words.some(w => !w.trim())) {
            showError(`Round ${i + 1} (Connections): Group ${gi + 1} must have exactly 4 non-empty words.`);
            return;
          }
        }
        const allWords = r.groups.flatMap(g => g.words.map(w => w.trim().toLowerCase()));
        if (new Set(allWords).size < allWords.length) {
          showError(`Round ${i + 1} (Connections): All words must be unique across groups.`);
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
        if (r.type === 'shuffle') {
          return { type: 'shuffle', imageUrl: r.imageUrl, sentence: r.sentence, seconds: r.seconds };
        }
        if (r.type === 'choice') {
          return {
            type: 'choice',
            question: r.question,
            answers: r.answers.map(a => ({ text: a.text.trim(), correct: !!a.correct })),
            seconds: r.seconds,
          };
        }
        if (r.type === 'correct') {
          return {
            type:       'correct',
            sentence:   r.sentence.trim(),
            wrongIndex: r.wrongIndex,
            correction: r.correction.trim(),
            seconds:    r.seconds,
          };
        }
        if (r.type === 'order') {
          return {
            type:      'order',
            sentences: r.sentences.map(s => s.trim()),
            seconds:   r.seconds,
          };
        }
        if (r.type === 'connections') {
          return {
            type:    'connections',
            groups:  r.groups.map(g => ({ label: g.label.trim(), words: g.words.map(w => w.trim()) })),
            seconds: r.seconds,
          };
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
