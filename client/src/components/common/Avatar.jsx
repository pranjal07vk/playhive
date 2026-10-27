import { AVATAR_COLORS, AVATAR_GLYPHS } from '../../utils/format.js';
import './Avatar.css';

export function Avatar({ player, size = 52, ring = false }) {
  const color = AVATAR_COLORS[player.avatar % AVATAR_COLORS.length];
  return (
    <span
      className={`avatar ${ring ? 'avatar-ring' : ''} ${player.connected === false ? 'avatar-away' : ''}`}
      style={{ '--size': `${size}px`, '--avatar': color }}
      aria-hidden="true"
    >
      <span className="avatar-glyph">{AVATAR_GLYPHS[player.avatar % AVATAR_GLYPHS.length]}</span>
    </span>
  );
}
