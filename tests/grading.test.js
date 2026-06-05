import { describe, it, expect } from 'vitest';
import { gradeRound } from '../src/lib/grading.js';

describe('gradeRound', () => {
  it('returns 6 when all pairs are correct', () => {
    expect(gradeRound({ 0: 0, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 })).toBe(6);
  });

  it('returns 0 when all pairs are wrong', () => {
    expect(gradeRound({ 0: 1, 1: 0, 2: 3, 3: 2, 4: 5, 5: 4 })).toBe(0);
  });

  it('counts partial correct pairs', () => {
    // correct: 0->0, 2->2, 3->3, 5->5 = 4 correct
    expect(gradeRound({ 0: 0, 1: 0, 2: 2, 3: 3, 4: 1, 5: 5 })).toBe(4);
  });

  it('returns 0 for an empty submission (all unmatched at timeout)', () => {
    expect(gradeRound({})).toBe(0);
  });

  it('treats missing entries as wrong', () => {
    // Only 3 of 6 pairs submitted, all correct
    expect(gradeRound({ 0: 0, 1: 1, 2: 2 })).toBe(3);
  });

  it('handles string keys (as stored in RTDB)', () => {
    expect(gradeRound({ '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5 })).toBe(6);
  });

  it('handles string values', () => {
    expect(gradeRound({ '0': '0', '1': '2' })).toBe(1);
  });
});
