import { useGameTimer } from '../../hooks/useGameTimer.js';
import './Countdown.css';

// A ring that empties as the server deadline approaches.
export function Countdown({ deadline, total, label = 'seconds left' }) {
  const left = useGameTimer(deadline);
  if (left === null) return null;
  const fraction = total ? Math.min(1, left / total) : 1;
  const urgent = left <= 5;
  return (
    <div className={`countdown ${urgent ? 'countdown-urgent' : ''}`} role="timer" aria-label={`${left} ${label}`}>
      <svg viewBox="0 0 44 44" aria-hidden="true">
        <circle cx="22" cy="22" r="19" className="countdown-track" />
        <circle cx="22" cy="22" r="19" className="countdown-fill" style={{ strokeDashoffset: `${119.4 * (1 - fraction)}` }} />
      </svg>
      <span key={left} className="countdown-num numeric">{left}</span>
    </div>
  );
}
