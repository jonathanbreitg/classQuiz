import { describe, it, expect } from 'vitest';
import { rankPlayers, buildPodium } from '../src/lib/ranking.js';

const mkPlayer = (id, totalScore, joinedAt = 1000) =>
  ({ id, nickname: id, totalScore, joinedAt });

describe('rankPlayers', () => {
  it('sorts by totalScore descending', () => {
    const players = [mkPlayer('B', 10), mkPlayer('A', 20), mkPlayer('C', 5)];
    expect(rankPlayers(players).map(p => p.id)).toEqual(['A', 'B', 'C']);
  });

  it('assigns rank 1 to the highest scorer', () => {
    const players = [mkPlayer('A', 20), mkPlayer('B', 10)];
    expect(rankPlayers(players)[0].rank).toBe(1);
  });

  it('tied players share the same rank', () => {
    const ranked = rankPlayers([mkPlayer('A', 10), mkPlayer('B', 10), mkPlayer('C', 5)]);
    expect(ranked[0].rank).toBe(1);
    expect(ranked[1].rank).toBe(1);
    expect(ranked[2].rank).toBe(3); // rank skips 2 because two players occupy rank 1
  });

  it('breaks ties by joinedAt ascending for stable display order', () => {
    const players = [mkPlayer('B', 10, 2000), mkPlayer('A', 10, 1000)];
    const ranked = rankPlayers(players);
    expect(ranked[0].id).toBe('A'); // joined earlier
    expect(ranked[1].id).toBe('B');
    expect(ranked[0].rank).toBe(1);
    expect(ranked[1].rank).toBe(1);
  });

  it('assigns consecutive distinct ranks when no ties', () => {
    const ranked = rankPlayers([mkPlayer('A', 30), mkPlayer('B', 20), mkPlayer('C', 10)]);
    expect(ranked.map(p => p.rank)).toEqual([1, 2, 3]);
  });

  it('handles a single player', () => {
    const ranked = rankPlayers([mkPlayer('A', 5)]);
    expect(ranked[0].rank).toBe(1);
  });

  it('handles all players tied', () => {
    const ranked = rankPlayers([mkPlayer('A', 5), mkPlayer('B', 5), mkPlayer('C', 5)]);
    expect(ranked.every(p => p.rank === 1)).toBe(true);
  });
});

describe('buildPodium', () => {
  it('returns top 3 distinct positions', () => {
    const players = [mkPlayer('A', 50), mkPlayer('B', 40), mkPlayer('C', 30), mkPlayer('D', 20)];
    const podium = buildPodium(players);
    expect(podium.map(p => p.id)).toEqual(['A', 'B', 'C']);
    expect(podium.every(p => p.rank <= 3)).toBe(true);
  });

  it('includes all players tied for a top-3 position', () => {
    // A:rank1, B:rank1, C:rank3 — D is rank4
    const players = [mkPlayer('A', 10, 1000), mkPlayer('B', 10, 2000), mkPlayer('C', 5), mkPlayer('D', 2)];
    const podium = buildPodium(players);
    expect(podium.some(p => p.id === 'A')).toBe(true);
    expect(podium.some(p => p.id === 'B')).toBe(true);
    expect(podium.some(p => p.id === 'C')).toBe(true);
    expect(podium.some(p => p.id === 'D')).toBe(false);
  });

  it('includes 4th-player when tied for 3rd', () => {
    const players = [mkPlayer('A', 40), mkPlayer('B', 30), mkPlayer('C', 20, 1000), mkPlayer('D', 20, 2000)];
    const podium = buildPodium(players);
    expect(podium.some(p => p.id === 'D')).toBe(true);
    expect(podium.every(p => p.rank <= 3)).toBe(true);
  });

  it('works with only 2 players', () => {
    const podium = buildPodium([mkPlayer('A', 20), mkPlayer('B', 10)]);
    expect(podium).toHaveLength(2);
    expect(podium[0].rank).toBe(1);
    expect(podium[1].rank).toBe(2);
  });

  it('works with 1 player', () => {
    const podium = buildPodium([mkPlayer('A', 10)]);
    expect(podium).toHaveLength(1);
    expect(podium[0].rank).toBe(1);
  });

  it('excludes players ranked 4th or lower', () => {
    const players = [mkPlayer('A', 40), mkPlayer('B', 30), mkPlayer('C', 20), mkPlayer('D', 10)];
    expect(buildPodium(players).map(p => p.id)).not.toContain('D');
  });
});
