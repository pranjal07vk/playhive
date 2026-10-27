import { useRoom } from '../../../hooks/useRoom.js';
import { GameHud, HostButton, PlayerChips, StageCard } from '../shared/components.jsx';
import { usePlayers } from '../shared/usePlayers.js';
import './View.css';

const ANSWERS = [
  { value: 'have', label: 'I have', emoji: '🙋' },
  { value: 'never', label: 'Never', emoji: '🙅' },
];

// ✋ for every finger still up, ✊ for each one lost. The text says the same thing.
function Fingers({ left, total, compact = false }) {
  return (
    <span className={`nhie-fingers ${compact ? 'nhie-fingers-sm' : ''}`}>
      <span aria-hidden="true">
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={i < left ? 'nhie-finger' : 'nhie-finger nhie-finger-lost'}>{i < left ? '✋' : '✊'}</span>
        ))}
      </span>
      <span className="sr-only">{left} of {total} fingers left</span>
    </span>
  );
}

export default function NeverHaveIEverView({ game }) {
  const { act, state } = useRoom();
  const { nameOf } = usePlayers();
  const v = game.view;
  const revealed = game.phase === 'reveal' && v.result;
  const named = v.privacy === 'named';
  const canAnswer = !game.spectating && !revealed && v.myAnswer === null;
  const total = v.answeredIds.length + v.waitingOn.length;

  return (
    <div className="stack nhie" style={{ '--gap': '24px' }}>
      <GameHud
        kicker={`Statement ${v.round} of ${v.totalRounds}`}
        title={revealed ? 'The confessions are in.' : 'Be honest. Nobody is watching. Yet.'}
        deadline={game.deadline}
        total={revealed ? 8 : state.room.settings.answerSeconds}
      />

      {v.livesMode && v.myLives !== null && (
        <div className={`nhie-meter ${v.amOut ? 'nhie-meter-out' : ''}`} aria-live="polite">
          <Fingers left={v.myLives} total={v.startingLives} />
          <span className="nhie-meter-text">
            {v.amOut ? 'Out of fingers! Keep answering for fun.' : `${v.myLives} of ${v.startingLives} fingers left`}
          </span>
        </div>
      )}

      <StageCard tone="marigold" kicker={named ? "🙋 Names revealed" : "🕶️ Anonymous"} className="nhie-card">
        <p className="stage-text">
          <span className="nhie-lead">Never have I ever…</span> {v.statement}
        </p>
      </StageCard>

      {!revealed && (
        <>
          <div className="nhie-answers" role="group" aria-label="Your answer">
            {ANSWERS.map((a) => (
              <button
                key={a.value}
                className={`nhie-answer nhie-${a.value} ${v.myAnswer === a.value ? 'nhie-answer-on' : ''}`}
                aria-pressed={v.myAnswer === a.value}
                disabled={!canAnswer && v.myAnswer !== a.value}
                onClick={() => canAnswer && act('answer', { answer: a.value })}
              >
                <span className="nhie-answer-emoji" aria-hidden="true">{a.emoji}</span>
                <span>{a.label}</span>
                {v.myAnswer === a.value && <span className="nhie-locked">Locked in ✓</span>}
              </button>
            ))}
          </div>
          <p className="muted center">
            🔒 {named ? 'Only you see your answer until the reveal.' : 'Anonymous mode: only the totals are ever shown.'}
            {v.livesMode && ' Every "I have" costs a finger.'}
          </p>
          <div className="stack" style={{ '--gap': '10px' }}>
            <p className="muted center" aria-live="polite">{v.answeredIds.length} of {total} have answered</p>
            <PlayerChips ids={[...v.answeredIds, ...v.waitingOn]} marked={v.answeredIds} label="Answer progress" />
          </div>
        </>
      )}

      {revealed && (
        <div className="stack" style={{ '--gap': '18px' }} aria-live="polite">
          <div className="nhie-tally">
            <div className="nhie-count nhie-count-have">
              <span className="nhie-count-num numeric">{v.result.have}</span>
              <span>🙋 I have</span>
            </div>
            <div className="nhie-count nhie-count-never">
              <span className="nhie-count-num numeric">{v.result.never}</span>
              <span>🙅 Never</span>
            </div>
          </div>
          {v.result.have === 0 && <p className="center nhie-quip">Nobody? Not one of you? Suspicious.</p>}
          {named && v.result.haveIds?.length > 0 && (
            <div className="stack" style={{ '--gap': '8px' }}>
              <p className="eyebrow center">Hands up</p>
              <PlayerChips ids={v.result.haveIds} label="Said I have" />
            </div>
          )}
          {!named && <p className="muted center">Anonymous mode: names stay secret. Look around the room though 👀</p>}
          {v.myAnswer && <p className="center">You said <strong className="text-marigold">{v.myAnswer === 'have' ? 'I have' : 'Never'}</strong>.</p>}

          {named && v.lives && (
            <ul className="nhie-lives" aria-label="Fingers left">
              {Object.entries(v.lives).sort((a, b) => b[1] - a[1]).map(([id, n]) => (
                <li key={id}>
                  <span className="nhie-lives-name">{nameOf(id)}</span>
                  <Fingers left={n} total={v.startingLives} compact />
                  <span className="numeric muted">{n === 0 ? 'out' : n}</span>
                </li>
              ))}
            </ul>
          )}

          <HostButton onClick={() => act('next')}>{v.round >= v.totalRounds ? 'See final results' : 'Next statement'}</HostButton>
        </div>
      )}
    </div>
  );
}
