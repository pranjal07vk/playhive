import { createContext, useContext } from 'react';

export const RoomContext = createContext(null);

export function useRoom() {
  const room = useContext(RoomContext);
  if (!room) throw new Error('useRoom must be used inside a room page');
  return room;
}
