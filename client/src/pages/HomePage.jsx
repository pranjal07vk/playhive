import { Link } from 'react-router-dom';
import { GAME_CATALOG } from '../features/games/catalog.js';
import { GameCard } from '../components/game/GameCard.jsx';
import { Arch, Marigold, RangoliStar, Sparkle, Squiggle } from '../components/common/Decor.jsx';
import './HomePage.css';

const FEATURED = ['pictionary', 'mafia', 'would-you-rather', 'uno', 'truth-or-dare', 'two-truths-and-a-lie'];

const STEPS = [
  { n: '01', title: 'Create a room', body: 'Pick a game and a name. No account, no app download.' },
  { n: '02', title: 'Share the code', body: 'Send the 5-letter code or the invite link to the group chat.' },
  { n: '03', title: 'Play live', body: 'Everyone plays from their own phone or laptop. Turns, votes and timers stay in sync.' },
];

const FEATURES = [
  { title: 'Truly live', body: 'Every vote, card and brushstroke reaches every device in real time over WebSockets.', color: 'peacock' },
  { title: 'Secrets stay secret', body: 'Roles, secret words and hands are only sent to the player who should see them.', color: 'gulal' },
  { title: 'Any device', body: 'Designed for phones first, with touch drawing, big tap targets and readable timers.', color: 'parrot' },
  { title: 'Drop-proof', body: 'Lost Wi-Fi? Reopen the room and you are back in the same seat.', color: 'marigold' },
];

export default function HomePage() {
  const featured = FEATURED.map((id) => GAME_CATALOG.find((g) => g.id === id));
  return (
    <>
      <section className="hero">
        <div className="container hero-grid">
          <div className="hero-copy stack" style={{ '--gap': '22px' }}>
            <span className="badge badge-cream badge-tilt hero-badge">● Live multiplayer · No sign-up</span>
            <h1 className="hero-title">
              Gather your gang.
              <span className="hero-title-accent"> Let the chaos begin.</span>
            </h1>
            <p className="hero-lede">
              PlayHive is game night for friends who are miles apart. Create a room, share the code, and play {GAME_CATALOG.length} party games together from any phone or laptop.
            </p>
            <div className="row hero-ctas">
              <Link to="/create" className="btn btn-primary btn-lg">Create a Room</Link>
              <Link to="/join" className="btn btn-cream btn-lg">Join with a code</Link>
            </div>
            <p className="muted hero-note">Free · Works in the browser · 2 to 20 players</p>
          </div>

          <div className="hero-art" aria-hidden="true">
            <Arch className="hero-arch" color="var(--gulal)" />
            <Arch className="hero-arch hero-arch-back" color="var(--marigold)" />
            <Marigold size={96} className="hero-flower hero-flower-1" />
            <Marigold size={58} className="hero-flower hero-flower-2" color="var(--gulal)" center="var(--marigold)" />
            <RangoliStar size={86} className="hero-star" />
            <Sparkle className="hero-sparkle hero-sparkle-1" size={30} />
            <Sparkle className="hero-sparkle hero-sparkle-2" size={20} color="var(--marigold)" />

            <div className="hero-ticket">
              <span className="eyebrow">Room code</span>
              <span className="hero-ticket-code numeric">K7Q2M</span>
              <span className="hero-ticket-sub">5 players · Pictionary</span>
            </div>

            <div className="hero-vote">
              <p className="hero-vote-q">Would you rather…</p>
              <div className="hero-vote-bar"><span style={{ width: '64%' }} />Give up chai <b>64%</b></div>
              <div className="hero-vote-bar hero-vote-bar-b"><span style={{ width: '36%' }} />Give up coffee <b>36%</b></div>
            </div>

            <div className="hero-sticker">Your turn, superstar!</div>
          </div>
        </div>
      </section>

      <div className="marquee" aria-hidden="true">
        <div className="marquee-track">
          {[...GAME_CATALOG, ...GAME_CATALOG].map((g, i) => (
            <span key={i}>{g.glyph} {g.name} <Sparkle size={14} color="var(--chai)" /></span>
          ))}
        </div>
      </div>

      <section className="section container" aria-labelledby="games-heading">
        <div className="section-head">
          <p className="eyebrow">The line-up</p>
          <h2 id="games-heading">Fifteen ways to <span className="text-marigold">lose friends</span> (temporarily).</h2>
          <Squiggle className="section-squiggle" />
        </div>
        <div className="home-games">
          {featured.map((g, i) => <GameCard key={g.id} game={g} index={i} />)}
        </div>
        <div className="center" style={{ marginTop: 32 }}>
          <Link to="/games" className="btn btn-peacock">See all {GAME_CATALOG.length} games</Link>
        </div>
      </section>

      <section className="section container" aria-labelledby="how-heading">
        <div className="section-head">
          <p className="eyebrow">How it works</p>
          <h2 id="how-heading">Ready, set, chaos.</h2>
        </div>
        <ol className="steps">
          {STEPS.map((s) => (
            <li key={s.n} className="step card card-sticker">
              <span className="step-n numeric">{s.n}</span>
              <h3>{s.title}</h3>
              <p className="muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="section container" aria-labelledby="features-heading">
        <div className="features-panel">
          <div className="section-head">
            <p className="eyebrow">Under the hood</p>
            <h2 id="features-heading">The room is getting louder.</h2>
          </div>
          <div className="features">
            {FEATURES.map((f) => (
              <div key={f.title} className={`feature feature-${f.color}`}>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="container cta-band">
        <Marigold size={70} className="cta-flower" />
        <h2>Your gang is waiting.</h2>
        <p>Start a room in ten seconds and drop the link in the group chat.</p>
        <div className="row" style={{ justifyContent: 'center' }}>
          <Link to="/create" className="btn btn-cream btn-lg">Create a Room</Link>
          <Link to="/join" className="btn btn-ghost btn-lg cta-ghost">Join a Room</Link>
        </div>
      </section>
    </>
  );
}
