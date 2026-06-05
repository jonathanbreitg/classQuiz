import { NICKNAME_MAX } from './constants.js';

// Returns nickname unchanged if free; appends the smallest integer suffix that is free.
export function dedupeNickname(nickname, existingNicknames) {
  const taken = new Set(existingNicknames);
  if (!taken.has(nickname)) return nickname;

  let i = 2;
  while (taken.has(`${nickname}${i}`)) i++;
  return `${nickname}${i}`;
}

// Returns null if invalid, or the trimmed nickname if valid.
export function validateNickname(raw) {
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > NICKNAME_MAX) return null;
  return trimmed;
}
