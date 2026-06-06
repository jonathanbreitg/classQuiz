import { describe, it, expect } from 'vitest';
import { findStaleCodes } from '../src/lib/pruning.js';
import { STALE_MATCH_HOURS } from '../src/lib/constants.js';

const STALE_MS = STALE_MATCH_HOURS * 3600 * 1000;
const now = 1_700_000_000_000; // fixed "now" for deterministic tests

describe('findStaleCodes', () => {
  it('returns empty array when meta is empty', () => {
    expect(findStaleCodes({}, now, STALE_MS)).toEqual([]);
  });

  it('returns codes whose createdAt is older than threshold', () => {
    const meta = {
      ABCD: { createdAt: now - STALE_MS - 1 },
      EFGH: { createdAt: now - 1000 },
    };
    expect(findStaleCodes(meta, now, STALE_MS)).toEqual(['ABCD']);
  });

  it('returns empty array when all matches are fresh', () => {
    const meta = {
      ABCD: { createdAt: now - 1000 },
      EFGH: { createdAt: now - 5000 },
    };
    expect(findStaleCodes(meta, now, STALE_MS)).toEqual([]);
  });

  it('returns all codes when all are stale', () => {
    const meta = {
      ABCD: { createdAt: now - STALE_MS - 1 },
      EFGH: { createdAt: now - STALE_MS - 99999 },
    };
    const result = findStaleCodes(meta, now, STALE_MS);
    expect(result).toHaveLength(2);
    expect(result).toContain('ABCD');
    expect(result).toContain('EFGH');
  });

  it('treats a match with missing createdAt as epoch 0 (stale)', () => {
    const meta = { ZZZZ: {} };
    expect(findStaleCodes(meta, now, STALE_MS)).toEqual(['ZZZZ']);
  });

  it('does not include a match created exactly at the boundary', () => {
    const meta = { ABCD: { createdAt: now - STALE_MS } };
    // boundary is exclusive: createdAt < threshold, so exactly at threshold is NOT stale
    expect(findStaleCodes(meta, now, STALE_MS)).toEqual([]);
  });

  it('returns only the stale codes when mixed', () => {
    const meta = {
      OLD1: { createdAt: now - STALE_MS - 10000 },
      OLD2: { createdAt: now - STALE_MS - 1 },
      NEW1: { createdAt: now - STALE_MS + 1 },
      NEW2: { createdAt: now - 500 },
    };
    const stale = findStaleCodes(meta, now, STALE_MS);
    expect(stale).toContain('OLD1');
    expect(stale).toContain('OLD2');
    expect(stale).not.toContain('NEW1');
    expect(stale).not.toContain('NEW2');
    expect(stale).toHaveLength(2);
  });
});
