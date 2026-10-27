import { useRoom } from '../../../hooks/useRoom.js';
import { Avatar } from '../../../components/common/Avatar.jsx';
import { Countdown } from '../../../components/game/Countdown.jsx';
import { usePlayers } from './usePlayers.js';
import './components.css';

/* Building blocks shared by the game views. Each game composes these
   with its own stage, so games share behaviour without looking identical. */

export function GameHud({ kicker, title, deadline, total, children }) {
  return (
    <div className="hud">
      <div className="hud-text">
        {kicker && <p className="eyebrow">{kicker}</p>}
        <h2 className="hud-title">{title}</h2>
        {children}
      </div>
      {deadline && <Countdown deadline={deadline} total={total} />}
    </div>
  );
}

export function StageCard({ tone = 'paper', kicker, children, className = '' }) {
  return (
    <div className={`stage-card stage-${tone} ${className}`}>
      {kicker && <span className="stage-kicker">{kicker}</span>}
      {children}
    </div>
  );
}

export function TurnBanner({ playerId, mine, theirs }) {
  const { meId, nameOf, byId } = usePlayers();
  const isMe = playerId === meId;
  return (
    <div className={`turn-banner ${isMe ? 'turn-banner-me' : ''}`} aria-live="polite">
      <Avatar player={byId(playerId)} size={40} ring={isMe} />
      <span>{isMe ? mine : theirs.replace('{name}', nameOf(playerId))}</span>
    </div>
  );
}

export function ChoiceButtons({ options, value, onChoose, disabled, tally, columns = 2 }) {
  const total = tally ? tally.reduce((a, b) => a + b, 0) : 0;
  return (
    <div className="choices" style={{ '--cols': columns }} role="group">
      {options.map((option, i) => {
        const selected = value === option.value;
        const pct = tally && total ? Math.round((tally[i] / total) * 100) : 0;
        return (
          <button
            key={String(option.value)}
            className={`choice choice-${i % 4} ${selected ? 'choice-on' : ''}`}
            aria-pressed={selected}
            disabled={disabled && !selected}
            onClick={() => onChoose(option.value)}
          >
            {tally && <span className="choice-fill" style={{ width: `${pct}%` }} aria-hidden="true" />}
            <span className="choice-label">{option.label}</span>
            {tally && <span className="choice-pct numeric">{pct}% · {tally[i]}</span>}
            {selected && !tally && <span className="choice-tick" aria-hidden="true">✓</span>}
          </button>
        );
      })}
    </div>
  );
}

export function WaitingOn({ ids, label = 'Waiting on' }) {
  const { nameOf } = usePlayers();
  if (!ids?.length) return null;
  return (
    <p className="waiting muted" aria-live="polite">
      {label}: {ids.map(nameOf).join(', ')}
    </p>
  );
}

export function PlayerChips({ ids, marked = [], label }) {
  const { byId, meId } = usePlayers();
  return (
    <ul className="chips" aria-label={label}>
      {ids.map((id) => {
        const p = byId(id);
        return (
          <li key={id} className={`chip ${marked.includes(id) ? 'chip-on' : ''} ${p.connected ? '' : 'chip-away'}`}>
            <Avatar player={p} size={26} />
            <span>{p.name}{id === meId ? ' (you)' : ''}</span>
            {marked.includes(id) && <span className="sr-only"> (done)</span>}
            {marked.includes(id) && <span aria-hidden="true">✓</span>}
          </li>
        );
      })}
    </ul>
  );
}

export function Scoreboard({ scores, title = 'Scores', notes = {} }) {
  const { byId, meId } = usePlayers();
  if (!scores) return null;
  const rows = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  return (
    <section className="scoreboard" aria-label={title}>
      <h3 className="scoreboard-title">{title}</h3>
      <ol>
        {rows.map(([id, score]) => {
          const p = byId(id);
          return (
            <li key={id} className={id === meId ? 'scoreboard-me' : ''}>
              <Avatar player={p} size={28} />
              <span className="scoreboard-name">{p.name}{p.left ? ' (left)' : ''}</span>
              {notes[id] && <span className="scoreboard-note muted">{notes[id]}</span>}
              <span key={score} className="scoreboard-score numeric">{score}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// Only the host sees the button; everyone else sees who they are waiting for.
export function HostButton({ children, onClick, className = 'btn btn-marigold', waitingText = 'Waiting for the host to continue…' }) {
  const { isHost } = useRoom();
  if (!isHost) return <p className="muted center">{waitingText}</p>;
  return <button className={className} onClick={onClick}>{children}</button>;
}
