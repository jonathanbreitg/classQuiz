import { describe, it, expect } from 'vitest';
import { dedupeNickname, validateNickname } from '../src/lib/nicknames.js';
import { NICKNAME_MAX } from '../src/lib/constants.js';

describe('dedupeNickname', () => {
  it('returns the nickname unchanged when not taken', () => {
    expect(dedupeNickname('Sam', [])).toBe('Sam');
    expect(dedupeNickname('Sam', ['Alice', 'Bob'])).toBe('Sam');
  });

  it('appends "2" when the base name is taken', () => {
    expect(dedupeNickname('Sam', ['Sam'])).toBe('Sam2');
  });

  it('increments suffix until finding a free slot', () => {
    expect(dedupeNickname('Sam', ['Sam', 'Sam2'])).toBe('Sam3');
    expect(dedupeNickname('Sam', ['Sam', 'Sam2', 'Sam3', 'Sam4'])).toBe('Sam5');
  });

  it('is case-sensitive (different case = no conflict)', () => {
    expect(dedupeNickname('Sam', ['sam', 'SAM'])).toBe('Sam');
  });

  it('handles a nickname that already ends in a number', () => {
    // "Player1" taken → "Player12" (appends suffix, does not increment)
    expect(dedupeNickname('Player1', ['Player1'])).toBe('Player12');
  });
});

describe('validateNickname', () => {
  it('returns the trimmed nickname for valid input', () => {
    expect(validateNickname('  Sam  ')).toBe('Sam');
    expect(validateNickname('Alice')).toBe('Alice');
  });

  it('returns null for empty or whitespace-only input', () => {
    expect(validateNickname('')).toBeNull();
    expect(validateNickname('   ')).toBeNull();
  });

  it('returns null when the trimmed nickname exceeds NICKNAME_MAX', () => {
    expect(validateNickname('A'.repeat(NICKNAME_MAX + 1))).toBeNull();
  });

  it('accepts a nickname of exactly NICKNAME_MAX characters', () => {
    expect(validateNickname('A'.repeat(NICKNAME_MAX))).toBe('A'.repeat(NICKNAME_MAX));
  });
});
