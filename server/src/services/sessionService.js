import { randomBytes, createHash, timingSafeEqual, randomUUID } from 'node:crypto';

// Guest sessions: the client keeps { playerId, token } in localStorage.
// The server only stores a hash of the token, so a leaked room snapshot
// cannot be used to impersonate anyone.
export function createSession() {
  const token = randomBytes(24).toString('base64url');
  return { playerId: randomUUID(), token, tokenHash: hashToken(token) };
}

export const hashToken = (token) => createHash('sha256').update(String(token)).digest();

export function tokenMatches(token, tokenHash) {
  if (typeof token !== 'string' || !tokenHash) return false;
  return timingSafeEqual(hashToken(token), tokenHash);
}
