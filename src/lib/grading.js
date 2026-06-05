// submission: object mapping wordPairIdx (0-5) -> defPairIdx (0-5).
// Missing entries count as wrong. Returns correctPairs count.
export function gradeRound(submission) {
  let correct = 0;
  for (const [wordIdx, defIdx] of Object.entries(submission)) {
    if (Number(wordIdx) === Number(defIdx)) correct++;
  }
  return correct;
}
