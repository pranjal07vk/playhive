import { useEffect, useRef, useState } from 'react';
import { useRoom } from '../../../hooks/useRoom.js';
import { useGameTimer } from '../../../hooks/useGameTimer.js';
import { GameHud, HostButton, PlayerChips, StageCard, WaitingOn } from '../shared/components.jsx';
import { DrawingCanvas } from '../pictionary/DrawingCanvas.jsx';
import { ChainStrip } from './ChainStrip.jsx';
import './View.css';

const SHOW_SECONDS = 6;
const REVEAL_SECONDS = 90;
const PHRASE_MAX = 80;

export default function TelephoneView({ game }) {
  const { state } = useRoom();
  const v = game.view;
  const settings = state.room.settings;

  if (game.phase === 'reveal') return <RevealStage game={game} />;

  const textRecall = v.mode === 'text' && v.step > 0;
  const total = v.kind === 'drawing' ? settings.drawSeconds : settings.writeSeconds + (textRecall ? SHOW_SECONDS : 0);
  const title = v.step === 0 ? 'Start a rumour.' : v.kind === 'drawing' ? 'Draw what you read.' : textRecall ? 'Remember this…' : 'Describe this masterpiece.';

  return (
    <div className="tel stack" style={{ '--gap': '20px' }}>
      <GameHud kicker={`Step ${v.step + 1} of ${v.totalSteps} · ${v.mode === 'draw' ? 'Draw & describe' : 'Text only'}`} title={title} deadline={game.deadline} total={total} />
      <StepTrack step={v.step} total={v.totalSteps} mode={v.mode} />

      {game.spectating ? (
        <StageCard tone="dark" kicker="Watching">
          <p>Chains are being passed around in secret. You will see them all at the reveal.</p>
        </StageCard>
      ) : v.submitted ? (
        <StageCard tone="parrot" kicker="Passed along">
          <p className="stage-text"><span aria-hidden="true">✓ </span>Locked in!</p>
          <p>Your entry is on its way down the line.</p>
        </StageCard>
      ) : (
        // The key resets drafts and auto-submit for every new step.
        <Work key={v.step} game={game} />
      )}

      <div className="stack" style={{ '--gap': '10px' }}>
        <p className="muted center" aria-live="polite">{v.doneIds.length} of {v.doneIds.length + v.waitingOn.length} done</p>
        <PlayerChips ids={[...v.doneIds, ...v.waitingOn]} marked={v.doneIds} label="Who has finished this step" />
        {v.submitted && <WaitingOn ids={v.waitingOn} />}
      </div>
    </div>
  );
}

function StepTrack({ step, total, mode }) {
  return (
    <ol className="tel-track" aria-label={`Step ${step + 1} of ${total}`}>
      {Array.from({ length: total }, (_, i) => {
        const kind = i === 0 || mode === 'text' ? 'text' : i % 2 ? 'drawing' : 'text';
        return (
          <li key={i} className={`tel-track-dot ${i < step ? 'is-done' : ''} ${i === step ? 'is-now' : ''}`} aria-current={i === step ? 'step' : undefined}>
            <span aria-hidden="true">{kind === 'drawing' ? '✏️' : '💬'}</span>
            <span className="sr-only">{kind === 'drawing' ? 'Draw' : 'Write'}{i < step ? ' (done)' : ''}</span>
          </li>
        );
      })}
    </ol>
  );
}

// What this player does this step. Unsent work is sent automatically just
// before the deadline so it is not replaced by "(they ran out of time)".
function Work({ game }) {
  const { act } = useRoom();
  const v = game.view;
  const canvasRef = useRef(null);
  const [text, setText] = useState(v.mySuggestion ?? '');
  const [sending, setSending] = useState(false);
  const sentRef = useRef(false);
  const left = useGameTimer(game.deadline);
  const showLeft = useGameTimer(v.showUntil);
  const recall = v.showUntil !== null;
  const memorising = recall && showLeft > 0 && v.prompt;

  useEffect(() => {
    if (v.mySuggestion) setText(v.mySuggestion);
  }, [v.mySuggestion]);

  const send = async (auto = false) => {
    if (sentRef.current) return;
    let result;
    if (v.kind === 'drawing') {
      const strokes = canvasRef.current?.getStrokes() ?? [];
      if (auto && strokes.length === 0) return;
      sentRef.current = true;
      setSending(true);
      result = await act('submitDrawing', { strokes });
    } else {
      const clean = text.trim();
      if (!clean) return;
      sentRef.current = true;
      setSending(true);
      result = await act('submit', { text: clean });
    }
    if (result && !result.ok) sentRef.current = false;
    setSending(false);
  };

  useEffect(() => {
    if (left !== null && left <= 1 && !memorising) send(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left]);

  const prompt = v.prompt;

  if (v.kind === 'drawing') {
    return (
      <div className="stack" style={{ '--gap': '16px' }}>
        <div className="tel-prompt-note">
          <span className="tel-label">Draw this</span>
          <p className="tel-prompt-text">{prompt?.text ?? 'Something mysterious'}</p>
        </div>
        <DrawingCanvas ref={canvasRef} editable maxPoints={8000} maxPointsPerStroke={1000} label="Your drawing" />
        <button className="btn btn-marigold btn-lg btn-block" onClick={() => send()} disabled={sending}>Submit drawing</button>
      </div>
    );
  }

  return (
    <div className="stack" style={{ '--gap': '16px' }}>
      {v.step > 0 && prompt?.kind === 'drawing' && (
        <div className="stack" style={{ '--gap': '8px' }}>
          <span className="tel-label">Someone drew this</span>
          <DrawingCanvas strokes={prompt.strokes} label="The drawing you need to describe" />
        </div>
      )}
      {recall && (
        <div className="tel-prompt-note" aria-live="polite">
          <span className="tel-label">{memorising ? `Memorise it · ${showLeft}s` : 'Gone!'}</span>
          <p className="tel-prompt-text">{memorising ? prompt.text : 'Now write it from memory. No pressure.'}</p>
        </div>
      )}
      {!memorising && (
        <form className="stack" style={{ '--gap': '12px' }} onSubmit={(e) => { e.preventDefault(); send(); }}>
          <div className="field">
            <label className="field-label" htmlFor="tel-text">
              {v.step === 0 ? 'Your starting phrase' : recall ? 'What did it say?' : 'What is this drawing?'}
            </label>
            <input id="tel-text" className="input" value={text} maxLength={PHRASE_MAX} autoComplete="off" placeholder={v.step === 0 ? 'A cow on a scooter…' : 'Type it here'} onChange={(e) => setText(e.target.value)} />
            <span className="field-hint">{text.length}/{PHRASE_MAX}{v.step === 0 ? ' · Keep it drawable!' : ''}</span>
          </div>
          <div className="row">
            <button className="btn btn-marigold" type="submit" disabled={!text.trim() || sending}>Pass it on</button>
            {v.step === 0 && <button className="btn btn-ghost" type="button" onClick={() => act('useSuggestion')}>🎲 Suggest one</button>}
          </div>
        </form>
      )}
    </div>
  );
}

function RevealStage({ game }) {
  const { act } = useRoom();
  const r = game.view.reveal;
  const last = r.index + 1 >= r.total;
  return (
    <div className="tel stack" style={{ '--gap': '20px' }}>
      <GameHud kicker={`Chain ${r.index + 1} of ${r.total}`} title={`${r.chain.ownerName}'s chain`} deadline={game.deadline} total={REVEAL_SECONDS} />
      <p className="muted">It started as one thing. Let's see what it became.</p>
      <ChainStrip chain={r.chain} />
      <HostButton onClick={() => act('nextReveal')} className="btn btn-marigold btn-lg" waitingText="The host flips to the next chain…">
        {last ? 'See the results' : 'Next chain →'}
      </HostButton>
    </div>
  );
}
