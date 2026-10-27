import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { connectToRoom, emitWithAck } from '../../services/socketClient.js';
import { sessionService } from '../../services/sessionService.js';

/*
 * Owns the live connection to one room. Components never talk to Socket.IO
 * directly; they read `state` and call the action functions returned here.
 * The server is the source of truth: every action is a request, and the
 * screen only changes when the next room:state arrives.
 */
export function useRoomConnection(code, { onError } = {}) {
  const [session] = useState(() => sessionService.get(code));
  const [state, setState] = useState(null);
  const [status, setStatus] = useState(session ? 'connecting' : 'no-session');
  const [closedReason, setClosedReason] = useState(null);
  const [clockOffset, setClockOffset] = useState(0);
  const socketRef = useRef(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    if (!session) return undefined;
    const socket = connectToRoom(session);
    socketRef.current = socket;

    socket.on('connect', () => setStatus('connected'));
    socket.on('disconnect', (reason) => {
      // "io server disconnect" means the server closed us on purpose.
      setStatus(reason === 'io server disconnect' ? 'closed' : 'reconnecting');
    });
    socket.io.on('reconnect_attempt', () => setStatus('reconnecting'));
    socket.on('connect_error', (err) => {
      if (err.data?.code === 'SESSION_INVALID' || err.data?.code === 'ROOM_NOT_FOUND') {
        sessionService.clear(code);
        setClosedReason(err.data.message);
        setStatus('closed');
        socket.disconnect();
      } else {
        setStatus('reconnecting');
      }
    });
    socket.on('room:state', (next) => {
      setClockOffset(next.serverNow - Date.now());
      setState(next);
    });
    socket.on('room:closed', ({ reason }) => {
      sessionService.clear(code);
      setClosedReason(reason);
      setStatus('closed');
    });
    socket.on('server:error', (error) => onErrorRef.current?.(error));

    return () => {
      socket.removeAllListeners();
      socket.io.removeAllListeners();
      socket.disconnect();
    };
  }, [code, session]);

  const emit = useCallback(async (event, payload) => {
    // server:error already reports failures as a toast, so callers only
    // need the result when they want to react to it.
    return emitWithAck(socketRef.current, event, payload);
  }, []);

  const actions = useMemo(
    () => ({
      emit,
      act: (type, payload) => emit('game:action', { type, payload }),
      draw: (type, payload) => {
        // Strokes are fire-and-forget: no ack keeps drawing smooth.
        socketRef.current?.emit('game:draw', { type, payload });
      },
      selectGame: (gameId) => emit('room:select-game', { gameId }),
      updateSettings: (settings) => emit('room:update-settings', { settings }),
      setReady: (ready) => emit('room:ready', { ready }),
      startGame: () => emit('room:start-game'),
      returnToLobby: () => emit('room:return-lobby'),
      kick: (playerId) => emit('room:kick', { playerId }),
      leave: async () => {
        await emit('room:leave');
        sessionService.clear(code);
      },
      subscribe: (event, handler) => {
        const socket = socketRef.current;
        socket?.on(event, handler);
        return () => socket?.off(event, handler);
      },
    }),
    [code, emit],
  );

  const me = state?.room.players.find((p) => p.id === state.you) ?? null;
  return {
    session,
    state,
    status,
    closedReason,
    me,
    isHost: Boolean(me && state.room.hostId === me.id),
    serverNow: () => Date.now() + clockOffset,
    ...actions,
  };
}
