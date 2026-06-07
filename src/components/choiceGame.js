// question : string
// answers  : { text: string, correct: bool }[]
// onSubmit(answers: {[answerIdx]: true}, finished: bool)
export function createChoiceGame({ question, answers, onSubmit }) {
  const selected = new Set();
  let disabled = false;

  const el = document.createElement('div');
  el.className = 'choice-game';

  const qEl = document.createElement('div');
  qEl.className = 'choice-question';
  qEl.textContent = question;
  el.appendChild(qEl);

  const optionsEl = document.createElement('div');
  optionsEl.className = 'choice-options';

  const COLORS = ['a', 'b', 'c', 'd'];
  const btnEls = answers.map((ans, i) => {
    const btn = document.createElement('button');
    btn.className = `choice-btn choice-btn--${COLORS[i] ?? 'a'}`;

    const letter = document.createElement('span');
    letter.className = 'choice-btn__letter';
    letter.textContent = String.fromCharCode(65 + i);

    const text = document.createElement('span');
    text.className = 'choice-btn__text';
    text.textContent = ans.text;

    btn.appendChild(letter);
    btn.appendChild(text);
    btn.addEventListener('click', () => {
      if (disabled) return;
      selected.add(i);
      btnEls[i].classList.add('choice-btn--selected');
      submitGame(true);
    });
    optionsEl.appendChild(btn);
    return btn;
  });

  el.appendChild(optionsEl);

  function submitGame(finished) {
    if (disabled) return;
    disabled = true;
    const ans = {};
    for (const i of selected) ans[i] = true;
    onSubmit(ans, finished);
  }

  function reveal() {
    disabled = true;
    btnEls.forEach((btn, i) => {
      btn.classList.remove('choice-btn--selected');
      if (answers[i].correct) {
        btn.classList.add('choice-btn--reveal-correct');
      } else if (selected.has(i)) {
        btn.classList.add('choice-btn--reveal-wrong');
      } else {
        btn.classList.add('choice-btn--reveal-neutral');
      }
    });
  }

  return {
    el,
    setProgress() {},
    forceSubmit() { submitGame(false); },
    reveal,
    cleanup() {},
  };
}
