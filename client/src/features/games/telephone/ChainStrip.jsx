import { DrawingCanvas } from '../pictionary/DrawingCanvas.jsx';

// One chain as a vertical story strip: text bubbles and drawings alternate sides.
export function ChainStrip({ chain, compact = false }) {
  return (
    <ol className={`tel-strip ${compact ? 'tel-strip-compact' : ''}`} aria-label={`${chain.ownerName}'s chain`}>
      {chain.entries.map((e, i) => (
        <li key={i} className={`tel-entry ${i % 2 ? 'tel-entry-right' : ''}`}>
          <span className="tel-author">{i === 0 ? 'Started by' : e.kind === 'drawing' ? 'Drawn by' : 'Described by'} {e.authorName}</span>
          {e.kind === 'drawing' ? (
            e.strokes.length ? <div className="tel-drawing"><DrawingCanvas strokes={e.strokes} compact label={`Drawing by ${e.authorName}`} /></div>
              : <p className="tel-bubble tel-missing">(blank page{e.missing ? ': they ran out of time' : ''})</p>
          ) : (
            <p className={`tel-bubble ${e.missing ? 'tel-missing' : ''}`}>{e.text}</p>
          )}
        </li>
      ))}
    </ol>
  );
}
