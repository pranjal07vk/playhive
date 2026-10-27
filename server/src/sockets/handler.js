import { AppError, toClientError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import * as roomService from '../services/roomService.js';

// Wraps an event handler with the parts every event needs: rate limiting,
// payload shape checks, looking up the room, and a { ok, error } acknowledgement.
export function makeHandler(socket, limiter, fn, { kind = 'normal' } = {}) {
  return (...args) => {
    // Clients may emit (event, ack) with no payload, so the ack is always the last function.
    const ack = typeof args[args.length - 1] === 'function' ? args.pop() : null;
    const payload = args[0] ?? undefined;
    const reply = ack || (() => {});
    try {
      if (!limiter(kind)) throw new AppError('RATE_LIMITED', 'Too many actions at once. Take a breath!');
      if (payload !== undefined && (typeof payload !== 'object' || Array.isArray(payload))) {
        throw new AppError('INVALID_PAYLOAD', 'That message was not in the expected format.');
      }
      const room = roomService.getRoom(socket.data.roomCode);
      if (!room.players.has(socket.data.playerId)) throw new AppError('NOT_IN_ROOM', 'You are no longer in this room.');
      fn(room, payload || {});
      reply({ ok: true });
    } catch (err) {
      if (!(err instanceof AppError)) logger.error('Socket handler failed:', err);
      const error = toClientError(err);
      reply({ ok: false, error });
      socket.emit('server:error', error);
    }
  };
}
