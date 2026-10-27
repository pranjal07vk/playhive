import { randomInt } from 'node:crypto';

// No 0/O, 1/I/L or U so codes are easy to read aloud and type on a phone.
const ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
export const CODE_LENGTH = 5;

export function generateRoomCode(isTaken, maxAttempts = 20) {
  for (let i = 0; i < maxAttempts; i += 1) {
    let code = '';
    for (let j = 0; j < CODE_LENGTH; j += 1) code += ALPHABET[randomInt(ALPHABET.length)];
    if (!isTaken(code)) return code;
  }
  throw new Error('Could not generate a unique room code');
}

export function normalizeRoomCode(raw) {
  if (typeof raw !== 'string') return null;
  const code = raw.trim().toUpperCase();
  return new RegExp(`^[${ALPHABET}]{${CODE_LENGTH}}$`).test(code) ? code : null;
}
