import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useRoomConnection } from '../features/room/roomController.js';
import { RoomContext } from '../features/room/roomState.js';
import { catalogEntry } from '../features/games/catalog.js';
import { useToast } from '../components/feedback/Toast.jsx';
import { ConnectionBanner } from '../components/room/ConnectionBanner.jsx';
import { RoomTopBar } from '../components/room/RoomTopBar.jsx';
import { LobbyView } from '../components/room/LobbyView.jsx';
import { GameView } from '../components/game/GameView.jsx';
import { ResultsView } from '../components/game/ResultsView.jsx';
import { ErrorState, LoadingState } from '../components/feedback/States.jsx';

// One URL for the whole room. The server's room status decides whether
// players see the lobby, the game or the results, so everyone moves together.
export default function RoomPage() {
  const { code: rawCode } = useParams();
  const code = rawCode.toUpperCase();
  const navigate = useNavigate();
  const toast = useToast();
  const room = useRoomConnection(code, { onError: (e) => toast(e.message, 'error') });

  if (room.status === 'no-session') return <Navigate to={`/join/${code}`} replace />;

  if (room.status === 'closed') {
    return (
      <div className="container page">
        <ErrorState
          title="This room has closed."
          message={room.closedReason || 'The connection to the room ended.'}
          action={
            <>
              <Link className="btn btn-marigold" to="/create">Start a new room</Link>
              <Link className="btn btn-ghost" to="/">Home</Link>
            </>
          }
        />
      </div>
    );
  }

  if (!room.state) return <div className="container page"><LoadingState label="Finding your seat…" /></div>;

  const leave = async () => {
    await room.leave();
    navigate('/');
  };
  const status = room.state.room.status;
  const gameName = catalogEntry(room.state.room.gameId).name;

  return (
    <RoomContext.Provider value={room}>
      <ConnectionBanner status={room.status} />
      <RoomTopBar code={code} title={status === 'lobby' ? 'Lobby' : gameName} onLeave={leave} />
      <main id="main">
        {status === 'lobby' && <LobbyView onLeave={leave} />}
        {status === 'playing' && room.state.game && <GameView />}
        {status === 'results' && room.state.room.lastResults && <ResultsView onLeave={leave} />}
      </main>
    </RoomContext.Provider>
  );
}
