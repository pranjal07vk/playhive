import { useRef, useState } from 'react';
import { useRoom } from '../../../hooks/useRoom.js';
import { useSocketEvent } from '../../../hooks/useSocketEvent.js';
import { GameHud, PlayerChips, StageCard, TurnBanner } from '../shared/components.jsx';
import { usePlayers } from '../shared/usePlayers.js';
import { DrawingCanvas } from './DrawingCanvas.jsx';
import './View.css';

const CHOOSE_SECONDS = 15;
const ROUND_END_SECONDS = 6;

export default function PictionaryView({ game }) {
  const { act, draw, state } = useRoom();
  const { meId, nameOf, roster } = usePlayers();
  const canvasRef = useRef(null);
  const v = game.view;
  const { phase, spectating } = game;
  const drawerName = nameOf(v.drawerId);
  const drawing = phase === 'drawing';

  // Live strokes from the drawer (the drawer never receives their own).
  useSocketEvent('draw:stroke', ({ stroke }) => canvasRef.current?.appendSegment(stroke));
  useSocketEvent('draw:clear', () => canvasRef.current?.clear());
  useSocketEvent('draw:undo', ({ id }) => canvasRef.current?.undo(id));

  const title = {
    choosing: v.isDrawer ? 'Pick your masterpiece.' : `${drawerName} is choosing…`,
    drawing: v.isDrawer ? 'Your turn, Picasso.' : v.iGuessed ? 'Nailed it! Watch the others squirm.' : 'What on earth is that?',
    roundEnd: 'Pencils down!',
  }[phase];
  const hud = drawing
    ? { deadline: v.endsAt, total: state.room.settings.drawSeconds }
    : { deadline: game.deadline, total: phase === 'choosing' ? CHOOSE_SECONDS : ROUND_END_SECONDS };
  const guesserIds = roster.map((p) => p.id).filter((id) => id !== v.drawerId);

  return (
    <div className="pic stack" style={{ '--gap': '20px' }}>
      <GameHud kicker={`Turn ${v.turn} of ${v.totalTurns}`} title={title} {...hud} />

      {phase === 'choosing' && (v.isDrawer ? <WordPicker options={v.options} onPick={(index) => act('choose', { index })} /> : (
        <StageCard tone="paper" kicker="Sharpening pencils" className="pic-waitcard">
          <TurnBanner playerId={v.drawerId} mine="" theirs="{name} is picking a word" />
          <p className="muted">Get your guessing fingers ready. The fastest correct guess scores the most.</p>
        </StageCard>
      ))}

      {drawing && (
        <>
          {v.isDrawer ? (
            <div className="pic-word" aria-live="polite">
              <span className="pic-word-label">Draw this</span>
              <strong className="pic-word-text">{v.word}</strong>
              <span className="muted pic-word-rule">No letters, no numbers. Only art.</span>
            </div>
          ) : (
            <div className="pic-hint" aria-label={`Hint: ${hintLabel(v.hint)}`}>
              <span className="pic-word-label" aria-hidden="true">{drawerName} is drawing</span>
              <p className="pic-hint-pattern numeric" aria-hidden="true">
                {v.hint.split(' ').map((word, i) => (
                  <span key={i} className="pic-hint-word">{[...word].map((ch, j) => <span key={j} className={ch === '_' ? 'pic-blank' : 'pic-letter'}>{ch === '_' ? '' : ch}</span>)}</span>
                ))}
              </p>
              <span className="muted pic-hint-count">{hintCount(v.hint)}</span>
            </div>
          )}

          <div className="pic-board">
            <div className="pic-canvas-col">
              <DrawingCanvas
                ref={canvasRef}
                strokes={v.strokes}
                syncKey={v.isDrawer ? `turn-${v.turn}` : v.strokes}
                editable={v.isDrawer && !spectating}
                onStroke={(stroke) => draw('stroke', { stroke })}
                onUndo={() => draw('undo')}
                onClear={() => draw('clear')}
                maxPoints={30000}
                label={v.isDrawer ? 'Your canvas' : `${drawerName}'s drawing`}
              />
              {!v.isDrawer && !spectating && <GuessBox key={v.turn} iGuessed={v.iGuessed} onGuess={(text) => act('guess', { text })} note={v.myNote} />}
            </div>
            <aside className="pic-side stack" style={{ '--gap': '14px' }}>
              <div>
                <p className="eyebrow">Guessers · {v.guessedIds.length} of {guesserIds.length} got it</p>
                <PlayerChips ids={guesserIds} marked={v.guessedIds} label="Who has guessed the word" />
              </div>
              <Feed feed={v.feed} nameOf={nameOf} meId={meId} />
            </aside>
          </div>
        </>
      )}

      {phase === 'roundEnd' && <RoundEnd v={v} nameOf={nameOf} />}
    </div>
  );
}

const hintCount = (hint) => hint.split(' ').map((w) => w.length).join(' + ') + ' letters';
const hintLabel = (hint) => `${hintCount(hint)}${/[^_ ]/.test(hint) ? `, revealed: ${[...hint].map((c, i) => (c !== '_' && c !== ' ' ? `letter ${i + 1} is ${c}` : null)).filter(Boolean).join(', ')}` : ''}`;

function WordPicker({ options, onPick }) {
  const [picked, setPicked] = useState(null);
  return (
    <div className="stack" style={{ '--gap': '14px' }}>
      <p className="muted">Only you can see these. Pick one you can actually draw.</p>
      <div className="pic-cards" role="group" aria-label="Word options">
        {options.map((word, i) => (
          <button
            key={word}
            className={`pic-card pic-card-${i}`}
            aria-pressed={picked === i}
            disabled={picked !== null}
            onClick={() => {
              setPicked(i);
              onPick(i).then((r) => r && !r.ok && setPicked(null));
            }}
          >
            <span className="pic-card-tag numeric">{['Easy-ish', 'Medium', 'Bold'][i] ?? 'Word'}</span>
            <span className="pic-card-word">{word}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function GuessBox({ iGuessed, onGuess, note }) {
  const [text, setText] = useState('');
  if (iGuessed) return <p className="pic-got-it" role="status"><span aria-hidden="true">✓ </span>You got it! No more guesses needed.</p>;
  const submit = (e) => {
    e.preventDefault();
    const guess = text.trim();
    if (!guess) return;
    onGuess(guess);
    setText('');
  };
  return (
    <form className="pic-guess" onSubmit={submit}>
      <label className="sr-only" htmlFor="pic-guess-input">Your guess</label>
      <input id="pic-guess-input" className="input" value={text} maxLength={60} autoComplete="off" autoCapitalize="none" enterKeyHint="send" placeholder="Type your guess…" onChange={(e) => setText(e.target.value)} />
      <button className="btn btn-marigold" type="submit" disabled={!text.trim()}>Guess</button>
      <p className="pic-note" aria-live="polite">{note ? note.text : ''}</p>
    </form>
  );
}

function Feed({ feed, nameOf, meId }) {
  return (
    <section className="pic-feed" aria-label="Guesses">
      <p className="eyebrow">Guess feed</p>
      {feed.length === 0 ? <p className="muted">No guesses yet. Be brave.</p> : (
        <ol aria-live="polite" aria-relevant="additions">
          {feed.slice().reverse().map((f) => f.kind === 'correct' ? (
            <li key={f.id} className="pic-feed-correct">{f.text} <span aria-hidden="true">✓</span></li>
          ) : (
            <li key={f.id}><strong>{f.playerId === meId ? 'You' : nameOf(f.playerId)}:</strong> {f.text}</li>
          ))}
        </ol>
      )}
    </section>
  );
}

function RoundEnd({ v, nameOf }) {
  const r = v.lastRound;
  const reason = { allGuessed: 'Everyone got it!', time: 'Time ran out.', drawerLeft: 'The artist left the building.' }[r.reason];
  return (
    <div className="pic-board">
      <div className="pic-canvas-col">
        <StageCard tone="marigold" kicker={reason} className="pic-reveal">
          <p className="pic-word-label">The word was</p>
          <p className="stage-text pic-reveal-word">{r.word}</p>
        </StageCard>
        <DrawingCanvas strokes={v.strokes} compact label={`${nameOf(r.drawerId)}'s final drawing`} />
      </div>
      <section className="pic-side card" aria-label="Points this turn">
        <p className="eyebrow">Points this turn</p>
        <ul className="pic-points">
          <li><span>🎨 {nameOf(r.drawerId)} (drawer)</span><strong className="numeric">+{r.drawerPoints}</strong></li>
          {r.guessers.map((g, i) => (
            <li key={g.playerId}><span>{i === 0 ? '⚡ ' : '✓ '}{nameOf(g.playerId)}</span><strong className="numeric">+{g.points}</strong></li>
          ))}
          {r.guessers.length === 0 && <li className="muted">Nobody guessed it. Abstract art, maybe?</li>}
        </ul>
      </section>
    </div>
  );
}
