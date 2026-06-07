/**
 * Unit tests for normalizeTemplate — including the new select and type round types.
 */

import { describe, it, expect } from 'vitest';
import { normalizeTemplate } from '../src/lib/templateNormalize.js';

describe('normalizeTemplate', () => {
  // ── Legacy format conversion ─────────────────────────────────────────────────

  it('converts legacy numRounds+pairsPool format to rounds array', () => {
    const legacy = {
      numRounds: 2,
      pairsPool: [{ word: 'hello', definition: 'greeting' }],
    };
    const norm = normalizeTemplate(legacy);
    expect(Array.isArray(norm.rounds)).toBe(true);
    expect(norm.rounds.length).toBe(2);
    expect(norm.rounds[0].type).toBe('match');
    expect(norm.rounds[0].pairsPool).toEqual(legacy.pairsPool);
  });

  it('passes through new-format templates with rounds array unchanged in structure', () => {
    const modern = {
      title: 'Test',
      rounds: [{ type: 'match', pairsPool: [] }],
    };
    const norm = normalizeTemplate(modern);
    expect(norm.rounds.length).toBe(1);
    expect(norm.rounds[0].type).toBe('match');
  });

  // ── fill round defaults ──────────────────────────────────────────────────────

  it('adds wordBankSize default to fill rounds', () => {
    const t = { rounds: [{ type: 'fill', paragraph: 'He [ran] fast.' }] };
    const norm = normalizeTemplate(t);
    expect(norm.rounds[0].blanksVisible).toBeUndefined();
    expect(norm.rounds[0].wordBankSize).toBe(6);
    expect(norm.rounds[0].paragraph).toBe('He [ran] fast.'); // preserved
  });

  it('does not override existing fill round wordBankSize', () => {
    const t = { rounds: [{ type: 'fill', paragraph: 'x', wordBankSize: 10 }] };
    const norm = normalizeTemplate(t);
    expect(norm.rounds[0].wordBankSize).toBe(10);
  });

  // ── select round defaults ────────────────────────────────────────────────────

  it('adds choices default to select rounds', () => {
    const t = { rounds: [{ type: 'select', paragraph: 'She [ran] fast.' }] };
    const norm = normalizeTemplate(t);
    expect(norm.rounds[0].blanksVisible).toBeUndefined();
    expect(norm.rounds[0].choices).toEqual({});
    expect(norm.rounds[0].paragraph).toBe('She [ran] fast.');
  });

  it('preserves existing choices on select round', () => {
    const choices = { 0: ['ran', 'walked', 'flew'] };
    const t = { rounds: [{ type: 'select', paragraph: 'She [ran].', choices }] };
    const norm = normalizeTemplate(t);
    expect(norm.rounds[0].choices).toEqual(choices);
  });

  // ── type round defaults ──────────────────────────────────────────────────────

  it('type round has no blanksVisible default', () => {
    const t = { rounds: [{ type: 'type', paragraph: 'The [cat] sat.' }] };
    const norm = normalizeTemplate(t);
    expect(norm.rounds[0].blanksVisible).toBeUndefined();
    expect(norm.rounds[0].paragraph).toBe('The [cat] sat.');
  });

  it('type round has no choices or wordBankSize field by default', () => {
    const t = { rounds: [{ type: 'type', paragraph: 'The [cat] sat.' }] };
    const norm = normalizeTemplate(t);
    expect(norm.rounds[0].choices).toBeUndefined();
    expect(norm.rounds[0].wordBankSize).toBeUndefined();
  });

  // ── match rounds unchanged ───────────────────────────────────────────────────

  it('does not modify match rounds', () => {
    const matchRound = { type: 'match', pairsPool: [{ word: 'a', definition: 'b' }], pairIndices: [0] };
    const t = { rounds: [matchRound] };
    const norm = normalizeTemplate(t);
    expect(norm.rounds[0]).toEqual(matchRound);
  });

  // ── Mixed round array ────────────────────────────────────────────────────────

  it('normalizes a template with all four round types', () => {
    const t = {
      rounds: [
        { type: 'fill',   paragraph: 'A [b] c.' },
        { type: 'select', paragraph: 'D [e] f.', choices: { 0: ['e', 'x'] } },
        { type: 'type',   paragraph: 'G [h] i.' },
        { type: 'match',  pairsPool: [] },
      ],
    };
    const norm = normalizeTemplate(t);
    expect(norm.rounds[0].type).toBe('fill');
    expect(norm.rounds[0].blanksVisible).toBeUndefined();
    expect(norm.rounds[0].wordBankSize).toBe(6);

    expect(norm.rounds[1].type).toBe('select');
    expect(norm.rounds[1].blanksVisible).toBeUndefined();
    expect(norm.rounds[1].choices).toEqual({ 0: ['e', 'x'] });

    expect(norm.rounds[2].type).toBe('type');
    expect(norm.rounds[2].blanksVisible).toBeUndefined();

    expect(norm.rounds[3].type).toBe('match');
    expect(norm.rounds[3].blanksVisible).toBeUndefined();
  });

  // ── shuffle round defaults ───────────────────────────────────────────────────

  it('adds imageUrl and sentence defaults to shuffle rounds', () => {
    const t = { rounds: [{ type: 'shuffle' }] };
    const norm = normalizeTemplate(t);
    expect(norm.rounds[0].imageUrl).toBe('');
    expect(norm.rounds[0].sentence).toBe('');
  });

  it('does not override existing shuffle fields', () => {
    const t = { rounds: [{ type: 'shuffle', imageUrl: 'http://x.com/img.png', sentence: 'Hello world' }] };
    const norm = normalizeTemplate(t);
    expect(norm.rounds[0].imageUrl).toBe('http://x.com/img.png');
    expect(norm.rounds[0].sentence).toBe('Hello world');
  });

  // ── choice round defaults ────────────────────────────────────────────────────

  it('adds question and answers defaults to choice rounds', () => {
    const t = { rounds: [{ type: 'choice' }] };
    const norm = normalizeTemplate(t);
    expect(norm.rounds[0].question).toBe('');
    expect(norm.rounds[0].answers).toEqual([]);
  });

  it('does not override existing choice fields', () => {
    const answers = [{ text: 'Yes', correct: true }];
    const t = { rounds: [{ type: 'choice', question: 'Q?', answers }] };
    const norm = normalizeTemplate(t);
    expect(norm.rounds[0].question).toBe('Q?');
    expect(norm.rounds[0].answers).toEqual(answers);
  });

  // ── correct round defaults ───────────────────────────────────────────────────

  it('adds wrongIndex and correction defaults to correct rounds', () => {
    const t = { rounds: [{ type: 'correct', sentence: 'She go home.' }] };
    const norm = normalizeTemplate(t);
    expect(norm.rounds[0].wrongIndex).toBe(0);
    expect(norm.rounds[0].correction).toBe('');
    expect(norm.rounds[0].sentence).toBe('She go home.');
  });

  it('does not override existing correct round fields', () => {
    const t = { rounds: [{ type: 'correct', sentence: 'x', wrongIndex: 2, correction: 'goes' }] };
    const norm = normalizeTemplate(t);
    expect(norm.rounds[0].wrongIndex).toBe(2);
    expect(norm.rounds[0].correction).toBe('goes');
  });

  // ── order round defaults ─────────────────────────────────────────────────────

  it('adds sentences default to order rounds', () => {
    const t = { rounds: [{ type: 'order' }] };
    const norm = normalizeTemplate(t);
    expect(norm.rounds[0].sentences).toEqual([]);
  });

  it('does not override existing order sentences', () => {
    const sentences = ['First.', 'Second.'];
    const t = { rounds: [{ type: 'order', sentences }] };
    const norm = normalizeTemplate(t);
    expect(norm.rounds[0].sentences).toEqual(sentences);
  });

  // ── connections round defaults ───────────────────────────────────────────────

  it('adds groups default to connections rounds', () => {
    const t = { rounds: [{ type: 'connections' }] };
    const norm = normalizeTemplate(t);
    expect(norm.rounds[0].groups).toEqual([]);
  });

  it('does not override existing connections groups', () => {
    const groups = [{ label: 'G1', words: ['a', 'b', 'c', 'd'] }];
    const t = { rounds: [{ type: 'connections', groups }] };
    const norm = normalizeTemplate(t);
    expect(norm.rounds[0].groups).toEqual(groups);
  });

  // ── Top-level template fields preserved ─────────────────────────────────────

  it('preserves top-level fields like title and config', () => {
    const t = {
      title: 'My Template',
      config: { minigameSeconds: 30, interStageSeconds: 10, bonusMax: 8 },
      rounds: [{ type: 'fill', paragraph: 'X [y] z.' }],
    };
    const norm = normalizeTemplate(t);
    expect(norm.title).toBe('My Template');
    expect(norm.config.minigameSeconds).toBe(30);
  });
});
