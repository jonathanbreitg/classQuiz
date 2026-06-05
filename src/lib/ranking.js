// players: array of { id, nickname, totalScore, joinedAt }
// Returns players sorted descending by totalScore with a `rank` field.
// Tied players share the same rank; joinedAt breaks ties for display order only.
export function rankPlayers(players) {
  const sorted = [...players].sort((a, b) => {
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    return a.joinedAt - b.joinedAt;
  });

  let rank = 1;
  return sorted.map((player, i) => {
    if (i > 0 && sorted[i].totalScore < sorted[i - 1].totalScore) {
      rank = i + 1;
    }
    return { ...player, rank };
  });
}

// Returns the subset of ranked players occupying positions 1, 2, and 3.
// Tied players share a step, so this may return more than 3 entries or fewer than 3 steps.
export function buildPodium(players) {
  return rankPlayers(players).filter(p => p.rank <= 3);
}
