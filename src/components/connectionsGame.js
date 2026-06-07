function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// groups: { label: string, words: string[] }[]
// onSubmit(answers: { solved: number[] }, finished: bool)
export function createConnectionsGame({ groups, onSubmit }) {
  const allWords = shuffle(groups.flatMap(g => g.words));
  const wordGroup = new Map(groups.flatMap((g, gi) => g.words.map(w => [w, gi])));
  const selected = new Set();
  const solved = new Set();
  let disabled = false;
  let submitted = false;

  // Group color palette — cycle through if >4 groups
  const GROUP_COLORS = [
    { bg: '#ffd93d', text: '#1a1a2e' }, // yellow
    { bg: '#51cf66', text: '#1a1a2e' }, // green
    { bg: '#5ba4ff', text: '#fff' },    // blue
    { bg: '#ff6b6b', text: '#fff' },    // red
  ];

  const el = document.createElement('div');
  el.className = 'connections-game';

  // Solved banners container
  const solvedContainer = document.createElement('div');
  solvedContainer.className = 'connections-solved';
  el.appendChild(solvedContainer);

  // Word grid
  const grid = document.createElement('div');
  grid.className = 'connections-grid';
  el.appendChild(grid);

  // Remaining word elements map: word → element
  const wordEls = new Map();

  function buildGrid() {
    grid.innerHTML = '';
    for (const word of allWords) {
      if ([...solved].some(gi => groups[gi].words.includes(word))) continue;
      const chip = document.createElement('button');
      chip.className = 'connections-word';
      chip.textContent = word;
      chip.addEventListener('click', () => onWordTap(word));
      grid.appendChild(chip);
      wordEls.set(word, chip);
    }
  }

  buildGrid();

  // Submit group button
  const submitBtn = document.createElement('button');
  submitBtn.className = 'btn btn--primary connections-submit';
  submitBtn.textContent = 'Submit Group';
  submitBtn.disabled = true;
  el.appendChild(submitBtn);

  submitBtn.addEventListener('click', () => trySubmitGroup());

  function onWordTap(word) {
    if (disabled) return;
    const chip = wordEls.get(word);
    if (!chip) return;
    if (selected.has(word)) {
      selected.delete(word);
      chip.classList.remove('connections-word--selected');
    } else {
      if (selected.size >= 4) return;
      selected.add(word);
      chip.classList.add('connections-word--selected');
    }
    submitBtn.disabled = selected.size !== 4;
    // Auto-submit when all remaining words are selected (last group)
    if (selected.size === 4 && selected.size === wordEls.size) {
      trySubmitGroup();
    }
  }

  function trySubmitGroup() {
    if (disabled || selected.size !== 4) return;
    const selectedArr = [...selected];
    const groupIdx = wordGroup.get(selectedArr[0]);
    const allSameGroup = selectedArr.every(w => wordGroup.get(w) === groupIdx);

    if (allSameGroup) {
      // Correct
      solved.add(groupIdx);
      showSolvedBanner(groupIdx, false);
      selected.clear();
      submitBtn.disabled = true;

      // Remove solved words from map and grid
      groups[groupIdx].words.forEach(w => wordEls.delete(w));
      buildGrid();

      if (solved.size === groups.length) {
        submitGame(true);
      }
    } else {
      // Wrong — shake and clear
      selectedArr.forEach(w => {
        const chip = wordEls.get(w);
        if (chip) {
          chip.classList.add('connections-word--shake');
          setTimeout(() => chip.classList.remove('connections-word--shake'), 600);
        }
      });
      selected.clear();
      wordEls.forEach(chip => chip.classList.remove('connections-word--selected'));
      submitBtn.disabled = true;
    }
  }

  function showSolvedBanner(gi, isReveal) {
    const color = GROUP_COLORS[gi % GROUP_COLORS.length];
    const banner = document.createElement('div');
    banner.className = 'connections-solved-group' + (isReveal ? ' connections-solved-group--reveal' : '');
    banner.style.background = color.bg;
    banner.style.color = color.text;
    banner.innerHTML = `
      <div class="connections-solved-label">${escText(groups[gi].label)}</div>
      <div class="connections-solved-words">${groups[gi].words.map(escText).join(', ')}</div>
    `;
    solvedContainer.appendChild(banner);
  }

  function escText(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function submitGame(finished) {
    if (submitted) return;
    submitted = true;
    disabled = true;
    submitBtn.disabled = true;
    onSubmit({ solved: [...solved] }, finished);
  }

  function reveal() {
    disabled = true;
    submitBtn.disabled = true;
    // Show all unsolved groups as grey banners
    for (let gi = 0; gi < groups.length; gi++) {
      if (!solved.has(gi)) showSolvedBanner(gi, true);
    }
    // Clear the grid
    grid.innerHTML = '';
    wordEls.clear();
  }

  return {
    el,
    setProgress() {},
    forceSubmit() { submitGame(false); },
    reveal,
    cleanup() {},
  };
}
