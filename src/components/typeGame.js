import { createParagraphScroller } from './paragraphScroller.js';

// paragraph : raw string with [word] markers
// onSubmit(answers: {[blankIdx]: word}, finished: bool)
export function createTypeGame({ paragraph, onSubmit }) {
  const placed = {};
  let disabled = false;
  const inputEls = [];

  const scroller = createParagraphScroller({
    paragraph,
    isBlankFilled: idx => placed[idx] !== undefined,
    onLocksChanged: autoCommitLocked,
  });

  const { paraWrapEl, blankEls, totalBlanks } = scroller;

  if (totalBlanks === 0) {
    const el = document.createElement('div');
    el.className = 'fill-game';
    el.appendChild(paraWrapEl);
    paraWrapEl.style.overflow = 'auto';
    return { el, setProgress() {}, forceSubmit() { onSubmit({}, true); }, reveal() {}, cleanup() {} };
  }

  const el = document.createElement('div');
  el.className = 'fill-game';
  el.appendChild(paraWrapEl);

  paraWrapEl.style.maxHeight = 'calc(100dvh - 120px)';

  // Inject a text input inside each blank
  for (let i = 0; i < totalBlanks; i++) {
    const blankEl = blankEls[i];
    if (!blankEl) continue;
    blankEl.classList.add('fill-blank--type');
    const input = document.createElement('input');
    input.className = 'type-blank-input';
    input.type = 'text';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.autocorrect = 'off';
    input.autocapitalize = 'off';
    inputEls[i] = input;
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const value = input.value;
        focusNextBlank(i);
        commitAnswer(i, value);
      }
    });
    input.addEventListener('blur', () => commitAnswer(i, input.value));
    blankEl.appendChild(input);
  }

  // Focus the first blank's input on mount
  requestAnimationFrame(() => {
    for (let i = 0; i < totalBlanks; i++) {
      if (inputEls[i] && placed[i] === undefined && !scroller.isLocked(i)) {
        inputEls[i].focus();
        break;
      }
    }
  });

  function focusNextBlank(fromIdx) {
    for (let i = fromIdx + 1; i < totalBlanks; i++) {
      if (inputEls[i] && placed[i] === undefined && !scroller.isLocked(i)) {
        inputEls[i].focus({ preventScroll: true });
        return;
      }
    }
  }

  function commitAnswer(idx, value) {
    if (disabled || placed[idx] !== undefined) return;
    const trimmed = value.trim();
    if (!trimmed) return;
    placed[idx] = trimmed;
    const input = inputEls[idx];
    if (input) {
      input.readOnly = true;
      input.classList.add('type-blank-input--committed');
    }
    blankEls[idx]?.classList.add('fill-blank--filled');
    scroller.onBlankAnswered();
    checkAllPlaced();
  }

  function autoCommitLocked() {
    for (let i = 0; i < totalBlanks; i++) {
      if (!scroller.isLocked(i) || placed[i] !== undefined) continue;
      const input = inputEls[i];
      if (!input) continue;
      if (input.value.trim()) {
        commitAnswer(i, input.value);
      } else {
        input.readOnly = true;
        input.classList.add('type-blank-input--locked');
      }
    }
  }

  function checkAllPlaced() {
    if (Object.keys(placed).length === totalBlanks && !disabled) {
      setTimeout(() => submitGame(true), 150);
    }
  }

  function submitGame(finished) {
    if (disabled) return;
    disabled = true;
    // Auto-commit any typed but uncommitted answers before submitting
    for (let i = 0; i < totalBlanks; i++) {
      if (placed[i] === undefined && inputEls[i]?.value.trim()) {
        const val = inputEls[i].value.trim();
        placed[i] = val;
        if (inputEls[i]) {
          inputEls[i].readOnly = true;
          inputEls[i].classList.add('type-blank-input--committed');
        }
        blankEls[i]?.classList.add('fill-blank--filled');
      }
    }
    onSubmit({ ...placed }, finished);
  }

  function reveal() {
    disabled = true;
    scroller.reveal(idx => placed[idx]);
  }

  return {
    el,
    setProgress: pct => scroller.setProgress(pct),
    forceSubmit() { submitGame(false); },
    reveal,
    cleanup() { scroller.cleanup(); },
  };
}
