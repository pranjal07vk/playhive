import { useState } from 'react';
import { useRoom } from '../../../hooks/useRoom.js';
import { GameHud, HostButton, PlayerChips, StageCard, TurnBanner } from '../shared/components.jsx';
import { usePlayers } from '../shared/usePlayers.js';
import './View.css';

const READY_SECONDS = 20;
const SUMMARY_SECONDS = 6;
const RESULT = {
  correct: { icon: '🦜', label: 'Got it' },
  pass: { icon: '👻', label: 'Passed' },
  timeUp: { icon: '⏰', label: 'Time ran out' },
};

function WordLog({ log, prefix = 'hu' }) {
  if (!log?.length) return <p className="muted center">No words this turn.</p>;
  return (
    <ul className={`${prefix}-log`} aria-label="Words this turn">
      {log.map((w) => (
        <li key={w.wordId} className={`${prefix}-log-${w.result}`}>
          <span aria-hidden="true">{RESULT[w.result]?.icon}</span>
          <span className={`${prefix}-log-word`}>{w.text}</span>
          <span className="muted">{RESULT[w.result]?.label}</span>
        </li>
      ))}
    </ul>
  );
}

export default function HeadsUpView({ game }) {
  const { act, isHost, state } = useRoom();
  const { nameOf } = usePlayers();
  const [busy, setBusy] = useState(false);
  const v = game.view;
  const phase = game.phase;
  const canAct = !game.spectating;
  const guesser = nameOf(v.guesserId);
  const total = phase === 'playing' ? state.room.settings.turnSeconds : phase === 'ready' ? READY_SECONDS : SUMMARY_SECONDS;

  // Both moves carry the wordId, so a double tap or a late tap is ignored by the server.
  const mark = async (type) => {
    if (busy || v.wordId === null) return;
    setBusy(true);
    await act(type, { wordId: v.wordId });
    setBusy(false);
  };

  return (
    <div className="stack hu" style={{ '--gap': '22px' }}>
      <GameHud
        kicker={`Turn ${v.turn} of ${v.totalTurns}`}
        title={phase === 'ready' ? (v.isGuesser ? 'Your turn, superstar.' : `${guesser} is up!`) : phase === 'playing' ? 'Heads Up!' : 'Turn over!'}
        deadline={game.deadline}
        total={total}
      />
      <TurnBanner playerId={v.guesserId} mine="You're guessing. No peeking needed, the word is hidden from you." theirs="{name} is guessing. You give the clues." />

      {phase === 'ready' && (
        <StageCard tone={v.isGuesser ? 'marigold' : 'dark'} kicker="Get ready" className="hu-ready">
          <p className="stage-text">{v.isGuesser ? 'Your friends will see the word. You won\'t.' : `Get your clues ready for ${guesser}.`}</p>
          <p className="hu-ready-sub">Describe it, act it, hum it. Just don't say the word itself. Starts automatically soon.</p>
          {canAct && (v.isGuesser || isHost) && (
            <button className="btn btn-primary btn-lg" onClick={() => act('start')}>
              {v.isGuesser ? 'I\'m ready, start!' : `Start ${guesser}'s turn`}
            </button>
          )}
        </StageCard>
      )}

      {phase === 'playing' && (
        <>
          {v.isGuesser ? (
            <div className="hu-card hu-card-mystery" aria-live="polite">
              <span className="hu-q" aria-hidden="true">?</span>
              <p className="hu-card-copy">Your friends can see the word. Listen to their clues!</p>
            </div>
          ) : (
            <div className="hu-card hu-card-word" aria-live="polite">
              <span className="hu-card-tag">The word is</span>
              <span key={v.wordId} className="hu-word">{v.word}</span>
              <span className="hu-card-copy">Don't say it. Make {guesser} say it.</span>
            </div>
          )}

          <p className="hu-tally numeric" aria-live="polite">
            <span className="text-parrot">🦜 {v.gotCount} got</span>
            <span aria-hidden="true">·</span>
            <span className="muted">👻 {v.passCount} passed</span>
          </p>

          {canAct && (
            <div className="hu-actions">
              <button className="hu-btn hu-btn-correct" disabled={busy} onClick={() => mark('correct')}>
                <span aria-hidden="true">🦜</span> Correct!
              </button>
              <button className="hu-btn hu-btn-pass" disabled={busy} onClick={() => mark('pass')}>
                <span aria-hidden="true">👻</span> Pass
              </button>
            </div>
          )}
          <p className="muted center hu-honest">The app can't hear you. Anyone can tap Correct when {v.isGuesser ? 'you say' : `${guesser} says`} the word.</p>
        </>
      )}

      {phase === 'turnSummary' && (
        <StageCard tone="dark" kicker={`${guesser} got ${v.gotCount}`}>
          <WordLog log={v.log} />
        </StageCard>
      )}
      {phase === 'turnSummary' && <HostButton onClick={() => act('next')}>{v.turn >= v.totalTurns ? 'See final results' : 'Next guesser'}</HostButton>}

      {phase !== 'turnSummary' && v.clueGivers.length > 0 && <PlayerChips ids={v.clueGivers} label="Clue givers" />}
    </div>
  );
}
