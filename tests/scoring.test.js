import { describe, it, expect } from 'vitest';
import { computeTimeBonus, computeRoundScore, computeTotalScore } from '../src/lib/scoring.js';
import { BONUS_MAX, MINIGAME_SECONDS } from '../src/lib/constants.js';

const TOTAL_MS = MINIGAME_SECONDS * 1000;

describe('computeTimeBonus', () => {
  it('returns 0 when not finished, regardless of remaining time', () => {
    expect(computeTimeBonus(false, TOTAL_MS)).toBe(0);
    expect(computeTimeBonus(false, 0)).toBe(0);
    expect(computeTimeBonus(false, 10000)).toBe(0);
  });

  it('returns 0 when finished but no time remains', () => {
    expect(computeTimeBonus(true, 0)).toBe(0);
  });

  it('returns BONUS_MAX when finished with all time remaining', () => {
    expect(computeTimeBonus(true, TOTAL_MS)).toBe(BONUS_MAX);
  });

  it('returns approximately half the bonus at half time remaining', () => {
    expect(computeTimeBonus(true, TOTAL_MS / 2)).toBe(Math.round(BONUS_MAX / 2));
  });

  it('is capped at bonusMax even with an unexpectedly high remainingMs', () => {
    expect(computeTimeBonus(true, TOTAL_MS * 2)).toBe(BONUS_MAX);
  });

  it('uses custom minigameSeconds and bonusMax', () => {
    expect(computeTimeBonus(true, 30000, 30, 9)).toBe(9);
    expect(computeTimeBonus(true, 15000, 30, 9)).toBe(Math.round(9 * 0.5));
  });
});

describe('computeRoundScore', () => {
  it('equals correctPairs + timeBonus', () => {
    expect(computeRoundScore(4, 3)).toBe(7);
    expect(computeRoundScore(6, 6)).toBe(12);
    expect(computeRoundScore(0, 0)).toBe(0);
    expect(computeRoundScore(6, 0)).toBe(6);
    expect(computeRoundScore(0, 6)).toBe(6);
  });
});

describe('computeTotalScore', () => {
  it('returns the sum of all round scores', () => {
    expect(computeTotalScore([{ score: 5 }, { score: 8 }, { score: 3 }])).toBe(16);
  });

  it('returns 0 for empty rounds', () => {
    expect(computeTotalScore([])).toBe(0);
  });

  it('handles a single round', () => {
    expect(computeTotalScore([{ score: 12 }])).toBe(12);
  });

  it('handles zero scores', () => {
    expect(computeTotalScore([{ score: 0 }, { score: 0 }])).toBe(0);
  });
});
