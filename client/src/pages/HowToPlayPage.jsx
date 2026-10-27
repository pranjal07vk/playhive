import { Link } from 'react-router-dom';
import { useGames } from '../features/games/useGames.js';
import { catalogEntry } from '../features/games/catalog.js';
import { LoadingState } from '../components/feedback/States.jsx';
import './ContentPage.css';

export default function HowToPlayPage() {
  const { games, error, reload } = useGames();
  return (
    <div className="container page">
      <header className="content-head">
        <p className="eyebrow">How to play</p>
        <h1>Rules, minus the arguments.</h1>
        <p className="muted content-lede">
          One person creates a room and becomes the host. Everyone else joins with the 5-character code or the invite link, on their own device. The host picks the game and settings and presses start. A voice or video call alongside makes every game better.
        </p>
      </header>

      {error && (
        <div className="card">
          <p>We could not load the rules from the server. <button className="btn btn-sm btn-marigold" onClick={reload}>Retry</button></p>
        </div>
      )}
      {!games && !error && <LoadingState label="Loading the rulebook…" />}
      <div className="rules-list">
        {games?.map((g) => {
          const visual = catalogEntry(g.id);
          return (
            <article key={g.id} id={g.id} className={`rule-card rule-${visual.accent}`}>
              <div className="row spread">
                <h2 className="rule-name"><span aria-hidden="true">{visual.glyph}</span> {g.name}</h2>
                <span className="badge badge-outline numeric">{g.minPlayers}–{g.maxPlayers} players · {g.duration}</span>
              </div>
              <ol>{g.howToPlay.map((step) => <li key={step}>{step}</li>)}</ol>
              <Link className="btn btn-sm btn-cream" to={`/create?game=${g.id}`}>Play {g.name}</Link>
            </article>
          );
        })}
      </div>
    </div>
  );
}
