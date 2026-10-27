import { Avatar } from '../common/Avatar.jsx';
import './PlayerList.css';

export function PlayerList({ players, meId, isHost, onKick, showReady = true }) {
  return (
    <ul className="players" aria-label="Players in this room">
      {players.map((p) => (
        <li key={p.id} className={`player anim-pop ${p.connected ? '' : 'player-away'}`}>
          <Avatar player={p} size={46} />
          <div className="player-text">
            <span className="player-name">
              {p.name}
              {p.id === meId && <span className="player-you"> (you)</span>}
            </span>
            <span className="player-status">
              <span className={`dot ${p.connected ? 'dot-on' : 'dot-off'}`} aria-hidden="true" />
              {p.connected ? 'Online' : 'Reconnecting…'}
              {showReady && !p.isHost && p.ready && <span className="player-ready"> · Ready ✓</span>}
            </span>
          </div>
          {p.isHost && <span className="badge badge-tilt">👑 Host</span>}
          {isHost && !p.isHost && onKick && (
            <button className="btn btn-ghost btn-sm player-kick" onClick={() => onKick(p)} aria-label={`Remove ${p.name} from the room`}>
              Remove
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
