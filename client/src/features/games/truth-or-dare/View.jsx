import { useRoom } from '../../../hooks/useRoom.js';
import { GameHud, StageCard, TurnBanner } from '../shared/components.jsx';
import { usePlayers } from '../shared/usePlayers.js';
import './View.css';

const OUTCOME = {
  done: 'did it. +1 point!',
  skipped: 'used a skip. No point.',
  timeout: 'ran out of time. No point.',
  'host-skipped': 'was skipped by the host.',
  away: 'was away, so their turn was skipped.',
  left: 'left the game.',
};

export default function TruthOrDareView({ game }) {
  const { act, isHost } = useRoom();
  const { nameOf, byId } = usePlayers();
  const v = game.view;
  const choosing = game.phase === 'choosing';
  const mine = v.isMyTurn && !game.spectating;
  const current = byId(v.currentPlayerId);
  const turn = { turn: v.turn };

  const title = choosing
    ? mine ? 'Your turn, superstar.' : `${current.name} is deciding…`
    : v.kind === 'truth' ? 'Truth time. No fibbing.' : 'Dare time. No backing out.';

  return (
    <div className="stack tod" style={{ '--gap': '24px' }}>
      <GameHud kicker={`Round ${v.round} of ${v.totalRounds} · Turn ${v.turn}`} title={title} deadline={game.deadline} total={choosing ? 30 : 90} />

      <TurnBanner playerId={v.currentPlayerId} mine={choosing ? 'Pick your poison 👇' : 'All eyes on you!'} theirs={choosing ? '{name} is picking…' : "It's {name}'s turn"} />
      {!current.connected && <p className="muted" aria-live="polite">{current.name} looks offline. Their turn will be skipped when the timer runs out.</p>}

      {choosing && (
        <div className="tod-pick" role="group" aria-label="Truth or dare">
          {mine ? (
            <>
              <button className="tod-card tod-truth" onClick={() => act('choose', { kind: 'truth' })}>
                <span className="tod-card-emoji" aria-hidden="true">🤫</span>
                <span className="tod-card-word">Truth</span>
                <span className="tod-card-hint">Spill something</span>
              </button>
              <button className="tod-card tod-dare" onClick={() => act('choose', { kind: 'dare' })}>
                <span className="tod-card-emoji" aria-hidden="true">🔥</span>
                <span className="tod-card-word">Dare</span>
                <span className="tod-card-hint">Do something</span>
              </button>
            </>
          ) : (
            <>
              <div className="tod-card tod-truth tod-card-idle" aria-hidden="true"><span className="tod-card-emoji">🤫</span><span className="tod-card-word">Truth</span></div>
              <div className="tod-card tod-dare tod-card-idle" aria-hidden="true"><span className="tod-card-emoji">🔥</span><span className="tod-card-word">Dare</span></div>
            </>
          )}
        </div>
      )}
      {choosing && mine && <p className="muted center">No pick in 30 seconds and fate picks for you.</p>}

      {!choosing && v.prompt && (
        <StageCard tone="paper" kicker={v.kind === 'truth' ? '🤫 Truth' : '🔥 Dare'} className="tod-prompt">
          <p className="stage-text">{v.prompt}</p>
          <p className="tod-for">for {mine ? 'you' : current.name}</p>
        </StageCard>
      )}

      {!choosing && mine && (
        <div className="tod-actions">
          <button className="btn btn-parrot btn-lg" onClick={() => act('done', turn)}>Done ✅</button>
          <button className="btn btn-ghost btn-lg" disabled={!v.canSkip} onClick={() => act('skip', turn)}>
            {v.mySkipsLeft > 0 ? `Skip (${v.mySkipsLeft} left)` : 'No skips left'}
          </button>
        </div>
      )}
      {!choosing && !mine && <p className="center tod-judge">👀 Watch and judge. Did {current.name} really do it?</p>}

      {isHost && !v.isMyTurn && (
        <div className="center">
          <button className="btn btn-ghost btn-sm" onClick={() => act('skipTurn', turn)}>Skip this turn (AFK)</button>
        </div>
      )}

      <p className="muted center" aria-live="polite">
        {v.lastTurn ? `Last turn: ${nameOf(v.lastTurn.playerId)} ${OUTCOME[v.lastTurn.outcome] ?? ''}` : 'First turn. No pressure.'}
      </p>
    </div>
  );
}
