import { catalogEntry } from '../../features/games/catalog.js';
import './GamePicker.css';

// A radio group styled as game tiles. Arrow keys move between options.
export function GamePicker({ games, value, onChange, playerCount, name = 'game' }) {
  return (
    <fieldset className="picker">
      <legend className="field-label">Choose a game</legend>
      <div className="picker-grid">
        {games.map((game) => {
          const visual = catalogEntry(game.id);
          const tooMany = playerCount && playerCount > game.maxPlayers;
          return (
            <label key={game.id} className={`picker-tile picker-${visual.accent} ${value === game.id ? 'picker-on' : ''}`}>
              <input type="radio" className="sr-only" name={name} value={game.id} checked={value === game.id} onChange={() => onChange(game.id)} />
              <span className="picker-glyph" aria-hidden="true">{visual.glyph}</span>
              <span className="picker-name">{game.name}</span>
              <span className="picker-meta numeric">
                {game.minPlayers}–{game.maxPlayers} players{tooMany ? ' · too many now' : ''}
              </span>
              {value === game.id && <span className="picker-check" aria-hidden="true">✓</span>}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
