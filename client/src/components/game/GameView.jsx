import { Component, Suspense, useState } from 'react';
import { useRoom } from '../../hooks/useRoom.js';
import { getGameView } from '../../features/games/gameRegistry.js';
import { catalogEntry } from '../../features/games/catalog.js';
import { LoadingState, ErrorState } from '../feedback/States.jsx';
import { Scoreboard } from '../../features/games/shared/components.jsx';
import './GameView.css';

// A crash inside one game's screen must not take down the room connection.
class GameErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) {
      return <ErrorState title="This screen tripped over." message="Your seat is safe. Reload the page to rejoin the game." action={<button className="btn btn-marigold" onClick={() => window.location.reload()}>Reload</button>} />;
    }
    return this.props.children;
  }
}

export function GameView() {
  const { state, isHost, returnToLobby } = useRoom();
  const [confirmEnd, setConfirmEnd] = useState(false);
  const game = state.game;
  const visual = catalogEntry(game.id);
  const View = getGameView(game.id);
  const scores = game.view?.scores;

  return (
    <div className={`container game game-${visual.accent}`}>
      <div className="game-grid">
        <section className="game-stage" aria-label={`${visual.name} game`}>
          <GameErrorBoundary>
            <Suspense fallback={<LoadingState label="Setting the stage…" />}>
              {View ? <View game={game} /> : <ErrorState title="This game is not ready yet." message="Ask the host to return to the lobby and pick another game." />}
            </Suspense>
          </GameErrorBoundary>
        </section>

        <aside className="game-side stack" style={{ '--gap': '16px' }}>
          {scores && <Scoreboard scores={scores} />}
          {game.spectating && <p className="card muted">You joined after this game started, so you are watching this round.</p>}
          {isHost && (
            <div className="game-host card">
              <p className="eyebrow">Host controls</p>
              {confirmEnd ? (
                <div className="row">
                  <button className="btn btn-primary btn-sm" onClick={returnToLobby}>Yes, end game</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setConfirmEnd(false)}>Keep playing</button>
                </div>
              ) : (
                <button className="btn btn-ghost btn-sm" onClick={() => setConfirmEnd(true)}>End game & return to lobby</button>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
