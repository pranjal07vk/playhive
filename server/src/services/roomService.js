import { AppError } from '../utils/errors.js';
import { generateRoomCode, normalizeRoomCode } from '../utils/roomCode.js';
import { cleanText } from '../utils/text.js';
import { createSession, tokenMatches } from './sessionService.js';
import { roomEvents, ROOM_CHANGED, ROOM_CLOSED } from './events.js';
import { getGame } from '../games/registry.js';
import { validateSettings } from '../games/baseGame.js';
import * as engine from './gameEngine.js';

/*
 * Active rooms live in memory. This keeps the real-time path fast and simple
 * for a single server, but it means rooms are lost on restart and the app
 * cannot be scaled to several instances without a shared store
 * (documented in docs/architecture.md).
 */
const rooms = new Map();

export const ABSOLUTE_MAX_PLAYERS = 20;
const HOST_GRACE_MS = 30_000;
const EMPTY_ROOM_TTL_MS = 10 * 60_000;
const IDLE_ROOM_TTL_MS = 3 * 60 * 60_000;
const AVATAR_COUNT = 12;

const changed = (room) => {
  room.lastActivity = Date.now();
  roomEvents.emit(ROOM_CHANGED, room);
};

export function validateName(raw) {
  const name = cleanText(raw, 20);
  if (name.length < 2) throw new AppError('INVALID_NAME', 'Pick a name with at least 2 characters.');
  return name;
}

function requireGame(gameId) {
  const game = getGame(gameId);
  if (!game) throw new AppError('UNKNOWN_GAME', 'That game is not available.');
  return game;
}

export function getRoom(rawCode) {
  const code = normalizeRoomCode(rawCode);
  if (!code) throw new AppError('INVALID_CODE', 'Room codes are 5 letters or numbers, like K7Q2M.', 400);
  const room = rooms.get(code);
  if (!room) throw new AppError('ROOM_NOT_FOUND', 'We could not find that room. Check the code with your host.', 404);
  return room;
}

export const findRoom = (code) => rooms.get(code);

function nextAvatar(room) {
  const used = new Set([...room.players.values()].map((p) => p.avatar));
  for (let i = 0; i < AVATAR_COUNT; i += 1) if (!used.has(i)) return i;
  return room.players.size % AVATAR_COUNT;
}

function addPlayer(room, name) {
  const session = createSession();
  const player = {
    id: session.playerId,
    name,
    tokenHash: session.tokenHash,
    avatar: nextAvatar(room),
    connected: false,
    ready: false,
    joinedAt: Date.now(),
    disconnectedAt: Date.now(),
  };
  room.players.set(player.id, player);
  return { player, token: session.token };
}

export function createRoom({ name, gameId, settings }) {
  const hostName = validateName(name);
  const game = requireGame(gameId);
  const code = generateRoomCode((c) => rooms.has(c));
  const room = {
    code,
    hostId: null,
    gameId: game.meta.id,
    settings: validateSettings(game.settings, settings),
    status: 'lobby',
    players: new Map(),
    game: null,
    lastResults: null,
    createdAt: Date.now(),
    lastActivity: Date.now(),
  };
  const { player, token } = addPlayer(room, hostName);
  room.hostId = player.id;
  rooms.set(code, room);
  return { room, player, token };
}

export function roomCapacity(room) {
  return Math.min(getGame(room.gameId).meta.maxPlayers, ABSOLUTE_MAX_PLAYERS);
}

// Checks that run before showing the join form, so people see
// "room is full" before typing their name.
export function assertJoinable(room) {
  if (room.status === 'playing') {
    throw new AppError('GAME_IN_PROGRESS', 'A game is already underway in this room. Ask the host to bring everyone back to the lobby.', 409);
  }
  if (room.players.size >= roomCapacity(room)) {
    throw new AppError('ROOM_FULL', 'This room is full. Ask the host to pick a bigger game or start a new room.', 409);
  }
}

export function joinRoom(rawCode, { name }) {
  const room = getRoom(rawCode);
  const playerName = validateName(name);
  assertJoinable(room);
  const taken = [...room.players.values()].some((p) => p.name.toLowerCase() === playerName.toLowerCase());
  if (taken) throw new AppError('NAME_TAKEN', `Someone in this room is already called ${playerName}. Try a nickname!`, 409);
  const { player, token } = addPlayer(room, playerName);
  changed(room);
  return { room, player, token };
}

export function authenticate(rawCode, playerId, token) {
  const room = getRoom(rawCode);
  const player = room.players.get(playerId);
  if (!player || !tokenMatches(token, player.tokenHash)) {
    throw new AppError('SESSION_INVALID', 'Your seat in this room has expired. Join again with the room code.', 401);
  }
  return { room, player };
}

export function setConnected(room, playerId, connected) {
  const player = room.players.get(playerId);
  if (!player || player.connected === connected) return;
  player.connected = connected;
  player.disconnectedAt = connected ? null : Date.now();
  if (!connected && room.hostId === playerId) {
    setTimeout(() => {
      if (rooms.get(room.code) === room && !player.connected && room.hostId === playerId) {
        transferHost(room);
        changed(room);
      }
    }, HOST_GRACE_MS).unref?.();
  }
  changed(room);
}

// Host goes to the longest-standing connected player, otherwise anyone left.
function transferHost(room) {
  const candidates = [...room.players.values()]
    .filter((p) => p.id !== room.hostId)
    .sort((a, b) => Number(b.connected) - Number(a.connected) || a.joinedAt - b.joinedAt);
  room.hostId = candidates[0]?.id ?? null;
}

function closeRoom(room, reason) {
  engine.stop(room);
  rooms.delete(room.code);
  roomEvents.emit(ROOM_CLOSED, room, reason);
}

export function leaveRoom(room, playerId) {
  if (!room.players.has(playerId)) return;
  room.players.delete(playerId);
  if (room.players.size === 0) return closeRoom(room, 'Everyone left the room.');
  if (room.hostId === playerId) transferHost(room);
  if (room.status === 'playing') engine.playerLeft(room, playerId);
  return changed(room);
}

export function requireHost(room, playerId) {
  if (room.hostId !== playerId) throw new AppError('HOST_ONLY', 'Only the host can do that.');
}

function requireLobby(room) {
  if (room.status === 'playing') throw new AppError('GAME_IN_PROGRESS', 'You cannot change this while a game is running.');
}

export function selectGame(room, playerId, gameId) {
  requireHost(room, playerId);
  requireLobby(room);
  const game = requireGame(gameId);
  room.gameId = game.meta.id;
  room.settings = validateSettings(game.settings, {});
  room.status = 'lobby';
  changed(room);
}

export function updateSettings(room, playerId, settings) {
  requireHost(room, playerId);
  requireLobby(room);
  room.settings = validateSettings(getGame(room.gameId).settings, { ...room.settings, ...settings });
  changed(room);
}

export function setReady(room, playerId, ready) {
  const player = room.players.get(playerId);
  if (!player) return;
  player.ready = Boolean(ready);
  changed(room);
}

export function kickPlayer(room, playerId, targetId) {
  requireHost(room, playerId);
  if (targetId === playerId) throw new AppError('INVALID_TARGET', 'You cannot remove yourself. Use Leave instead.');
  if (!room.players.has(targetId)) throw new AppError('INVALID_TARGET', 'That player is not in the room.');
  leaveRoom(room, targetId);
  return targetId;
}

export function startGame(room, playerId) {
  requireHost(room, playerId);
  if (room.status === 'playing') throw new AppError('GAME_IN_PROGRESS', 'A game is already running.');
  engine.start(room);
  changed(room);
}

export function returnToLobby(room, playerId) {
  requireHost(room, playerId);
  engine.stop(room);
  room.status = 'lobby';
  for (const p of room.players.values()) p.ready = false;
  changed(room);
}

export function publicRoom(room) {
  const game = getGame(room.gameId);
  return {
    code: room.code,
    hostId: room.hostId,
    gameId: room.gameId,
    settings: room.settings,
    status: room.status,
    capacity: roomCapacity(room),
    minPlayers: game.meta.minPlayers,
    players: [...room.players.values()]
      .sort((a, b) => a.joinedAt - b.joinedAt)
      .map(({ id, name, avatar, connected, ready }) => ({ id, name, avatar, connected, ready, isHost: id === room.hostId })),
    lastResults: room.lastResults,
  };
}

export function cleanupRooms(now = Date.now()) {
  for (const room of rooms.values()) {
    const everyoneGone = [...room.players.values()].every((p) => !p.connected && now - p.disconnectedAt > EMPTY_ROOM_TTL_MS);
    if (everyoneGone || now - room.lastActivity > IDLE_ROOM_TTL_MS) closeRoom(room, 'This room expired after a period of inactivity.');
  }
}

export const roomCount = () => rooms.size;

// Only for tests.
export const _resetRooms = () => {
  for (const room of rooms.values()) engine.stop(room);
  rooms.clear();
};
