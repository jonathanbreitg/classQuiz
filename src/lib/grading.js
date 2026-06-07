// playerAnswers: { [slotIdx]: word } — what player placed in each slot.
// correctWords: string[] — correct words in order.
export function gradeShuffleRound(playerAnswers, correctWords) {
  let correct = 0;
  for (let i = 0; i < correctWords.length; i++) {
    const p = playerAnswers[i];
    if (p !== undefined && p.toLowerCase() === correctWords[i].toLowerCase()) correct++;
  }
  return correct;
}

// playerAnswers: { [answerIdx]: true } — selected answer indices.
// answers: { text: string, correct: bool }[] — all answer options.
// Returns count of correctly-classified answers (selected+correct OR not-selected+wrong).
export function gradeChoiceRound(playerAnswers, answers) {
  let correct = 0;
  for (let i = 0; i < answers.length; i++) {
    const selected = playerAnswers[i] === true;
    if (selected === !!answers[i].correct) correct++;
  }
  return correct;
}

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

// playerAnswers: { tapped: number } or {} (timer ended before correct tap)
// wrongIndex: number
export function gradeCorrectRound(playerAnswers, wrongIndex) {
  return playerAnswers.tapped === wrongIndex ? 1 : 0;
}

// playerAnswers: { [slotIdx]: sentenceText }
// correctSentences: string[]
export function gradeOrderRound(playerAnswers, correctSentences) {
  let correct = 0;
  for (let i = 0; i < correctSentences.length; i++) {
    if ((playerAnswers[i] ?? '').trim() === correctSentences[i].trim()) correct++;
  }
  return correct;
}

// playerAnswers: { solved: number[] } — group indices solved by player
// totalGroups: number
export function gradeConnectionsRound(playerAnswers, totalGroups) {
  return (playerAnswers.solved ?? []).length;
}
