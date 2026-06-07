export function createCorrectGame({ sentence, wrongIndex, correction, onSubmit }) {
  const words = sentence.trim().split(/\s+/);
  let submitted = false;
  let disabled = false;
  const tappedWrong = new Set();

  const el = document.createElement('div');
  el.className = 'correct-game';

  const instruction = document.createElement('div');
  instruction.className = 'correct-instruction';
  instruction.textContent = 'Tap the word with a mistake';
  el.appendChild(instruction);

  const wordsRow = document.createElement('div');
  wordsRow.className = 'correct-words';

  const wordEls = words.map((word, i) => {
    const chip = document.createElement('button');
    chip.className = 'correct-word';
    chip.textContent = word;
    chip.dataset.idx = i;
    chip.addEventListener('click', () => onWordTap(i));
    wordsRow.appendChild(chip);
    return chip;
  });

  el.appendChild(wordsRow);

  function onWordTap(idx) {
    if (disabled || submitted) return;
    if (idx === wrongIndex) {
      wordEls[idx].classList.add('correct-word--right');
      disabled = true;
      submitted = true;
      onSubmit({ tapped: idx }, true);
    } else {
      tappedWrong.add(idx);
      wordEls[idx].classList.add('correct-word--wrong');
      setTimeout(() => {
        if (!disabled) wordEls[idx].classList.remove('correct-word--wrong');
      }, 600);
    }
  }

  function reveal() {
    disabled = true;
    wordEls.forEach(chip => { chip.disabled = true; });
    wordEls[wrongIndex].classList.add('correct-word--reveal-correct');
    const hint = document.createElement('div');
    hint.className = 'correct-word__hint';
    hint.textContent = `→ ${correction}`;
    wordEls[wrongIndex].appendChild(hint);
    tappedWrong.forEach(idx => {
      if (idx !== wrongIndex) wordEls[idx].classList.add('correct-word--reveal-wrong');
    });
  }

  return {
    el,
    setProgress() {},
    forceSubmit() {
      if (!submitted) {
        submitted = true;
        disabled = true;
        onSubmit({}, false);
      }
    },
    reveal,
    cleanup() {},
  };
}
