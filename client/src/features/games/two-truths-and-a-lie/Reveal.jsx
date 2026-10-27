import { usePlayers } from '../shared/usePlayers.js';
import './View.css';

// Results screen: every storyteller's statements, with the lie marked.
export default function TwoTruthsReveal({ reveal }) {
  const { nameOf } = usePlayers();
  if (!reveal?.length) return null;
  return (
    <div className="ttl-reveal">
      <h3>The full case file</h3>
      {reveal.map((turn, i) => (
        <div key={i} className="ttl-reveal-item">
          <strong>{nameOf(turn.storytellerId)}</strong>
          <ol>
            {turn.statements.map((s, j) => (
              <li key={j} className={j === turn.lieIndex ? 'ttl-reveal-lie' : ''}>
                {s} {j === turn.lieIndex ? '🤥 (the lie)' : '✓'}
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}
