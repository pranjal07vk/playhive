import { useMemo } from 'react';
import { useRoom } from '../../../hooks/useRoom.js';

// Look up any player in the current game by id: name from the game roster
// (so people who left still have names), avatar and status from the room.
export function usePlayers() {
  const { state } = useRoom();
  return useMemo(() => {
    const live = new Map(state.room.players.map((p) => [p.id, p]));
    const roster = state.game?.roster ?? state.room.players;
    const byId = (id) => {
      const fromRoster = roster.find((p) => p.id === id);
      const fromRoom = live.get(id);
      return { id, name: fromRoster?.name ?? fromRoom?.name ?? 'Someone', avatar: fromRoom?.avatar ?? 0, connected: fromRoom?.connected ?? false, left: !fromRoom };
    };
    return { meId: state.you, hostId: state.room.hostId, roster: roster.map((p) => byId(p.id)), byId, nameOf: (id) => byId(id).name };
  }, [state.room, state.game?.roster, state.you]);
}
