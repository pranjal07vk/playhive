import { ChainStrip } from './ChainStrip.jsx';
import './View.css';

// Every chain on the results screen, compact.
export default function TelephoneReveal({ reveal }) {
  if (!reveal?.chains?.length) return null;
  return (
    <div className="stack" style={{ '--gap': '16px' }}>
      <h3>Every chain, start to finish</h3>
      <div className="tel-reveal-grid">
        {reveal.chains.map((chain) => (
          <section key={chain.ownerId} className="card tel-reveal-card">
            <p className="eyebrow">{chain.ownerName}'s chain</p>
            <ChainStrip chain={chain} compact />
          </section>
        ))}
      </div>
    </div>
  );
}
