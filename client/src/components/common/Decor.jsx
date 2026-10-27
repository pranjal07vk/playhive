// Original decorative motifs: a marigold, a rangoli star, sparkles and a
// jharokha-style arch. All are aria-hidden; they carry no meaning.

export function Marigold({ size = 64, color = 'var(--marigold)', center = 'var(--gulal)', className = '', style }) {
  const petals = Array.from({ length: 12 }, (_, i) => i * 30);
  return (
    <svg className={className} style={style} width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      {petals.map((deg) => (
        <ellipse key={deg} cx="50" cy="24" rx="11" ry="22" fill={color} stroke="var(--bg-deep)" strokeWidth="2.5" transform={`rotate(${deg} 50 50)`} />
      ))}
      {petals.map((deg) => (
        <ellipse key={`i${deg}`} cx="50" cy="34" rx="7" ry="13" fill="var(--marigold-soft)" transform={`rotate(${deg + 15} 50 50)`} />
      ))}
      <circle cx="50" cy="50" r="12" fill={center} stroke="var(--bg-deep)" strokeWidth="2.5" />
    </svg>
  );
}

export function RangoliStar({ size = 80, className = '', style }) {
  return (
    <svg className={className} style={style} width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <g stroke="var(--bg-deep)" strokeWidth="2.5" strokeLinejoin="round">
        <path d="M50 4 L60 40 L96 50 L60 60 L50 96 L40 60 L4 50 L40 40 Z" fill="var(--peacock)" />
        <path d="M50 22 L56 44 L78 50 L56 56 L50 78 L44 56 L22 50 L44 44 Z" fill="var(--cream)" />
        <circle cx="50" cy="50" r="7" fill="var(--gulal)" />
      </g>
      {[0, 90, 180, 270].map((d) => (
        <circle key={d} cx="50" cy="12" r="3.5" fill="var(--marigold)" transform={`rotate(${d + 45} 50 50)`} />
      ))}
    </svg>
  );
}

export function Sparkle({ size = 28, color = 'var(--cream)', className = '', style }) {
  return (
    <svg className={className} style={style} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 0c1 6.5 5.5 11 12 12-6.5 1-11 5.5-12 12-1-6.5-5.5-11-12-12C6.5 11 11 6.5 12 0z" fill={color} />
    </svg>
  );
}

export function Arch({ className = '', style, color = 'var(--gulal)' }) {
  return (
    <svg className={className} style={style} viewBox="0 0 200 240" preserveAspectRatio="none" aria-hidden="true">
      <path d="M10 240 V100 C10 60 40 40 60 34 C80 28 92 14 100 4 C108 14 120 28 140 34 C160 40 190 60 190 100 V240 Z" fill={color} stroke="var(--bg-deep)" strokeWidth="5" />
    </svg>
  );
}

export function Squiggle({ className = '', style, color = 'var(--marigold)' }) {
  return (
    <svg className={className} style={style} viewBox="0 0 120 20" aria-hidden="true">
      <path d="M2 10 Q12 0 22 10 T42 10 T62 10 T82 10 T102 10 T118 10" fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}
