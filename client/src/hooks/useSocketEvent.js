import { useEffect, useRef } from 'react';
import { useRoom } from './useRoom.js';

// Subscribe to a relayed event (e.g. live drawing strokes) for the
// lifetime of a component.
export function useSocketEvent(event, handler) {
  const { subscribe, status } = useRoom();
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => subscribe(event, (data) => ref.current(data)), [event, subscribe, status]);
}
