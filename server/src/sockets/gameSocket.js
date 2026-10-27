import * as engine from '../services/gameEngine.js';
import { AppError } from '../utils/errors.js';
import { makeHandler } from './handler.js';

const ACTION_TYPE = /^[a-zA-Z]{1,24}$/;

export function registerGameEvents(io, socket, limiter) {
  const me = () => socket.data.playerId;

  // All gameplay goes through one event: { type, payload }. The game module
  // decides whether the move is valid.
  const handleAction = (kind) =>
    makeHandler(socket, limiter, (room, { type, payload }) => {
      if (typeof type !== 'string' || !ACTION_TYPE.test(type)) throw new AppError('INVALID_PAYLOAD', 'Unknown move.');
      engine.dispatch(room, me(), type, payload);
    }, { kind });

  socket.on('game:action', handleAction('normal'));
  socket.on('game:draw', handleAction('draw'));
}
