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
      if (r.type === 'select')  return { choices: {}, ...r };
      if (r.type === 'fill')        return { wordBankSize: 6, ...r };
      if (r.type === 'shuffle')     return { imageUrl: '', sentence: '', ...r };
      if (r.type === 'choice')      return { question: '', answers: [], ...r };
      if (r.type === 'correct')     return { wrongIndex: 0, correction: '', ...r };
      if (r.type === 'order')       return { sentences: [], ...r };
      if (r.type === 'connections') return { groups: [], ...r };
      return r; // match — no extra defaults needed
    }),
  };
}
