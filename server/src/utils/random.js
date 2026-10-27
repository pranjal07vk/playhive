import { randomInt } from 'node:crypto';

// Every random choice in a game goes through an rng object so tests can
// pass a seeded one and get repeatable games.
export const secureRng = { int: (max) => randomInt(max) };

export function seededRng(seed = 1) {
  let s = seed >>> 0;
  return {
    int(max) {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s % max;
    },
  };
}

export function shuffle(list, rng) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = rng.int(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export const pick = (list, rng) => list[rng.int(list.length)];
