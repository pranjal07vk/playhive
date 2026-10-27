// One Colour Clash card. The colour is always spelled out as text too,
// so nobody needs to tell red from green by hue alone.
export const COLOR_NAMES = { red: 'Red', yellow: 'Yellow', green: 'Green', blue: 'Blue' };
const GLYPH = { skip: '⊘', reverse: '⇄', draw2: '+2', wild: 'WILD', wild4: '+4' };
const SPOKEN = { skip: 'Skip', reverse: 'Reverse', draw2: 'Draw Two', wild: 'Wild', wild4: 'Wild Draw Four' };

export const glyphOf = (card) => GLYPH[card.value] ?? card.value;
export const cardLabel = (card) => (card.color ? `${COLOR_NAMES[card.color]} ${SPOKEN[card.value] ?? card.value}` : SPOKEN[card.value]);

export function Card({ card, size = 'md', as: Tag = 'div', className = '', ...rest }) {
  const color = card.color ?? 'wild';
  return (
    <Tag className={`uno-card uno-card-${color} uno-card-${size} ${className}`} {...rest}>
      <span className="uno-card-corner" aria-hidden="true">{glyphOf(card)}</span>
      <span className="uno-card-oval" aria-hidden="true">
        <span className={`uno-card-glyph ${glyphOf(card).length > 2 ? 'uno-card-glyph-word' : ''}`}>{glyphOf(card)}</span>
      </span>
      <span className="uno-card-colour" aria-hidden="true">{card.color ? COLOR_NAMES[card.color] : card.value === 'wild4' ? 'WILD' : 'ANY'}</span>
      <span className="sr-only">{cardLabel(card)}</span>
    </Tag>
  );
}

export function CardBack({ size = 'sm' }) {
  return (
    <span className={`uno-card uno-back uno-card-${size}`} aria-hidden="true">
      <span className="uno-back-mark">CC</span>
    </span>
  );
}
