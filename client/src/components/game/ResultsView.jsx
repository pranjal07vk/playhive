import { Suspense, useEffect } from 'react';
import confetti from 'canvas-confetti';
import { useRoom } from '../../hooks/useRoom.js';
import { getGameReveal } from '../../features/games/gameRegistry.js';
import { catalogEntry } from '../../features/games/catalog.js';
import { Avatar } from '../common/Avatar.jsx';
import { Marigold, Sparkle } from '../common/Decor.jsx';
import './ResultsView.css';

const COLORS = ['#FF9F00', '#E60067', '#00B4D8', '#38B000', '#FFF4E0'];

export function ResultsView({ onLeave }) {
  const { state, isHost, startGame, returnToLobby } = useRoom();
  const results = state.room.lastResults;
  const visual = catalogEntry(results.gameId);
  const Reveal = getGameReveal(results.gameId);
  const players = new Map(state.room.players.map((p) => [p.id, p]));
  const podium = results.ranking.filter((r) => r.rank === 1);
  const scored = results.ranking.some((r) => r.score > 0);

  useEffect(() => {
    if (results.endedEarly || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    confetti({ particleCount: 140, spread: 80, origin: { y: 0.35 }, colors: COLORS, disableForReducedMotion: true });
  }, [results]);

  return (
    <div className="container results">
      <header className="results-hero">
        <Marigold size={70} className="results-flower" />
        <Sparkle size={30} className="results-sparkle" color="var(--peacock)" />
        <p className="eyebrow">{visual.glyph} {results.gameName} · {results.endedEarly ? 'Ended early' : 'Final results'}</p>
        <h1 className="results-title">{results.headline}</h1>
      </header>

      {scored && podium.length > 0 && (
        <div className="podium">
          {podium.map((r) => (
            <div key={r.playerId} className="podium-spot anim-pop">
              <Avatar player={players.get(r.playerId) ?? { avatar: 0 }} size={84} />
              <span className="podium-crown" aria-hidden="true">👑</span>
              <strong>{r.name}</strong>
              <span className="numeric">{r.score} pts</span>
            </div>
          ))}
        </div>
      )}

      <div className="results-grid">
        {results.ranking.length > 0 && (
          <section className="card" aria-labelledby="ranking-heading">
            <h2 id="ranking-heading" className="results-h">Leaderboard</h2>
            <ol className="ranking">
              {results.ranking.map((r) => (
                <li key={r.playerId} className={r.playerId === state.you ? 'ranking-me' : ''}>
                  <span className="ranking-rank numeric">#{r.rank}</span>
                  <Avatar player={players.get(r.playerId) ?? { avatar: 0, connected: false }} size={34} />
                  <span className="ranking-name">{r.name}{r.note ? <span className="muted"> · {r.note}</span> : null}</span>
                  {scored && <span className="ranking-score numeric">{r.score}</span>}
                </li>
              ))}
            </ol>
          </section>
        )}

        {results.highlights.length > 0 && (
          <section className="card" aria-labelledby="highlights-heading">
            <h2 id="highlights-heading" className="results-h">Highlights</h2>
            <ul className="highlights">
              {results.highlights.map((h) => <li key={h}>{h}</li>)}
            </ul>
          </section>
        )}
      </div>

      {Reveal && results.reveal && (
        <section className="results-reveal">
          <Suspense fallback={null}><Reveal reveal={results.reveal} /></Suspense>
        </section>
      )}

      {results.historyId && <p className="muted center results-saved">Saved to match history · ID {results.historyId.slice(-6)}</p>}

      <section className="results-actions card card-sticker">
        {isHost ? (
          <>
            <p className="results-h">Game over. Friendships intact?</p>
            <div className="row">
              <button className="btn btn-primary btn-lg" onClick={startGame}>Rematch</button>
              <button className="btn btn-cream" onClick={returnToLobby}>Choose another game</button>
            </div>
          </>
        ) : (
          <>
            <p className="results-h">Waiting for the host to pick a rematch or a new game…</p>
          </>
        )}
        <button className="btn btn-ghost" onClick={onLeave}>Leave room</button>
      </section>
    </div>
  );
}
