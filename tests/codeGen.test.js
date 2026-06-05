import { describe, it, expect, vi } from 'vitest';
import { generateCode, generateUniqueCode } from '../src/lib/codeGen.js';
import { CODE_LENGTH, CODE_ALPHABET } from '../src/lib/constants.js';

describe('generateCode', () => {
  it('returns a string of length CODE_LENGTH', () => {
    expect(generateCode()).toHaveLength(CODE_LENGTH);
  });

  it('only uses characters from CODE_ALPHABET', () => {
    const alphabetSet = new Set(CODE_ALPHABET);
    for (let i = 0; i < 100; i++) {
      for (const char of generateCode()) {
        expect(alphabetSet.has(char)).toBe(true);
      }
    }
  });

  it('generates different codes across multiple calls', () => {
    const codes = new Set(Array.from({ length: 50 }, generateCode));
    expect(codes.size).toBeGreaterThan(1);
  });

  it('never produces ambiguous characters (0, 1, O, I)', () => {
    const ambiguous = new Set(['0', '1', 'O', 'I']);
    for (let i = 0; i < 200; i++) {
      for (const char of generateCode()) {
        expect(ambiguous.has(char)).toBe(false);
      }
    }
  });
});

describe('generateUniqueCode', () => {
  it('returns a code not in the taken set', async () => {
    const taken = new Set(['ABCD', 'EFGH']);
    const code = await generateUniqueCode(async c => taken.has(c));
    expect(taken.has(code)).toBe(false);
  });

  it('retries until it finds a free code', async () => {
    const isCodeTaken = vi.fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValue(false);

    const code = await generateUniqueCode(isCodeTaken);
    expect(isCodeTaken).toHaveBeenCalledTimes(4);
    expect(code).toHaveLength(CODE_LENGTH);
  });

  it('returns immediately when the first code is free', async () => {
    const isCodeTaken = vi.fn().mockResolvedValue(false);
    await generateUniqueCode(isCodeTaken);
    expect(isCodeTaken).toHaveBeenCalledTimes(1);
  });
});
