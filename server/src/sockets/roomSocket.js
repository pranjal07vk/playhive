import * as roomService from '../services/roomService.js';
import { makeHandler } from './handler.js';

export function registerRoomEvents(io, socket, limiter) {
  const me = () => socket.data.playerId;
  const on = (event, fn) => socket.on(event, makeHandler(socket, limiter, fn));

  on('room:select-game', (room, { gameId }) => roomService.selectGame(room, me(), gameId));
  on('room:update-settings', (room, { settings }) => roomService.updateSettings(room, me(), settings || {}));
  on('room:ready', (room, { ready }) => roomService.setReady(room, me(), ready));
  on('room:start-game', (room) => roomService.startGame(room, me()));
  on('room:return-lobby', (room) => roomService.returnToLobby(room, me()));
  on('room:kick', (room, { playerId }) => {
    const target = roomService.kickPlayer(room, me(), playerId);
    io.to(`player:${target}`).emit('room:closed', { reason: 'The host removed you from the room.' });
    io.in(`player:${target}`).disconnectSockets(true);
  });
  on('room:leave', (room) => {
    roomService.leaveRoom(room, me());
    socket.data.left = true;
    // Let the acknowledgement reach the client before closing the socket.
    setTimeout(() => socket.disconnect(true), 100);
  });
}
