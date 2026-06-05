import { PAIRS_PER_ROUND } from './constants.js';

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Returns numRounds arrays, each with PAIRS_PER_ROUND indices into the pool.
// Rounds draw distinct pairs while poolSize >= PAIRS_PER_ROUND * numRounds;
// otherwise reshuffles and allows repeats.
export function sampleRounds(poolSize, numRounds) {
  const indices = Array.from({ length: poolSize }, (_, i) => i);
  const needed = numRounds * PAIRS_PER_ROUND;
  let flat = [];

  while (flat.length < needed) {
    flat = flat.concat(shuffle(indices));
  }

  return Array.from({ length: numRounds }, (_, r) =>
    flat.slice(r * PAIRS_PER_ROUND, (r + 1) * PAIRS_PER_ROUND)
  );
}
