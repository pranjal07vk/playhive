import * as roomService from '../services/roomService.js';
import { listGames } from '../games/registry.js';
import { publicMeta } from '../games/baseGame.js';

const session = (room, player, token) => ({ roomCode: room.code, playerId: player.id, token });

export function listGamesHandler(req, res) {
  res.json({ ok: true, games: listGames().map(publicMeta) });
}

export function createRoom(req, res) {
  const { room, player, token } = roomService.createRoom(req.body);
  res.status(201).json({ ok: true, session: session(room, player, token), room: roomService.publicRoom(room) });
}

// What the join screen needs before a name is entered.
export function getRoom(req, res) {
  const room = roomService.getRoom(req.params.code);
  const info = roomService.publicRoom(room);
  let joinable = { ok: true };
  try {
    roomService.assertJoinable(room);
  } catch (err) {
    joinable = { ok: false, code: err.code, message: err.message };
  }
  res.json({
    ok: true,
    room: { code: info.code, gameId: info.gameId, status: info.status, capacity: info.capacity, playerCount: info.players.length, hostName: info.players.find((p) => p.isHost)?.name ?? null },
    joinable,
  });
}

export function joinRoom(req, res) {
  const { room, player, token } = roomService.joinRoom(req.params.code, req.body);
  res.status(201).json({ ok: true, session: session(room, player, token), room: roomService.publicRoom(room) });
}
