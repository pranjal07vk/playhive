import { Link } from 'react-router-dom';
import { LogoMark } from '../common/Logo.jsx';
import './Footer.css';

export function Footer() {
  return (
    <footer className="footer">
      <div className="divider-scallop" />
      <div className="container footer-inner">
        <div className="stack" style={{ '--gap': '10px' }}>
          <div className="row">
            <LogoMark size={34} />
            <strong className="footer-brand">PlayHive</strong>
          </div>
          <p className="muted">Party games for friends in different hostels, cities and time zones. Built as an end-term MERN project.</p>
        </div>
        <nav className="footer-links" aria-label="Footer">
          <Link to="/games">All games</Link>
          <Link to="/how-to-play">How to play</Link>
          <Link to="/about">About the project</Link>
          <a href="https://github.com/pranjal07vk/playhive" target="_blank" rel="noreferrer">Source on GitHub</a>
        </nav>
      </div>
      <p className="container footer-fine muted">No sign-ups, no downloads. Game over, friendships intact?</p>
    </footer>
  );
}
