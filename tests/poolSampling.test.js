import { describe, it, expect } from 'vitest';
import { sampleRounds } from '../src/lib/poolSampling.js';
import { PAIRS_PER_ROUND } from '../src/lib/constants.js';

describe('sampleRounds', () => {
  it('returns an array of length numRounds', () => {
    expect(sampleRounds(12, 3)).toHaveLength(3);
    expect(sampleRounds(6, 1)).toHaveLength(1);
  });

  it('each round has exactly PAIRS_PER_ROUND indices', () => {
    for (const round of sampleRounds(12, 2)) {
      expect(round).toHaveLength(PAIRS_PER_ROUND);
    }
  });

  it('all indices are valid (within poolSize)', () => {
    const poolSize = 10;
    for (const round of sampleRounds(poolSize, 2)) {
      for (const idx of round) {
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThan(poolSize);
      }
    }
  });

  it('rounds are pairwise distinct when poolSize >= PAIRS_PER_ROUND * numRounds', () => {
    const numRounds = 3;
    const poolSize = PAIRS_PER_ROUND * numRounds; // exactly 18
    const allIndices = sampleRounds(poolSize, numRounds).flat();
    expect(new Set(allIndices).size).toBe(allIndices.length);
  });

  it('does not crash when poolSize < PAIRS_PER_ROUND * numRounds', () => {
    expect(() => sampleRounds(6, 4)).not.toThrow();
  });

  it('allows repeats gracefully when pool is smaller than needed', () => {
    const rounds = sampleRounds(6, 3); // needs 18 but pool has 6
    for (const round of rounds) {
      expect(round).toHaveLength(PAIRS_PER_ROUND);
      for (const idx of round) {
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThan(6);
      }
    }
  });

  it('returns distinct indices within a single round', () => {
    for (let trial = 0; trial < 20; trial++) {
      const [round] = sampleRounds(10, 1);
      expect(new Set(round).size).toBe(PAIRS_PER_ROUND);
    }
  });
});
