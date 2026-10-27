import { Link } from 'react-router-dom';
import { Marigold } from '../components/common/Decor.jsx';
import './ContentPage.css';

const STACK = [
  ['React + Vite', 'The interface: pages, components and hooks.'],
  ['Socket.IO', 'Live two-way connection for lobby and gameplay events.'],
  ['Node.js + Express', 'The REST API for creating, checking and joining rooms.'],
  ['MongoDB + Mongoose', 'Stores finished match summaries.'],
];

export default function AboutPage() {
  return (
    <div className="container page about">
      <header className="content-head">
        <Marigold size={64} className="content-star" />
        <p className="eyebrow">About PlayHive</p>
        <h1>Game night, without the commute.</h1>
        <p className="content-lede">
          Friends end up in different hostels, cities and countries. PlayHive makes it easy to gather them for a game night anyway: no accounts, no downloads, just a room code.
        </p>
      </header>

      <section className="about-grid">
        <div className="card card-sticker stack">
          <h2 className="about-h">How it stays fair</h2>
          <p className="muted">
            The server is the referee. It deals cards, assigns secret roles, runs every timer and checks every move. Each player's device only receives what that player is allowed to see, so nobody can peek at a secret word or someone else's hand from their browser.
          </p>
          <p className="muted">
            Some games happen in the real world (charades, freeze dance, sardines). PlayHive does not pretend to see you; players or the host record what happened.
          </p>
        </div>
        <div className="card stack">
          <h2 className="about-h">Built with</h2>
          <ul className="about-stack">
            {STACK.map(([name, role]) => (
              <li key={name}><strong>{name}</strong><span className="muted">{role}</span></li>
            ))}
          </ul>
          <a href="https://github.com/pranjal07vk/playhive" target="_blank" rel="noreferrer">Read the source and architecture notes on GitHub →</a>
        </div>
      </section>

      <div className="row" style={{ justifyContent: 'center', marginTop: 40 }}>
        <Link to="/create" className="btn btn-primary btn-lg">Create a Room</Link>
      </div>
    </div>
  );
}
