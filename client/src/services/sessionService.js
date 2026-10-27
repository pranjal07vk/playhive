// A guest "seat" in a room: { roomCode, playerId, token }. It lives in
// localStorage so a refresh or a dropped connection can reclaim the same seat.
const key = (code) => `playhive:seat:${code}`;
const NAME_KEY = 'playhive:name';

function safe(fn, fallback = null) {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export const sessionService = {
  get: (code) => safe(() => JSON.parse(localStorage.getItem(key(code)))),
  save: (session) => safe(() => localStorage.setItem(key(session.roomCode), JSON.stringify(session))),
  clear: (code) => safe(() => localStorage.removeItem(key(code))),
  lastName: () => safe(() => localStorage.getItem(NAME_KEY), '') || '',
  rememberName: (name) => safe(() => localStorage.setItem(NAME_KEY, name)),
};
