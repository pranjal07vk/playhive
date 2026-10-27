import { Server } from 'socket.io';
import { corsOptions } from '../config/cors.js';
import * as roomService from '../services/roomService.js';
import * as engine from '../services/gameEngine.js';
import { roomEvents, ROOM_CHANGED, ROOM_CLOSED, ROOM_RELAY } from '../services/events.js';
import { authenticate } from './middleware/authenticate.js';
import { createEventLimiter } from './middleware/eventLimiter.js';
import { registerRoomEvents } from './roomSocket.js';
import { registerGameEvents } from './gameSocket.js';

const roomChannel = (code) => `room:${code}`;
const playerChannel = (id) => `player:${id}`;

export function stateFor(room, playerId) {
  return { room: roomService.publicRoom(room), game: engine.viewFor(room, playerId), you: playerId, serverNow: Date.now() };
}

export function createSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: corsOptions,
    maxHttpBufferSize: 64 * 1024,
    pingInterval: 20_000,
    pingTimeout: 20_000,
  });

  // Each player gets their own personalised state, because games hide
  // different things from different people (roles, cards, secret words).
  const broadcast = (room) => {
    for (const playerId of room.players.keys()) {
      io.to(playerChannel(playerId)).emit('room:state', stateFor(room, playerId));
    }
  };

  roomEvents.on(ROOM_CHANGED, broadcast);
  roomEvents.on(ROOM_CLOSED, (room, reason) => {
    io.to(roomChannel(room.code)).emit('room:closed', { reason });
    io.in(roomChannel(room.code)).disconnectSockets(true);
  });
  roomEvents.on(ROOM_RELAY, (room, fromId, { event, data }) => {
    io.to(roomChannel(room.code)).except(playerChannel(fromId)).emit(event, data);
  });

  io.use(authenticate);

  io.on('connection', (socket) => {
    const { roomCode, playerId } = socket.data;
    socket.join([roomChannel(roomCode), playerChannel(playerId)]);
    const room = roomService.findRoom(roomCode);
    roomService.setConnected(room, playerId, true);
    socket.emit('room:state', stateFor(room, playerId));

    const limiter = createEventLimiter();
    registerRoomEvents(io, socket, limiter);
    registerGameEvents(io, socket, limiter);

    socket.on('disconnect', async () => {
      const current = roomService.findRoom(roomCode);
      if (!current || socket.data.left) return;
      // A player can have the room open in two tabs; they only count as
      // offline once their last socket is gone.
      const stillHere = await io.in(playerChannel(playerId)).fetchSockets();
      if (stillHere.length === 0) roomService.setConnected(current, playerId, false);
    });
  });

  return io;
}
