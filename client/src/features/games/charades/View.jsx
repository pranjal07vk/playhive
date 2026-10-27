import { useState } from 'react';
import { useRoom } from '../../../hooks/useRoom.js';
import { Avatar } from '../../../components/common/Avatar.jsx';
import { GameHud, HostButton, PlayerChips, TurnBanner } from '../shared/components.jsx';
import { usePlayers } from '../shared/usePlayers.js';
import './View.css';

const READY_SECONDS = 20;
const SUMMARY_SECONDS = 8;
const RESULT = {
  guessed: { icon: '🎉', label: 'Guessed' },
  skipped: { icon: '⏭️', label: 'Skipped' },
  timeUp: { icon: '⏰', label: 'Time ran out' },
};

// "Who guessed it?" — one tap on a player chip credits them.
function GuesserPicker({ ids, onPick, onCancel }) {
  const { byId } = usePlayers();
  return (
    <div className="cha-picker card card-sticker" role="group" aria-labelledby="cha-picker-title">
      <p id="cha-picker-title" className="cha-picker-title">Who guessed it?</p>
      <div className="cha-picker-grid">
        {ids.map((id) => {
          const p = byId(id);
          return (
            <button key={id} className="cha-picker-chip" onClick={() => onPick(id)}>
              <Avatar player={p} size={30} />
              <span>{p.name}</span>
            </button>
          );
        })}
      </div>
      <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
    </div>
  );
}

function Curtains({ children, open }) {
  return (
    <div className={`cha-stage ${open ? 'cha-stage-open' : ''}`}>
      <span className="cha-curtain cha-curtain-l" aria-hidden="true" />
      <span className="cha-curtain cha-curtain-r" aria-hidden="true" />
      <span className="cha-valance" aria-hidden="true" />
      <div className="cha-stage-inner">{children}</div>
    </div>
  );
}

export default function CharadesView({ game }) {
  const { act, isHost, state } = useRoom();
  const { nameOf } = usePlayers();
  // The picker is tied to the word it was opened for, so it closes if the word changes.
  const [pickFor, setPickFor] = useState(null);
  const v = game.view;
  const phase = game.phase;
  const canAct = !game.spectating;
  const performer = nameOf(v.performerId);
  const total = phase === 'acting' ? state.room.settings.turnSeconds : phase === 'ready' ? READY_SECONDS : SUMMARY_SECONDS;
  const picking = pickFor !== null && pickFor === v.wordId;
  const canMark = canAct && phase === 'acting' && (v.isPerformer || isHost);

  const credit = async (guesserId) => {
    const wordId = pickFor;
    setPickFor(null);
    await act('guessed', { wordId, guesserId });
  };

  return (
    <div className="stack cha" style={{ '--gap': '22px' }}>
      <GameHud
        kicker={`Turn ${v.turn} of ${v.totalTurns}`}
        title={phase === 'ready' ? (v.isPerformer ? 'Your stage awaits.' : `${performer} takes the stage`) : phase === 'acting' ? (v.isPerformer ? 'Act it out. No talking!' : 'Guess out loud!') : 'Curtain call!'}
        deadline={game.deadline}
        total={total}
      />
      <TurnBanner playerId={v.performerId} mine="You're the performer. Only you can see the word." theirs="{name} is performing. Shout your guesses!" />

      {phase === 'ready' && (
        <Curtains>
          <p className="cha-big">{v.isPerformer ? 'Lights, camera…' : 'The show starts soon'}</p>
          <p className="cha-sub">{v.isPerformer ? 'Tap start when everyone can see you. Gestures only, no words or lip-syncing.' : `${performer} acts, you guess. Starts automatically soon.`}</p>
          {canAct && (v.isPerformer || isHost) && (
            <button className="btn btn-marigold btn-lg" onClick={() => act('start')}>
              {v.isPerformer ? 'Start acting' : `Start ${performer}'s turn`}
            </button>
          )}
        </Curtains>
      )}

      {phase === 'acting' && v.isPerformer && (
        <div className="cha-word-card" aria-live="polite">
          <span className="cha-word-tag">Act this out · only you see it</span>
          <span key={v.wordId} className="cha-word">{v.word}</span>
        </div>
      )}

      {phase === 'acting' && !v.isPerformer && (
        <Curtains open>
          <p className="cha-big" aria-live="polite">Guess out loud!</p>
          <p className="cha-sub">Watch {performer} and shout what you think it is. The performer taps who got it.</p>
        </Curtains>
      )}

      {phase === 'acting' && (
        <p className="cha-tally numeric center" aria-live="polite">🎉 {v.gotCount} guessed so far</p>
      )}

      {canMark && !picking && (
        <div className="cha-actions">
          <button className="btn btn-parrot btn-lg" onClick={() => setPickFor(v.wordId)}>Guessed it! 🎉</button>
          {v.isPerformer && (
            <button className="btn btn-ghost btn-lg" disabled={v.skipsLeft === 0} onClick={() => act('skip', { wordId: v.wordId })}>
              Skip ({v.skipsLeft} left)
            </button>
          )}
        </div>
      )}
      {canMark && picking && <GuesserPicker ids={v.guessers} onPick={credit} onCancel={() => setPickFor(null)} />}

      {phase === 'acting' && v.isPerformer && v.log?.length > 0 && (
        <details className="cha-sofar">
          <summary>This turn so far ({v.log.length})</summary>
          <CharadesLog log={v.log} />
        </details>
      )}

      {phase === 'turnSummary' && (
        <div className="card card-sticker cha-summary">
          <p className="eyebrow">{performer} got {v.gotCount} across</p>
          <CharadesLog log={v.log} />
        </div>
      )}
      {phase === 'turnSummary' && <HostButton onClick={() => act('next')}>{v.turn >= v.totalTurns ? 'See final results' : 'Next performer'}</HostButton>}

      {phase !== 'turnSummary' && <PlayerChips ids={v.guessers} label="Audience" />}
    </div>
  );
}

function CharadesLog({ log }) {
  const { nameOf } = usePlayers();
  if (!log?.length) return <p className="muted">No words this turn.</p>;
  return (
    <ul className="cha-log" aria-label="Words this turn">
      {log.map((w) => (
        <li key={w.wordId}>
          <span aria-hidden="true">{RESULT[w.result]?.icon}</span>
          <span className="cha-log-word">{w.text}</span>
          <span className="muted">{w.result === 'guessed' ? `by ${nameOf(w.guesserId)}` : RESULT[w.result]?.label}</span>
        </li>
      ))}
    </ul>
  );
}
