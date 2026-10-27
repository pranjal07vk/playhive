import { GAME_CATALOG } from '../features/games/catalog.js';
import { GameCard } from '../components/game/GameCard.jsx';
import { RangoliStar } from '../components/common/Decor.jsx';
import './ContentPage.css';

export default function GamesPage() {
  return (
    <div className="container page">
      <header className="content-head">
        <RangoliStar size={70} className="content-star" />
        <p className="eyebrow">All games</p>
        <h1>The whole shelf.</h1>
        <p className="muted content-lede">Pick one to create a room with it. You can switch games from the lobby any time.</p>
      </header>
      <div className="games-grid">
        {GAME_CATALOG.map((g, i) => <GameCard key={g.id} game={g} index={i} />)}
      </div>
    </div>
  );
}
