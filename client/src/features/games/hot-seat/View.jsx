import { useRoom } from '../../../hooks/useRoom.js';
import { Avatar } from '../../../components/common/Avatar.jsx';
import { ChoiceButtons, GameHud, HostButton, PlayerChips, StageCard } from '../shared/components.jsx';
import { usePlayers } from '../shared/usePlayers.js';
import './View.css';

const LETTERS = ['A', 'B', 'C', 'D'];

export default function HotSeatView({ game }) {
  const { act, state } = useRoom();
  const { byId, nameOf, meId } = usePlayers();
  const v = game.view;
  const revealed = game.phase === 'reveal' && v.reveal;
  const hot = byId(v.hotSeatId);
  const options = v.question.options.map((label, i) => ({ value: i, label: `${LETTERS[i]}. ${label}` }));
  const canAnswer = !game.spectating && !revealed && v.myChoice === null;

  const title = revealed ? 'Moment of truth.' : v.amHotSeat ? "You're in the hot seat 🔥" : `${hot.name} is in the hot seat`;
  const ask = v.amHotSeat ? 'Pick your honest answer' : `What would ${hot.name} pick?`;

  return (
    <div className="stack hs" style={{ '--gap': '24px' }}>
      <GameHud kicker={`Round ${v.round} of ${v.totalRounds}`} title={title} deadline={game.deadline} total={revealed ? 8 : state.room.settings.seconds} />

      <div className="hs-spotlight" aria-live="polite">
        <span className="hs-flame" aria-hidden="true">🔥</span>
        <Avatar player={hot} size={84} ring={!revealed} />
        <div className="hs-spotlight-text">
          <span className="hs-name">{hot.name}{v.amHotSeat ? ' (you)' : ''}</span>
          <span className="hs-status">
            {revealed
              ? v.reveal.void ? 'Round void' : `${v.reveal.correctIds.length} friend${v.reveal.correctIds.length === 1 ? '' : 's'} read them right`
              : v.hotSeatAnswered ? '🔒 Honest answer locked in' : !hot.connected ? '📴 Offline. No answer means a void round.' : '🤔 Still deciding…'}
          </span>
        </div>
      </div>

      <StageCard tone="dark" kicker={v.amHotSeat ? 'Your secret answer' : 'Your prediction'} className="hs-question">
        <p className="hs-ask">{revealed ? `What did ${v.amHotSeat ? 'you' : hot.name} pick?` : ask}</p>
        <p className="stage-text">{v.question.text}</p>
      </StageCard>

      {!revealed && (
        <>
          <ChoiceButtons options={options} value={v.myChoice} columns={2} disabled={!canAnswer} onChoose={(choice) => canAnswer && act('answer', { choice })} />
          <p className="muted center">
            {game.spectating
              ? 'You are watching this round.'
              : v.myChoice !== null
                ? v.amHotSeat ? 'Locked in. Now watch your friends sweat.' : 'Prediction locked. Fingers crossed.'
                : v.amHotSeat ? 'Nobody sees this until the reveal. You score a point for each friend who guesses right.' : 'Guess right for +1. Hidden from everyone until the reveal.'}
          </p>
          <div className="stack" style={{ '--gap': '10px' }}>
            <p className="muted center" aria-live="polite">{v.answeredIds.length} of {v.answeredIds.length + v.waitingOn.length} locked in</p>
            <PlayerChips ids={[...v.answeredIds, ...v.waitingOn]} marked={v.answeredIds} label="Who has locked in" />
          </div>
        </>
      )}

      {revealed && <Reveal v={v} hotName={hot.name} nameOf={nameOf} meId={meId} />}

      {revealed && <HostButton onClick={() => act('next')}>{v.round >= v.totalRounds ? 'See final results' : 'Next hot seat'}</HostButton>}
    </div>
  );
}

function Reveal({ v, hotName, nameOf, meId }) {
  const r = v.reveal;
  if (r.void) {
    return (
      <div className="card hs-void" aria-live="polite">
        <p className="hs-void-title">🫥 Round void</p>
        <p className="muted">{r.reason === 'left' ? `${hotName} left the game` : `${hotName} didn't answer in time`}, so nobody scores this round.</p>
      </div>
    );
  }
  const mine = r.predictions[meId];
  return (
    <div className="stack" style={{ '--gap': '14px' }} aria-live="polite">
      <ul className="hs-options">
        {v.question.options.map((label, i) => {
          const pickers = Object.keys(r.predictions).filter((id) => r.predictions[id] === i);
          const real = r.answer === i;
          return (
            <li key={i} className={`hs-option ${real ? 'hs-option-real' : ''}`}>
              <div className="spread row">
                <span className="hs-option-label">{LETTERS[i]}. {label}</span>
                {real && <span className="badge badge-parrot badge-tilt">✓ Real answer</span>}
              </div>
              <p className="hs-pickers">{pickers.length ? `Predicted by ${pickers.map(nameOf).join(', ')}` : 'Nobody predicted this'}</p>
            </li>
          );
        })}
      </ul>
      <p className="center hs-points">
        {r.correctIds.length
          ? `+1 each for ${r.correctIds.map(nameOf).join(', ')} · +${r.hotSeatPoints} for ${hotName}`
          : `Nobody saw that coming. ${hotName} is a mystery. No points.`}
      </p>
      {mine !== undefined && <p className="center">{mine === r.answer ? '🎯 You called it. +1!' : '🙈 Not this time.'}</p>}
    </div>
  );
}
