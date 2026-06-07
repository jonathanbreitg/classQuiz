import { createParagraphScroller } from './paragraphScroller.js';

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// paragraph : raw string with [word] markers
// choices   : string[][] — choices[i] = array of options for blank i (includes correct answer)
// onSubmit(answers: {[blankIdx]: word}, finished: bool)
export function createSelectGame({ paragraph, choices, onSubmit }) {
  const placed = {};
  let disabled = false;

  const scroller = createParagraphScroller({
    paragraph,
    isBlankFilled: idx => placed[idx] !== undefined,
    onLocksChanged: () => {},
  });

  const { paraWrapEl, blankEls, answers, totalBlanks } = scroller;

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

  // Inject shuffled choice buttons inside each blank
  for (let i = 0; i < totalBlanks; i++) {
    const blankEl = blankEls[i];
    if (!blankEl) continue;
    blankEl.classList.add('fill-blank--select');
    const blankChoices = shuffle([...(choices?.[i]?.length ? choices[i] : [answers[i]])]);
    const wrap = document.createElement('span');
    wrap.className = 'select-choices';
    for (const choice of blankChoices) {
      const btn = document.createElement('button');
      btn.className = 'select-choice';
      btn.textContent = choice;
      btn.addEventListener('click', () => placeAnswer(i, choice, wrap));
      wrap.appendChild(btn);
    }
    blankEl.appendChild(wrap);
  }

  function placeAnswer(idx, word, choiceWrap) {
    if (disabled || scroller.isLocked(idx)) return;
    placed[idx] = word;
    blankEls[idx]?.classList.add('fill-blank--filled');
    choiceWrap?.querySelectorAll('.select-choice').forEach(btn => {
      btn.classList.toggle('select-choice--selected', btn.textContent === word);
    });
    scroller.onBlankAnswered();
    checkAllPlaced();
  }

  function checkAllPlaced() {
    if (Object.keys(placed).length === totalBlanks && !disabled) {
      setTimeout(() => submitGame(true), 150);
    }
  }

  function submitGame(finished) {
    if (disabled) return;
    disabled = true;
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
