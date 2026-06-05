import { BONUS_MAX, MINIGAME_SECONDS } from './constants.js';

export function computeTimeBonus(finished, remainingMs, minigameSeconds = MINIGAME_SECONDS, bonusMax = BONUS_MAX) {
  if (!finished) return 0;
  const totalMs = minigameSeconds * 1000;
  return Math.min(bonusMax, Math.round(bonusMax * remainingMs / totalMs));
}

export function computeRoundScore(correctPairs, timeBonus) {
  return correctPairs + timeBonus;
}

// roundResults: array of { score: number }
export function computeTotalScore(roundResults) {
  return roundResults.reduce((sum, r) => sum + r.score, 0);
}
