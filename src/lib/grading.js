// submission: object mapping wordPairIdx (0-5) -> defPairIdx (0-5).
// Missing entries count as wrong. Returns correctPairs count.
export function gradeRound(submission) {
  let correct = 0;
  for (const [wordIdx, defIdx] of Object.entries(submission)) {
    if (Number(wordIdx) === Number(defIdx)) correct++;
  }
  return correct;
}

// playerAnswers: { [blankIdx]: word } — what the player typed/placed.
// correctAnswers: string[] — correct answers by blank index.
// Comparison is case-insensitive, ignores non-letter characters.
export function gradeFillRound(playerAnswers, correctAnswers) {
  let correct = 0;
  for (let i = 0; i < correctAnswers.length; i++) {
    const p = playerAnswers[i];
    if (p !== undefined && normalizeWord(p) === normalizeWord(correctAnswers[i])) correct++;
  }
  return correct;
}

function normalizeWord(s) {
  return String(s).toLowerCase().replace(/[^a-z]/g, '');
}
