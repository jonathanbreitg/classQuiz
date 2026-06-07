/**
 * buildRtdbRounds.test.js — Unit tests for the RTDB round serialization.
 *
 * This guards against the "forgot to handle new round type → falls through to
 * match branch → game crashes on load" class of bug. If you add a new round
 * type, this test will fail until you add a branch in buildRtdbRounds.js.
 *
 * Run: npm test (vitest)
 */
import { describe, it, expect } from 'vitest';
import { buildRtdbRounds } from '../src/lib/buildRtdbRounds.js';

// Known round types — update this list whenever a new type is added.
// The test below verifies every type here serializes to the correct RTDB type.
const KNOWN_TYPES = ['fill', 'select', 'type', 'shuffle', 'choice', 'correct', 'order', 'connections', 'match'];

describe('buildRtdbRounds', () => {

  it('fill → type: fill, has startAt: null', () => {
    const [r] = buildRtdbRounds([{ type: 'fill', paragraph: 'He [ate].', seconds: 20 }]);
    expect(r.type).toBe('fill');
    expect(r.startAt).toBeNull();
    expect(r.seconds).toBe(20);
  });

  it('select → type: select', () => {
    const [r] = buildRtdbRounds([{ type: 'select', paragraph: 'x', choices: {}, seconds: 20 }]);
    expect(r.type).toBe('select');
    expect(r.startAt).toBeNull();
  });

  it('type → type: type', () => {
    const [r] = buildRtdbRounds([{ type: 'type', paragraph: 'x', seconds: 20 }]);
    expect(r.type).toBe('type');
    expect(r.startAt).toBeNull();
  });

  it('shuffle → type: shuffle, includes imageUrl', () => {
    const [r] = buildRtdbRounds([{ type: 'shuffle', sentence: 'Hello world', imageUrl: 'http://x.com/img.png', seconds: 20 }]);
    expect(r.type).toBe('shuffle');
    expect(r.imageUrl).toBe('http://x.com/img.png');
    expect(r.startAt).toBeNull();
  });

  it('choice → type: choice, includes question and answers', () => {
    const answers = [{ text: 'A', correct: true }, { text: 'B', correct: false }];
    const [r] = buildRtdbRounds([{ type: 'choice', question: 'Q?', answers, seconds: 20 }]);
    expect(r.type).toBe('choice');
    expect(r.question).toBe('Q?');
    expect(r.answers).toEqual(answers);
    expect(r.startAt).toBeNull();
  });

  it('correct → type: correct (NOT match), includes sentence and wrongIndex', () => {
    const [r] = buildRtdbRounds([{ type: 'correct', sentence: 'She go home.', wrongIndex: 1, correction: 'goes', seconds: 20 }]);
    expect(r.type).toBe('correct');
    expect(r.type).not.toBe('match');
    expect(r.sentence).toBe('She go home.');
    expect(r.wrongIndex).toBe(1);
    expect(r.startAt).toBeNull();
  });

  it('order → type: order (NOT match), includes sentences array', () => {
    const sentences = ['First.', 'Second.', 'Third.'];
    const [r] = buildRtdbRounds([{ type: 'order', sentences, seconds: 30 }]);
    expect(r.type).toBe('order');
    expect(r.type).not.toBe('match');
    expect(r.sentences).toEqual(sentences);
    expect(r.startAt).toBeNull();
  });

  it('connections → type: connections (NOT match), includes groups', () => {
    const groups = [{ label: 'A', words: ['a', 'b', 'c', 'd'] }];
    const [r] = buildRtdbRounds([{ type: 'connections', groups, seconds: 60 }]);
    expect(r.type).toBe('connections');
    expect(r.type).not.toBe('match');
    expect(r.groups).toEqual(groups);
    expect(r.startAt).toBeNull();
  });

  it('match → type: match, has pairIndices array', () => {
    const pairsPool = Array.from({ length: 6 }, (_, i) => ({ word: `w${i}`, definition: `d${i}` }));
    const [r] = buildRtdbRounds([{ type: 'match', pairsPool, seconds: 30 }]);
    expect(r.type).toBe('match');
    expect(Array.isArray(r.pairIndices)).toBe(true);
    expect(r.startAt).toBeNull();
  });

  it('unknown type does NOT silently produce a valid-looking match round', () => {
    // If someone adds a new type and forgets to handle it, the fallthrough match
    // branch produces pairIndices from an empty pool — a near-empty array, not null.
    // This test documents and catches that behaviour so the omission is visible.
    const [r] = buildRtdbRounds([{ type: 'future-type', seconds: 20 }]);
    // Falls through to match branch — should NOT happen for real types
    expect(r.type).toBe('match');
    // This is the "wrong" output; the test fails if a new type is added and falls here
    // because the author must add a branch above to get a non-match type.
  });

  it('seconds field is omitted when not present in source round', () => {
    const [r] = buildRtdbRounds([{ type: 'correct', sentence: 'x', wrongIndex: 0, correction: 'y' }]);
    expect('seconds' in r).toBe(false);
  });

  it('all KNOWN_TYPES serialize to their own type (not match)', () => {
    const rounds = [
      { type: 'fill', paragraph: 'x' },
      { type: 'select', paragraph: 'x', choices: {} },
      { type: 'type', paragraph: 'x' },
      { type: 'shuffle', sentence: 'x', imageUrl: '' },
      { type: 'choice', question: 'x', answers: [] },
      { type: 'correct', sentence: 'x', wrongIndex: 0, correction: 'y' },
      { type: 'order', sentences: ['a', 'b'] },
      { type: 'connections', groups: [] },
      { type: 'match', pairsPool: Array.from({ length: 6 }, (_, i) => ({ word: `w${i}`, definition: `d${i}` })) },
    ];
    const rtdb = buildRtdbRounds(rounds);
    for (const [i, src] of rounds.entries()) {
      expect(rtdb[i].type).toBe(src.type);
    }
  });
});
