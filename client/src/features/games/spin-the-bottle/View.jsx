import { useEffect, useRef, useState } from 'react';
import { useRoom } from '../../../hooks/useRoom.js';
import { Avatar } from '../../../components/common/Avatar.jsx';
import { GameHud, StageCard } from '../shared/components.jsx';
import { usePlayers } from '../shared/usePlayers.js';
import './View.css';

const SPIN_MS = 3000;
const EXTRA_TURNS = 4;
const KINDS = {
  truth: { label: 'Truth', emoji: '🤫', tone: 'peacock' },
  dare: { label: 'Dare', emoji: '🔥', tone: 'gulal' },
  question: { label: 'Question', emoji: '💭', tone: 'marigold' },
  compliment: { label: 'Compliment', emoji: '💐', tone: 'parrot' },
  challenge: { label: 'Challenge', emoji: '⏱️', tone: 'paper' },
};
const OUTCOME = {
  done: 'nailed it. +1!',
  skipped: 'used a skip.',
  timeout: 'ran out of time.',
  'host-skipped': 'was skipped by the host.',
};

// Seat i sits at this many degrees clockwise from the top of the table.
const seatAngle = (i, n) => (i / n) * 360;

function useReducedMotion() {
  const query = '(prefers-reduced-motion: reduce)';
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(query).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return undefined;
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

function Bottle() {
  return (
    <svg viewBox="0 0 60 200" className="stb-bottle-svg" aria-hidden="true">
      <rect x="22" y="4" width="16" height="14" rx="3" className="stb-cap" />
      <path d="M24 18h12v38c0 8 18 18 18 40v88c0 7-5 12-12 12H18c-7 0-12-5-12-12V96c0-22 18-32 18-40z" className="stb-glass" />
      <rect x="10" y="110" width="40" height="44" rx="6" className="stb-label" />
      <path d="M20 132h20" className="stb-label-line" />
      <path d="M16 100c0-10 6-16 10-20" className="stb-shine" />
    </svg>
  );
}

export default function SpinTheBottleView({ game }) {
  const { act, isHost } = useRoom();
  const { byId, nameOf, meId } = usePlayers();
  const reduced = useReducedMotion();
  const v = game.view;
  const n = v.seats.length;
  const spun = game.phase === 'spun';

  // Cumulative rotation so the bottle always spins forward.
  const [rotation, setRotation] = useState(() => {
    const idx = spun ? v.targetIndex : v.seats.indexOf(v.lastSpin?.targetId);
    return idx !== null && idx >= 0 ? seatAngle(idx, n) : 0;
  });
  const [landedSpin, setLandedSpin] = useState(v.spinId);
  const seenSpin = useRef(v.spinId);

  useEffect(() => {
    if (v.spinId === seenSpin.current || v.targetIndex === null) return undefined;
    seenSpin.current = v.spinId;
    const target = seatAngle(v.targetIndex, n);
    setRotation((prev) => {
      const current = ((prev % 360) + 360) % 360;
      return prev + EXTRA_TURNS * 360 + ((target - current + 360) % 360);
    });
    if (reduced) {
      setLandedSpin(v.spinId);
      return undefined;
    }
    // Fallback in case transitionend never fires (e.g. the tab was hidden).
    const id = v.spinId;
    const timer = setTimeout(() => setLandedSpin(id), SPIN_MS + 250);
    return () => clearTimeout(timer);
  }, [v.spinId, v.targetIndex, n, reduced]);

  const landed = spun && landedSpin === v.spinId;
  const spinning = spun && !landed;
  const spinner = byId(v.spinnerId);
  const target = v.targetId ? byId(v.targetId) : null;
  const mySpin = v.isMySpin && !game.spectating;
  const myTarget = v.isMyTarget && !game.spectating;
  const token = { spinId: v.spinId };
  const kind = v.prompt ? KINDS[v.prompt.kind] : null;

  const title = spun
    ? spinning ? 'Round and round it goes…' : myTarget ? 'The bottle picked YOU.' : `It landed on ${target?.name}!`
    : mySpin ? 'Your spin, superstar.' : `${spinner.name} is holding the bottle`;

  return (
    <div className="stack stb" style={{ '--gap': '22px' }}>
      <GameHud kicker={`Spin ${Math.min(v.spinsDone + 1, v.totalSpins)} of ${v.totalSpins}`} title={title} deadline={game.deadline} total={spun ? 90 : 30} />

      <div className="stb-table" style={{ '--seats': n }}>
        <div className="stb-rug" aria-hidden="true" />
        <ul className="stb-seats" aria-label="Players around the table">
          {v.seats.map((id, i) => {
            const p = byId(id);
            const a = (seatAngle(i, n) * Math.PI) / 180;
            const left = v.leftIds.includes(id);
            const isSpinner = id === v.spinnerId;
            const isTarget = landed && id === v.targetId;
            const role = isTarget ? 'picked' : isSpinner ? 'spinning' : left ? 'left' : !p.connected ? 'offline' : null;
            return (
              <li
                key={id}
                className={`stb-seat ${isTarget ? 'stb-seat-target' : ''} ${isSpinner ? 'stb-seat-spinner' : ''} ${left ? 'stb-seat-left' : ''}`}
                style={{ left: `${50 + 38 * Math.sin(a)}%`, top: `${50 - 38 * Math.cos(a)}%` }}
              >
                <Avatar player={p} size={n > 8 ? 36 : 46} ring={isTarget} />
                <span className="stb-seat-name">{p.name}{id === meId ? ' (you)' : ''}</span>
                {role && <span className={`stb-seat-tag stb-tag-${role}`}>{{ picked: '🎯 Picked', spinning: '🍾 Spinner', left: 'Left', offline: 'Offline' }[role]}</span>}
              </li>
            );
          })}
        </ul>
        <div
          className={`stb-bottle ${spinning && !reduced ? 'stb-bottle-spinning' : ''}`}
          style={{ transform: `translate(-50%, -50%) rotate(${rotation}deg)`, '--spin-ms': `${SPIN_MS}ms` }}
          onTransitionEnd={(e) => e.propertyName === 'transform' && setLandedSpin(seenSpin.current)}
        >
          <Bottle />
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        {spinning ? 'The bottle is spinning…' : landed && target ? `The bottle picked ${target.name}.` : `${spinner.name} is about to spin.`}
      </p>

      {!spun && (
        <div className="stack center" style={{ '--gap': '12px' }}>
          {mySpin ? (
            <button className="btn btn-marigold btn-lg btn-block stb-spin" onClick={() => act('spin')}>🍾 Spin the bottle!</button>
          ) : (
            <p className="stb-wait">{spinner.name} is about to spin. Brace yourselves.</p>
          )}
          {mySpin && <p className="muted">Spins by itself in 30 seconds if you're shy.</p>}
          {isHost && !v.isMySpin && <div><button className="btn btn-ghost btn-sm" onClick={() => act('skipTurn', token)}>Spin for {spinner.name} (AFK)</button></div>}
        </div>
      )}

      {spinning && <p className="stb-wait center">Round and round… 🌀</p>}

      {landed && v.prompt && (
        <>
          <StageCard tone={kind.tone} kicker={`${kind.emoji} ${kind.label}`} className="stb-prompt">
            <p className="stage-text">{v.prompt.text}</p>
            <p className="stb-for">for {myTarget ? 'you' : target?.name}</p>
          </StageCard>
          {myTarget ? (
            <div className="stb-actions">
              <button className="btn btn-parrot btn-lg" onClick={() => act('done', token)}>Done ✅</button>
              <button className="btn btn-ghost btn-lg" disabled={!v.canSkip} onClick={() => act('skip', token)}>
                {v.mySkipsLeft > 0 ? `Skip (${v.mySkipsLeft} left)` : 'No skips left'}
              </button>
            </div>
          ) : (
            <p className="stb-wait center">👀 Waiting for {target?.name} to do it. You be the judge.</p>
          )}
          {target && !target.connected && <p className="muted center">{target.name} seems offline. The turn passes when the timer ends.</p>}
          {isHost && !v.isMyTarget && <div className="center"><button className="btn btn-ghost btn-sm" onClick={() => act('skipTurn', token)}>Skip this turn (AFK)</button></div>}
        </>
      )}

      <p className="muted center" aria-live="polite">
        {v.lastSpin ? `Last spin: ${nameOf(v.lastSpin.targetId)} ${OUTCOME[v.lastSpin.outcome] ?? ''}` : 'Friendly prompts only. No kissing, promise.'}
      </p>
    </div>
  );
}
