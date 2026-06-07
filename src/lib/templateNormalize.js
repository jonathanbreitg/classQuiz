// Converts legacy templates (numRounds + global pairsPool) to the new
// rounds-array format.  New-format templates pass through unchanged.
export function normalizeTemplate(data) {
  if (!Array.isArray(data.rounds)) {
    return {
      ...data,
      rounds: Array.from({ length: data.numRounds ?? 1 }, () => ({
        type: 'match',
        pairsPool: data.pairsPool ?? [],
      })),
    };
  }
  // Ensure each round has all required fields with safe defaults
  return {
    ...data,
    rounds: data.rounds.map(r => {
      if (r.type === 'select') return { choices: {}, ...r };
      if (r.type === 'fill')   return { wordBankSize: 6, ...r };
      return r; // type or match — no extra defaults needed
    }),
  };
}
