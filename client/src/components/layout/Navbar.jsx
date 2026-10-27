import { useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Logo } from '../common/Logo.jsx';
import './Navbar.css';

const LINKS = [
  { to: '/', label: 'Home', end: true },
  { to: '/games', label: 'Games' },
  { to: '/how-to-play', label: 'How to Play' },
  { to: '/about', label: 'About' },
];

export function Navbar() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const [lastPath, setLastPath] = useState(location.pathname);
  if (lastPath !== location.pathname) {
    setLastPath(location.pathname);
    setOpen(false);
  }

  return (
    <header className="nav">
      <div className="container nav-inner">
        <Logo />
        <button className="nav-toggle btn btn-ghost btn-sm" aria-expanded={open} aria-controls="nav-menu" onClick={() => setOpen((o) => !o)}>
          {open ? 'Close' : 'Menu'}
        </button>
        <nav id="nav-menu" className={`nav-menu ${open ? 'nav-menu-open' : ''}`} aria-label="Main">
          {LINKS.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} className="nav-link">
              {l.label}
            </NavLink>
          ))}
          <Link to="/join" className="btn btn-ghost btn-sm">Join</Link>
          <Link to="/create" className="btn btn-primary btn-sm">Create a Room</Link>
        </nav>
      </div>
    </header>
  );
}
