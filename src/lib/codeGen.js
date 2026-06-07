import { CODE_LENGTH, CODE_ALPHABET } from './constants.js';

// Works in both secure (HTTPS/localhost) and non-secure (LAN HTTP) contexts.
export function randomUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

export function generateCode() {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

// isCodeTaken: async (code: string) => boolean
export async function generateUniqueCode(isCodeTaken) {
  let code;
  do {
    code = generateCode();
  } while (await isCodeTaken(code));
  return code;
}
