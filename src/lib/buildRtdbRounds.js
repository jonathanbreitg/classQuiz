import { sampleRounds } from './poolSampling.js';

/**
 * Convert Firestore template rounds into the RTDB round entries stored when a
 * match starts. Keep this in sync with src/pages/template.js.
 *
 * Adding a new round type requires a branch here AND in:
 *   src/pages/play.js (dispatch + grading)
 *   src/pages/create.js (authoring)
 *   src/pages/host.js  (host view)
 *   src/lib/grading.js
 *   src/lib/templateNormalize.js
 */
export function buildRtdbRounds(rounds) {
  return rounds.map(r => {
    if (r.type === 'fill' || r.type === 'select' || r.type === 'type') {
      const base = { type: r.type, startAt: null };
      if (r.seconds != null) base.seconds = r.seconds;
      return base;
    }
    if (r.type === 'shuffle') {
      const base = { type: 'shuffle', startAt: null, imageUrl: r.imageUrl ?? '' };
      if (r.seconds != null) base.seconds = r.seconds;
      return base;
    }
    if (r.type === 'choice') {
      const base = { type: 'choice', startAt: null, question: r.question ?? '', answers: r.answers ?? [] };
      if (r.seconds != null) base.seconds = r.seconds;
      return base;
    }
    if (r.type === 'correct') {
      const base = { type: 'correct', startAt: null, sentence: r.sentence ?? '', wrongIndex: r.wrongIndex ?? 0 };
      if (r.seconds != null) base.seconds = r.seconds;
      return base;
    }
    if (r.type === 'order') {
      const base = { type: 'order', startAt: null, sentences: r.sentences ?? [] };
      if (r.seconds != null) base.seconds = r.seconds;
      return base;
    }
    if (r.type === 'connections') {
      const base = { type: 'connections', startAt: null, groups: r.groups ?? [] };
      if (r.seconds != null) base.seconds = r.seconds;
      return base;
    }
    // match
    const pool = r.pairsPool ?? [];
    const pairIndices = pool.length >= 6
      ? sampleRounds(pool.length, 1)[0]
      : Array.from({ length: pool.length }, (_, i) => i);
    const base = { type: 'match', pairIndices, startAt: null };
    if (r.seconds != null) base.seconds = r.seconds;
    return base;
  });
}
