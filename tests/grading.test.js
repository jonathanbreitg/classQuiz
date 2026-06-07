import { describe, it, expect } from 'vitest';
import {
  gradeRound,
  gradeShuffleRound,
  gradeChoiceRound,
  gradeCorrectRound,
  gradeOrderRound,
  gradeConnectionsRound,
} from '../src/lib/grading.js';

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

describe('gradeShuffleRound', () => {
  const words = ['The', 'cat', 'sat'];

  it('all correct', () => {
    expect(gradeShuffleRound({ 0: 'The', 1: 'cat', 2: 'sat' }, words)).toBe(3);
  });

  it('partial correct', () => {
    expect(gradeShuffleRound({ 0: 'The', 1: 'sat', 2: 'cat' }, words)).toBe(1);
  });

  it('empty submission', () => {
    expect(gradeShuffleRound({}, words)).toBe(0);
  });

  it('case-insensitive', () => {
    expect(gradeShuffleRound({ 0: 'the', 1: 'CAT', 2: 'SAT' }, words)).toBe(3);
  });

  it('missing slots count as wrong', () => {
    expect(gradeShuffleRound({ 0: 'The' }, words)).toBe(1);
  });
});

describe('gradeChoiceRound', () => {
  const answers = [
    { text: 'Paris', correct: true  },
    { text: 'London', correct: false },
    { text: 'Berlin', correct: false },
    { text: 'Madrid', correct: false },
  ];

  it('selects only the correct answer → all 4 classified correctly', () => {
    expect(gradeChoiceRound({ 0: true }, answers)).toBe(4);
  });

  it('selects nothing → 3 correct (the 3 unselected+wrong are right)', () => {
    expect(gradeChoiceRound({}, answers)).toBe(3);
  });

  it('selects a wrong answer → misclassifies that one', () => {
    expect(gradeChoiceRound({ 1: true }, answers)).toBe(2);
  });

  it('selects correct + a wrong answer → 3 correct classifications (1 misclassified)', () => {
    // 0=correct+selected✓, 1=wrong+not-selected✓, 2=wrong+selected✗, 3=wrong+not-selected✓
    expect(gradeChoiceRound({ 0: true, 2: true }, answers)).toBe(3);
  });

  it('multi-correct: all correct answers selected', () => {
    const multi = [
      { text: 'A', correct: true  },
      { text: 'B', correct: true  },
      { text: 'C', correct: false },
    ];
    expect(gradeChoiceRound({ 0: true, 1: true }, multi)).toBe(3);
  });
});

describe('gradeCorrectRound', () => {
  it('returns 1 when tapped index matches wrongIndex', () => {
    expect(gradeCorrectRound({ tapped: 2 }, 2)).toBe(1);
  });

  it('returns 0 when tapped index is wrong', () => {
    expect(gradeCorrectRound({ tapped: 0 }, 2)).toBe(0);
  });

  it('returns 0 for empty answers (timer expired)', () => {
    expect(gradeCorrectRound({}, 2)).toBe(0);
  });

  it('returns 0 when tapped is undefined', () => {
    expect(gradeCorrectRound({ tapped: undefined }, 1)).toBe(0);
  });
});

describe('gradeOrderRound', () => {
  const sentences = ['First.', 'Second.', 'Third.'];

  it('all correct order', () => {
    expect(gradeOrderRound({ 0: 'First.', 1: 'Second.', 2: 'Third.' }, sentences)).toBe(3);
  });

  it('partial correct', () => {
    expect(gradeOrderRound({ 0: 'First.', 1: 'Third.', 2: 'Second.' }, sentences)).toBe(1);
  });

  it('empty submission', () => {
    expect(gradeOrderRound({}, sentences)).toBe(0);
  });

  it('trims whitespace before comparing', () => {
    expect(gradeOrderRound({ 0: '  First.  ', 1: 'Second.', 2: 'Third.' }, sentences)).toBe(3);
  });

  it('missing slots count as wrong', () => {
    expect(gradeOrderRound({ 0: 'First.' }, sentences)).toBe(1);
  });
});

describe('gradeConnectionsRound', () => {
  it('all 4 groups solved', () => {
    expect(gradeConnectionsRound({ solved: [0, 1, 2, 3] }, 4)).toBe(4);
  });

  it('partial: 2 of 3 groups solved', () => {
    expect(gradeConnectionsRound({ solved: [0, 2] }, 3)).toBe(2);
  });

  it('none solved (forceSubmit before any correct)', () => {
    expect(gradeConnectionsRound({ solved: [] }, 3)).toBe(0);
  });

  it('empty answers (timer expired immediately)', () => {
    expect(gradeConnectionsRound({}, 3)).toBe(0);
  });
});
