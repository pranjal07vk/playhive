import * as roomService from '../../services/roomService.js';
import { toClientError } from '../../utils/errors.js';

// Every socket must prove which seat it holds before it can send anything.
export function authenticate(socket, next) {
  const { roomCode, playerId, token } = socket.handshake.auth || {};
  try {
    const { room, player } = roomService.authenticate(roomCode, playerId, token);
    socket.data.roomCode = room.code;
    socket.data.playerId = player.id;
    next();
  } catch (err) {
    const error = new Error(toClientError(err).message);
    error.data = toClientError(err);
    next(error);
  }
}
