import { Link } from 'react-router-dom';
import './Logo.css';

export function LogoMark({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <path d="M32 4l24 13.8v28.4L32 60 8 46.2V17.8z" fill="var(--marigold)" stroke="var(--bg-deep)" strokeWidth="3" />
      <path d="M32 16l13.5 7.8v15.6L32 47.2l-13.5-7.8V23.8z" fill="var(--gulal)" stroke="var(--bg-deep)" strokeWidth="3" />
      <circle cx="32" cy="31.5" r="5" fill="var(--cream)" stroke="var(--bg-deep)" strokeWidth="2.5" />
    </svg>
  );
}

export function Logo() {
  return (
    <Link to="/" className="logo" aria-label="PlayHive home">
      <LogoMark />
      <span className="logo-word">
        Play<span className="logo-hive">Hive</span>
      </span>
    </Link>
  );
}
