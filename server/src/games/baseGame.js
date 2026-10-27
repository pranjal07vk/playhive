/*
 * The contract every game module follows. A module is a plain object
 * exported from games/<folder>/index.js:
 *
 *   meta:      { id, name, tagline, minPlayers, maxPlayers, howToPlay: [..] }
 *   settings:  [{ key, label, type: 'select' | 'number' | 'boolean', ... }]
 *   create(ctx)                     -> initial state
 *   actions:   { [type]: (state, ctx) => result? }   ctx.playerId, ctx.payload
 *   onTimeout(state, ctx)           -> called once state.deadline has passed
 *   onPlayerLeft(state, ctx)        -> a participant left the room mid-game
 *   view(state, playerId, ctx)      -> exactly what that player may see
 *
 * ctx always carries { players, hostId, settings, rng, now }.
 * State is owned by the server. A game ends by setting state.finished = true
 * and state.results = { headline, ranking: [{ playerId, score, note }], highlights }.
 * Actions reject bad input by throwing AppError; the engine turns that into
 * a server:error for the sender and changes nothing else.
 */
import { AppError } from '../utils/errors.js';

export function validateSettings(definitions, raw = {}) {
  const out = {};
  for (const def of definitions) {
    const value = raw[def.key];
    if (def.type === 'number') {
      const n = Number(value);
      out[def.key] = Number.isFinite(n) ? Math.min(def.max, Math.max(def.min, Math.round(n))) : def.default;
    } else if (def.type === 'boolean') {
      out[def.key] = typeof value === 'boolean' ? value : def.default;
    } else {
      out[def.key] = def.options.some((o) => o.value === value) ? value : def.default;
    }
  }
  return out;
}

export function publicMeta(game) {
  return { ...game.meta, settings: game.settings };
}

export const fail = (code, message) => {
  throw new AppError(code, message);
};

export function requirePhase(state, ...phases) {
  if (!phases.includes(state.phase)) fail('WRONG_PHASE', 'That move is not available right now.');
}
