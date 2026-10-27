import { useState } from 'react';
import { useRoom } from '../../../hooks/useRoom.js';
import { Avatar } from '../../../components/common/Avatar.jsx';
import { GameHud, PlayerChips } from '../shared/components.jsx';
import { usePlayers } from '../shared/usePlayers.js';
import { useBeat } from './useBeat.js';
import './View.css';

const FROZEN_SECONDS = 15;
const BPM = { chill: 96, normal: 118, hyper: 140 };
const HOW = { dj: 'called out by the DJ', self: 'owned up', left: 'left the game' };
const TILES = 24;

function MusicToggle({ beat }) {
  if (!beat.supported) return <p className="muted fd-music-note">This browser can't play the beat. Use your own playlist and dance anyway!</p>;
  return (
    <div className="fd-music">
      <button className={`btn ${beat.on ? 'btn-ghost' : 'btn-peacock'}`} aria-pressed={beat.on} onClick={beat.on ? beat.disable : beat.enable}>
        {beat.on ? '🔇 Turn off the music' : '🔊 Turn on the music'}
      </button>
      <p className="muted fd-music-note">
        {beat.on ? 'The beat plays on this device whenever the floor is open, and cuts out on the freeze.' : 'Your browser needs a tap before it can play sound. One phone on speaker is plenty.'}
      </p>
    </div>
  );
}

// The DJ's referee panel during a freeze.
function DjPanel({ v, act }) {
  const { byId } = usePlayers();
  const [picked, setPicked] = useState([]);
  const selected = picked.filter((id) => v.alive.includes(id));
  const outThisRound = v.eliminated.filter((e) => e.round === v.round && e.how !== 'left');
  const toggle = (id) => setPicked(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  const eliminate = async () => {
    const res = await act('eliminate', { playerIds: selected });
    if (res?.ok !== false) setPicked([]);
  };

  return (
    <section className="fd-dj card card-sticker" aria-labelledby="fd-dj-title">
      <h3 id="fd-dj-title" className="fd-dj-title">🎧 DJ's call: who moved?</h3>
      {v.alive.length > 0 ? (
        <fieldset className="fd-grid">
          <legend className="sr-only">Pick everyone you saw move</legend>
          {v.alive.map((id) => {
            const p = byId(id);
            const on = selected.includes(id);
            return (
              <label key={id} className={`fd-pick ${on ? 'fd-pick-on' : ''}`}>
                <input type="checkbox" checked={on} onChange={() => toggle(id)} />
                <Avatar player={p} size={28} />
                <span className="fd-pick-name">{p.name}</span>
                {on && <span aria-hidden="true">❌</span>}
              </label>
            );
          })}
        </fieldset>
      ) : (
        <p className="muted">Nobody left standing.</p>
      )}
      <div className="fd-dj-actions">
        <button className="btn btn-primary" disabled={selected.length === 0} onClick={eliminate}>
          {selected.length ? `They're out! (${selected.length})` : 'Tick who moved'}
        </button>
        <button className="btn btn-parrot" onClick={() => act('resume')}>▶ Resume the music</button>
      </div>
      {outThisRound.length > 0 && (
        <div className="fd-undo">
          <p className="muted">Out this round (tap Undo if that was a mistake):</p>
          <ul>
            {outThisRound.map((e) => (
              <li key={e.playerId}>
                <span>{byId(e.playerId).name} <span className="muted">({HOW[e.how]})</span></span>
                <button className="btn btn-ghost btn-sm" onClick={() => act('reinstate', { playerId: e.playerId })}>Undo</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export default function FreezeDanceView({ game }) {
  const { act, state } = useRoom();
  const { nameOf } = usePlayers();
  const v = game.view;
  const dancing = game.phase === 'dancing';
  const beat = useBeat(dancing, BPM[state.room.settings.pace] ?? BPM.normal);
  const iCanAct = !game.spectating;

  const myStatus = v.isDJ && !v.isContestant
    ? dancing ? 'You\'re the DJ. Watch closely, the freeze comes without warning.' : 'Freeze! Call out anyone you saw move, then resume.'
    : !v.isContestant ? 'You are watching this round.'
    : !v.amAlive ? 'You\'re out. Cheer from the sidelines (loudly).'
    : dancing ? 'Keep dancing! Freeze the second the music stops.'
    : 'FREEZE! Not a twitch.';

  return (
    <div className="stack fd" style={{ '--gap': '20px' }}>
      <GameHud kicker={`Round ${v.round} of ${v.maxRounds} · ${v.alive.length} still standing`} title={dancing ? 'Dance floor is open!' : 'Statues, everyone!'} deadline={dancing ? null : game.deadline} total={FROZEN_SECONDS} />

      <div className={`fd-floor ${dancing ? 'fd-floor-dancing' : 'fd-floor-frozen'}`} aria-live="assertive">
        {dancing && (
          <div className="fd-tiles" aria-hidden="true">
            {Array.from({ length: TILES }, (_, i) => <span key={i} className={`fd-tile fd-tile-${i % 4}`} style={{ animationDelay: `${(i * 137) % 900}ms` }} />)}
          </div>
        )}
        <div className="fd-floor-text">
          <span className="fd-shout">{dancing ? 'DANCE!' : 'FREEZE!'}</span>
          <span className="fd-emoji" aria-hidden="true">{dancing ? '💃🕺' : '🦚❄️'}</span>
          <span className="fd-status">{myStatus}</span>
        </div>
      </div>

      <MusicToggle beat={beat} />

      {!dancing && iCanAct && v.isDJ && <DjPanel key={v.round} v={v} act={act} />}
      {!dancing && iCanAct && v.isContestant && v.amAlive && (
        <button className="btn btn-marigold btn-lg btn-block" onClick={() => act('iMoved')}>I moved 😅</button>
      )}
      {!dancing && !v.isDJ && <p className="muted center">The DJ is judging. The app can't see you, so honesty counts.</p>}

      <div className="fd-lists">
        <section aria-labelledby="fd-alive-title">
          <h3 id="fd-alive-title" className="fd-list-title">Still dancing ({v.alive.length})</h3>
          {v.alive.length ? <PlayerChips ids={v.alive} label="Still dancing" /> : <p className="muted">Nobody!</p>}
        </section>
        <section aria-labelledby="fd-out-title">
          <h3 id="fd-out-title" className="fd-list-title">Out ({v.eliminated.length})</h3>
          {v.eliminated.length ? (
            <ol className="fd-out">
              {v.eliminated.map((e) => (
                <li key={e.playerId}>
                  <span className="badge badge-outline numeric">R{e.round}</span>
                  <span>{nameOf(e.playerId)}</span>
                  <span className="muted">{HOW[e.how]}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="muted">Everyone's still in. For now.</p>
          )}
        </section>
      </div>
      <p className="muted center fd-dj-line">🎧 DJ: {nameOf(v.djId)}{v.isDJ ? ' (you)' : ''}</p>
    </div>
  );
}
