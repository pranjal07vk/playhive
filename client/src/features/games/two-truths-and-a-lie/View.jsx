import { useState } from 'react';
import { useRoom } from '../../../hooks/useRoom.js';
import { GameHud, HostButton, PlayerChips, TurnBanner } from '../shared/components.jsx';
import { usePlayers } from '../shared/usePlayers.js';
import './View.css';

const MIN = 3;
const MAX = 120;
const REVEAL_SECONDS = 10;
const TITLES = { writing: 'Cook up a lie', voting: 'Someone\'s definitely lying.', reveal: 'Busted!' };

function validate(statements, lieIndex) {
  const errors = statements.map((s) => (s.trim().length < MIN ? `Write at least ${MIN} characters.` : null));
  const seen = new Map();
  statements.forEach((s, i) => {
    const key = s.trim().toLowerCase();
    if (key && seen.has(key)) errors[i] = 'This one matches another statement. Make all three different.';
    seen.set(key, i);
  });
  return { errors, lie: lieIndex === null ? 'Pick which statement is the lie.' : null };
}

// The storyteller's private form: three statements and a secret lie.
function StoryForm({ onSubmit }) {
  const [statements, setStatements] = useState(['', '', '']);
  const [lieIndex, setLieIndex] = useState(null);
  const [tried, setTried] = useState(false);
  const [sending, setSending] = useState(false);
  const { errors, lie } = validate(statements, lieIndex);
  const valid = !lie && errors.every((e) => !e);

  const submit = async (e) => {
    e.preventDefault();
    setTried(true);
    if (!valid || sending) return;
    setSending(true);
    const res = await onSubmit({ statements: statements.map((s) => s.trim()), lieIndex });
    if (!res?.ok) setSending(false);
  };

  return (
    <form className="ttl-form card card-paper card-sticker" onSubmit={submit} noValidate>
      <p className="ttl-form-lede">Two true things about you, one convincing fib. Only share what you're happy for the group to know.</p>
      {statements.map((text, i) => (
        <div key={i} className={`ttl-field ${lieIndex === i ? 'ttl-field-lie' : ''}`}>
          <label className="field-label" htmlFor={`ttl-s${i}`}>Statement {i + 1}</label>
          <textarea
            id={`ttl-s${i}`}
            className="textarea ttl-textarea"
            value={text}
            maxLength={MAX}
            rows={2}
            placeholder={['I once got lost in my own college', 'I can name every IPL team captain', 'I have never eaten a mango'][i]}
            aria-invalid={tried && Boolean(errors[i])}
            aria-describedby={`ttl-s${i}-meta`}
            onChange={(e) => setStatements(statements.map((s, j) => (j === i ? e.target.value : s)))}
          />
          <div id={`ttl-s${i}-meta`} className="ttl-field-meta">
            {tried && errors[i] ? <span className="field-error">{errors[i]}</span> : <span />}
            <span className="numeric ttl-count">{text.length}/{MAX}</span>
          </div>
          <label className="ttl-lie-radio">
            <input type="radio" name="ttl-lie" checked={lieIndex === i} onChange={() => setLieIndex(i)} />
            <span>{lieIndex === i ? '🤥 This one\'s the lie' : 'This one\'s the lie'}</span>
          </label>
        </div>
      ))}
      {tried && lie && <p className="field-error" role="alert">{lie}</p>}
      <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={sending}>
        {sending ? 'Sending…' : 'Lock in my statements'}
      </button>
    </form>
  );
}

function StatementCard({ index, text, state, onPick, voters, points }) {
  const { nameOf } = usePlayers();
  const { picked, lie, myLie, revealed, canVote } = state;
  const label = `Statement ${index + 1}: ${text}`;
  const body = (
    <>
      <span className="ttl-card-num numeric" aria-hidden="true">{index + 1}</span>
      <span className="ttl-card-text">{text}</span>
      {revealed && lie && <span className="ttl-stamp" aria-hidden="true">LIE</span>}
      {revealed && !lie && <span className="ttl-true badge badge-parrot">True ✓</span>}
      {!revealed && myLie && <span className="badge badge-gulal ttl-mine">Your lie 🤫 only you see this</span>}
      {picked && !revealed && <span className="badge ttl-mine">Your vote 🔒</span>}
      {revealed && (
        <span className="ttl-voters">
          {voters.length ? `Voted: ${voters.map(nameOf).join(', ')}` : 'No votes'}
          {picked && ' (incl. you)'}
        </span>
      )}
      {revealed && <span className="sr-only">{lie ? 'This was the lie.' : 'This was true.'}</span>}
    </>
  );
  const cls = `ttl-card ttl-card-${index} ${picked ? 'ttl-card-picked' : ''} ${revealed && lie ? 'ttl-card-lie' : ''}`;
  if (!canVote) return <li className={cls} aria-label={revealed ? undefined : label}>{body}</li>;
  return (
    <li>
      <button className={cls} aria-pressed={picked} onClick={() => onPick(index)} disabled={!canVote}>
        {body}
      </button>
    </li>
  );
}

export default function TwoTruthsView({ game }) {
  const { act, state } = useRoom();
  const { nameOf, meId } = usePlayers();
  const v = game.view;
  const settings = state.room.settings;
  const phase = game.phase;
  const revealed = phase === 'reveal';
  const total = phase === 'writing' ? settings.writeSeconds : phase === 'voting' ? settings.voteSeconds : REVEAL_SECONDS;
  const iCanVote = phase === 'voting' && !v.isStoryteller && !game.spectating && v.myVote === null && v.waitingOn.includes(meId);
  const teller = nameOf(v.storytellerId);

  return (
    <div className="stack ttl" style={{ '--gap': '22px' }}>
      <GameHud kicker={`Turn ${v.turn} of ${v.totalTurns}`} title={TITLES[phase] ?? 'Two Truths and a Lie'} deadline={game.deadline} total={total} />
      <TurnBanner
        playerId={v.storytellerId}
        mine={phase === 'writing' ? 'Your turn, storyteller. Make it believable.' : 'Your statements are out there. Poker face on.'}
        theirs={phase === 'writing' ? '{name} is cooking up two truths and a lie…' : 'Spot {name}\'s lie.'}
      />

      {phase === 'writing' && v.isStoryteller && !game.spectating && <StoryForm key={v.turn} onSubmit={(payload) => act('submit', payload)} />}

      {phase === 'writing' && !v.isStoryteller && (
        <div className="ttl-waiting card card-sticker" aria-live="polite">
          <span className="ttl-pen" aria-hidden="true">✍️</span>
          <p className="ttl-waiting-text">{teller} is writing. If the timer runs out, their turn is skipped.</p>
        </div>
      )}

      {v.statements && (
        <ol className="ttl-cards" aria-label="Statements">
          {v.statements.map((text, i) => {
            const voters = revealed && v.votes ? Object.keys(v.votes).filter((id) => v.votes[id] === i) : [];
            return (
              <StatementCard
                key={i}
                index={i}
                text={text}
                voters={voters}
                onPick={(choice) => act('vote', { choice })}
                state={{ picked: v.myVote === i, lie: revealed && v.lieIndex === i, myLie: v.myLie === i, revealed, canVote: iCanVote }}
              />
            );
          })}
        </ol>
      )}

      {phase === 'voting' && (
        <div className="stack" style={{ '--gap': '10px' }} aria-live="polite">
          <p className="muted center">
            {v.isStoryteller ? 'Sit tight while they vote.' : game.spectating ? 'You are watching this round.' : v.myVote === null ? 'Tap the statement you think is the lie. One vote, no take-backs.' : 'Vote locked. Now stare at them suspiciously.'}
          </p>
          <PlayerChips ids={[...v.votedIds, ...v.waitingOn]} marked={v.votedIds} label="Who has voted" />
        </div>
      )}

      {revealed && v.roundPoints && (
        <section className="ttl-points card" aria-live="polite">
          <h3 className="ttl-points-title">This turn</h3>
          <ul>
            {Object.entries(v.roundPoints).map(([id, pts]) => (
              <li key={id}>
                <span>{nameOf(id)}{id === meId ? ' (you)' : ''}</span>
                <span className="muted">{id === v.storytellerId ? `fooled ${pts}` : 'found the lie'}</span>
                <span className="numeric text-marigold">+{pts}</span>
              </li>
            ))}
          </ul>
          {Object.keys(v.votes ?? {}).length === 0 && <p className="muted">Nobody voted this time.</p>}
        </section>
      )}

      {revealed && <HostButton onClick={() => act('next')}>{v.turn >= v.totalTurns ? 'See final results' : 'Next storyteller'}</HostButton>}

      {v.skipped.length > 0 && <p className="muted center ttl-skipped">Skipped (ran out of time or away): {v.skipped.map(nameOf).join(', ')}</p>}
    </div>
  );
}
