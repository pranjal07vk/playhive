import { Link } from 'react-router-dom';
import './GameCard.css';

export function GameCard({ game, index = 0, to }) {
  return (
    <Link
      to={to ?? `/create?game=${game.id}`}
      className={`game-card game-card-${game.accent}`}
      style={{ '--tilt': `${index % 2 ? 1.2 : -1.2}deg` }}
    >
      <span className="game-card-glyph" aria-hidden="true">{game.glyph}</span>
      <span className="game-card-vibe">{game.vibe}</span>
      <h3 className="game-card-name">{game.name}</h3>
      <p className="game-card-tag">{game.tagline}</p>
      <span className="game-card-foot">
        <span className="numeric">{game.players} players</span>
        <span className="game-card-go" aria-hidden="true">Play →</span>
      </span>
    </Link>
  );
}
