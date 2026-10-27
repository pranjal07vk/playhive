import { EventEmitter } from 'node:events';

// The service layer announces "this room changed" and the socket layer
// decides who receives which view. Services never import Socket.IO.
export const roomEvents = new EventEmitter();
roomEvents.setMaxListeners(50);

export const ROOM_CHANGED = 'room:changed';
export const ROOM_CLOSED = 'room:closed';
export const ROOM_RELAY = 'room:relay';
