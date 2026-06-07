/**
 * Unit tests for gradeFillRound — the grading function used by
 * fill-in-blank (Game 1), select-word (Game 2), and type-answer (Game 3).
 */

import { describe, it, expect } from 'vitest';
import { gradeFillRound } from '../src/lib/grading.js';

describe('gradeFillRound', () => {
  const answers = ['ran', 'store', 'bought', 'milk'];

  // ── Exact matches ───────────────────────────────────────────────────────────

  it('returns total blank count when all answers are correct', () => {
    const player = { 0: 'ran', 1: 'store', 2: 'bought', 3: 'milk' };
    expect(gradeFillRound(player, answers)).toBe(4);
  });

  it('returns 0 when all answers are wrong', () => {
    const player = { 0: 'walked', 1: 'school', 2: 'sold', 3: 'bread' };
    expect(gradeFillRound(player, answers)).toBe(0);
  });

  it('counts partial correct answers', () => {
    const player = { 0: 'ran', 1: 'school', 2: 'bought', 3: 'bread' };
    expect(gradeFillRound(player, answers)).toBe(2);
  });

  // ── Missing / empty submissions ─────────────────────────────────────────────

  it('returns 0 for empty submission (timer expired, nothing answered)', () => {
    expect(gradeFillRound({}, answers)).toBe(0);
  });

  it('treats missing blank indices as wrong', () => {
    // Only blanks 0 and 2 answered correctly
    const player = { 0: 'ran', 2: 'bought' };
    expect(gradeFillRound(player, answers)).toBe(2);
  });

  it('treats undefined value as wrong', () => {
    const player = { 0: 'ran', 1: undefined };
    expect(gradeFillRound(player, answers)).toBe(1);
  });

  // ── Case insensitivity ──────────────────────────────────────────────────────

  it('is case-insensitive (RAN === ran)', () => {
    expect(gradeFillRound({ 0: 'RAN' }, answers)).toBe(1);
  });

  it('is case-insensitive (Milk === milk)', () => {
    expect(gradeFillRound({ 3: 'Milk' }, answers)).toBe(1);
  });

  it('accepts all-caps correct answer', () => {
    const player = { 0: 'RAN', 1: 'STORE', 2: 'BOUGHT', 3: 'MILK' };
    expect(gradeFillRound(player, answers)).toBe(4);
  });

  // ── Non-letter character stripping ──────────────────────────────────────────

  it('ignores trailing punctuation (ran. === ran)', () => {
    expect(gradeFillRound({ 0: 'ran.' }, answers)).toBe(1);
  });

  it('ignores leading/trailing spaces after stripping (typed quickly)', () => {
    // normalizeWord strips non-letters, so spaces are stripped too
    expect(gradeFillRound({ 0: 'ran!' }, answers)).toBe(1);
  });

  it('ignores hyphens inside word (e.g. well-known === wellknown)', () => {
    const ans = ['well-known'];
    expect(gradeFillRound({ 0: 'wellknown' }, ans)).toBe(1);
    expect(gradeFillRound({ 0: 'well-known' }, ans)).toBe(1);
  });

  it('returns 0 when answer is only punctuation', () => {
    expect(gradeFillRound({ 0: '!!!' }, answers)).toBe(0);
  });

  // ── String keys (as returned by Firebase RTDB) ──────────────────────────────

  it('handles string keys matching blank indices', () => {
    const player = { '0': 'ran', '1': 'store', '2': 'bought', '3': 'milk' };
    expect(gradeFillRound(player, answers)).toBe(4);
  });

  // ── Select-game submission format ────────────────────────────────────────────
  // Select game submits { [blankIdx]: chosenWord } where words come exactly from choices

  it('grades select-game answers (exact word from choices)', () => {
    const player = { 0: 'ran', 1: 'school', 2: 'bought', 3: 'milk' };
    // 0,2,3 correct
    expect(gradeFillRound(player, answers)).toBe(3);
  });

  // ── Type-game submission format ──────────────────────────────────────────────
  // Type game submits whatever the player typed; normalizeWord strips non-letters

  it('grades type-game answers with mixed case', () => {
    const player = { 0: 'Ran', 1: 'STORE', 2: 'bought', 3: 'Milk' };
    expect(gradeFillRound(player, answers)).toBe(4);
  });

  it('grades type-game answer with accidental punctuation', () => {
    const player = { 0: 'ran,', 1: 'store!', 2: 'bought.', 3: 'milk?' };
    expect(gradeFillRound(player, answers)).toBe(4);
  });

  // ── Edge: single blank ───────────────────────────────────────────────────────

  it('works with a single-blank paragraph', () => {
    expect(gradeFillRound({ 0: 'cat' }, ['cat'])).toBe(1);
    expect(gradeFillRound({ 0: 'dog' }, ['cat'])).toBe(0);
    expect(gradeFillRound({}, ['cat'])).toBe(0);
  });

  // ── Edge: correctAnswers array shorter than submission ───────────────────────

  it('only grades up to the length of correctAnswers', () => {
    // Player submits extra keys — should not affect count
    const player = { 0: 'ran', 1: 'store', 2: 'bought', 3: 'milk', 4: 'bonus' };
    expect(gradeFillRound(player, answers)).toBe(4);
  });
});
