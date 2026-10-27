import { createServer } from 'node:http';
import { io as connect } from 'socket.io-client';
import { createApp } from '../src/app.js';
import { createSocketServer } from '../src/sockets/index.js';

export async function startTestServer() {
  const httpServer = createServer(createApp());
  const io = createSocketServer(httpServer);
  await new Promise((resolve) => httpServer.listen(0, resolve));
  const url = `http://localhost:${httpServer.address().port}`;
  const sockets = [];

  const api = async (path, body) => {
    const res = await fetch(url + path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
    return { status: res.status, body: await res.json() };
  };

  // Connects a player and resolves once their first room:state arrives.
  const join = (session) =>
    new Promise((resolve, reject) => {
      const socket = connect(url, { auth: session, transports: ['websocket'], forceNew: true });
      sockets.push(socket);
      const client = { socket, state: null, errors: [] };
      socket.on('room:state', (s) => {
        client.state = s;
        resolve(client);
      });
      socket.on('server:error', (e) => client.errors.push(e));
      socket.on('connect_error', reject);
    });

  const emit = (client, event, payload) => new Promise((resolve) => client.socket.emit(event, payload, resolve));
  const act = (client, type, payload) => emit(client, 'game:action', { type, payload });

  // Wait until a client's latest state satisfies a predicate.
  const until = (client, predicate, timeout = 2000) =>
    new Promise((resolve, reject) => {
      if (client.state && predicate(client.state)) return resolve(client.state);
      const timer = setTimeout(() => reject(new Error('Timed out waiting for state')), timeout);
      const check = (s) => {
        if (predicate(s)) {
          clearTimeout(timer);
          client.socket.off('room:state', check);
          resolve(s);
        }
      };
      client.socket.on('room:state', check);
    });

  const close = async () => {
    sockets.forEach((s) => s.disconnect());
    io.close();
    await new Promise((resolve) => httpServer.close(resolve));
  };

  return { url, api, join, emit, act, until, close };
}
