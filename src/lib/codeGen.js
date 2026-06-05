import { CODE_LENGTH, CODE_ALPHABET } from './constants.js';

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
