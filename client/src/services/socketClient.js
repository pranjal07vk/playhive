import { io } from 'socket.io-client';
import { API_URL } from './apiClient.js';

export function connectToRoom(session) {
  return io(API_URL, {
    auth: { roomCode: session.roomCode, playerId: session.playerId, token: session.token },
    transports: ['websocket', 'polling'],
    reconnectionDelay: 800,
    reconnectionDelayMax: 5000,
    timeout: 15000,
  });
}

// Emits with an acknowledgement and turns it into a promise.
export function emitWithAck(socket, event, payload, timeout = 8000) {
  return new Promise((resolve) => {
    if (!socket?.connected) {
      resolve({ ok: false, error: { code: 'OFFLINE', message: 'You are offline. Reconnecting…' } });
      return;
    }
    socket.timeout(timeout).emit(event, payload ?? {}, (err, response) => {
      if (err) resolve({ ok: false, error: { code: 'TIMEOUT', message: 'The server took too long to answer. Try again.' } });
      else resolve(response);
    });
  });
}
