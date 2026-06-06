// Pure function — extracted for testability.
// meta: { [code]: { createdAt: number } }
// Returns codes whose createdAt is older than (nowMs - staleMs).
export function findStaleCodes(meta, nowMs, staleMs) {
  return Object.entries(meta)
    .filter(([, m]) => (m.createdAt || 0) < nowMs - staleMs)
    .map(([code]) => code);
}
