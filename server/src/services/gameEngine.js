import { AppError } from '../utils/errors.js';
import { secureRng } from '../utils/random.js';
import { logger } from '../utils/logger.js';
import { getGame } from '../games/registry.js';
import { roomEvents, ROOM_CHANGED, ROOM_RELAY } from './events.js';
import * as timers from './timerService.js';
import { saveMatch } from './historyService.js';

/*
 * The engine is the only code that touches a running game's state. It
 * builds the context a game module needs, runs the module's rules, and
 * then handles the shared consequences: deadlines, finishing, history.
 */

let rng = secureRng;
export const _setRng = (next) => {
  rng = next;
};

function context(room, extra = {}) {
  return {
    players: room.game.roster,
    connected: new Set([...room.players.values()].filter((p) => p.connected).map((p) => p.id)),
    hostId: room.hostId,
    settings: room.game.settings,
    rng,
    now: Date.now(),
    ...extra,
  };
}

export function start(room) {
  const game = getGame(room.gameId);
  const roster = [...room.players.values()]
    .sort((a, b) => a.joinedAt - b.joinedAt)
    .map(({ id, name }) => ({ id, name }));
  if (roster.length < game.meta.minPlayers) {
    throw new AppError('NOT_ENOUGH_PLAYERS', `${game.meta.name} needs at least ${game.meta.minPlayers} players. Invite ${game.meta.minPlayers - roster.length} more!`);
  }
  if (roster.length > game.meta.maxPlayers) {
    throw new AppError('TOO_MANY_PLAYERS', `${game.meta.name} supports up to ${game.meta.maxPlayers} players.`);
  }
  room.game = { id: game.meta.id, roster, settings: { ...room.settings }, startedAt: Date.now(), state: null };
  room.game.state = game.create(context(room));
  room.status = 'playing';
  room.lastResults = null;
  afterChange(room);
}

export function dispatch(room, playerId, type, payload) {
  if (room.status !== 'playing' || !room.game) throw new AppError('NO_GAME', 'There is no game running right now.');
  const game = getGame(room.game.id);
  const handler = Object.hasOwn(game.actions, type) ? game.actions[type] : null;
  if (!handler) throw new AppError('UNKNOWN_ACTION', 'That move does not exist in this game.');
  if (!room.game.roster.some((p) => p.id === playerId)) {
    throw new AppError('NOT_IN_GAME', 'You joined after this game started. You will be in the next one!');
  }
  const result = handler(room.game.state, context(room, { playerId, payload: payload ?? {} })) || {};
  // Drawing strokes are relayed to the others without re-sending the whole state.
  if (result.relay) roomEvents.emit(ROOM_RELAY, room, playerId, result.relay);
  if (!result.silent) afterChange(room);
}

export function playerLeft(room, playerId) {
  const game = getGame(room.game.id);
  const ctx = context(room, { playerId });
  const remaining = room.game.roster.filter((p) => room.players.has(p.id)).length;
  if (remaining < game.meta.minPlayers) {
    const state = room.game.state;
    state.finished = true;
    state.results = {
      ...(game.summarize?.(state, ctx) ?? {}),
      headline: 'Too many players left, so the game ended early.',
      endedEarly: true,
    };
  } else {
    game.onPlayerLeft?.(room.game.state, ctx);
  }
  afterChange(room, { notify: false });
}

function onDeadline(room) {
  if (room.status !== 'playing' || !room.game) return;
  const game = getGame(room.game.id);
  try {
    game.onTimeout?.(room.game.state, context(room));
  } catch (err) {
    logger.error(`Timeout handler failed in ${room.game.id}:`, err);
  }
  afterChange(room);
}

function afterChange(room, { notify = true } = {}) {
  const state = room.game?.state;
  if (!state) return;
  if (state.finished) return finish(room, notify);
  if (state.deadline) timers.schedule(room.code, state.deadline, () => onDeadline(room));
  else timers.cancel(room.code);
  if (notify) roomEvents.emit(ROOM_CHANGED, room);
}

function finish(room, notify) {
  timers.cancel(room.code);
  const game = getGame(room.game.id);
  const { state, roster, startedAt } = room.game;
  const results = state.results || { headline: 'Game over!', ranking: [] };
  const nameFor = (id) => roster.find((p) => p.id === id)?.name ?? 'Someone';
  room.lastResults = {
    gameId: game.meta.id,
    gameName: game.meta.name,
    headline: results.headline,
    ranking: (results.ranking || []).map((r) => ({ ...r, name: nameFor(r.playerId) })),
    highlights: results.highlights || [],
    reveal: results.reveal ?? null,
    endedEarly: Boolean(results.endedEarly),
    historyId: null,
  };
  room.status = 'results';
  room.game = null;
  if (notify) roomEvents.emit(ROOM_CHANGED, room);

  const summary = room.lastResults;
  saveMatch({
    roomCode: room.code,
    gameId: summary.gameId,
    gameName: summary.gameName,
    startedAt: new Date(startedAt),
    finishedAt: new Date(),
    headline: summary.headline,
    players: summary.ranking.map(({ name, score, rank, note }) => ({ name, score, rank, note })),
    highlights: summary.highlights,
  }).then((id) => {
    if (id && room.lastResults === summary) {
      summary.historyId = id;
      roomEvents.emit(ROOM_CHANGED, room);
    }
  });
}

export function stop(room) {
  timers.cancel(room.code);
  room.game = null;
}

// The per-player view: public state plus that player's private information.
export function viewFor(room, playerId) {
  if (room.status !== 'playing' || !room.game) return null;
  const game = getGame(room.game.id);
  const inGame = room.game.roster.some((p) => p.id === playerId);
  const view = game.view(room.game.state, playerId, context(room));
  return {
    id: room.game.id,
    phase: room.game.state.phase,
    // A game can hide its real deadline (e.g. when the music stops in
    // Freeze Dance) by putting its own `deadline` in the view.
    deadline: view && Object.hasOwn(view, 'deadline') ? view.deadline : (room.game.state.deadline ?? null),
    roster: room.game.roster,
    spectating: !inGame,
    view,
  };
}
