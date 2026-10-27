import { useRoom } from '../../../hooks/useRoom.js';
import { Avatar } from '../../../components/common/Avatar.jsx';
import { GameHud, HostButton, PlayerChips, TurnBanner } from '../shared/components.jsx';
import { usePlayers } from '../shared/usePlayers.js';
import './View.css';

const SUMMARY_SECONDS = 15;

// The tin: the hider first, then each finder squeezing in, in find order.
function SardineTin({ hiderId, found }) {
  const { byId, meId } = usePlayers();
  const fish = [{ playerId: hiderId, hider: true }, ...found];
  return (
    <div className="sar-tin" role="img" aria-label={`The pack: ${fish.length} sardine${fish.length === 1 ? '' : 's'} in the tin`}>
      <span className="sar-lid" aria-hidden="true" />
      <ol className="sar-fish-list">
        {fish.map((f, i) => {
          const p = byId(f.playerId);
          return (
            <li key={f.playerId} className={`sar-fish sar-fish-${i % 4} ${f.playerId === meId ? 'sar-fish-me' : ''}`} style={{ '--i': i }}>
              <Avatar player={p} size={26} />
              <span className="sar-fish-name">{p.name}{p.left ? ' (left)' : ''}</span>
              <span className="sar-fish-meta numeric">{f.hider ? 'hider' : `#${f.place} · ${f.afterSeconds}s`}</span>
              <span className="sar-tail" aria-hidden="true" />
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export default function SardinesView({ game }) {
  const { act, isHost, state } = useRoom();
  const { nameOf, meId } = usePlayers();
  const v = game.view;
  const phase = game.phase;
  const settings = state.room.settings;
  const canAct = !game.spectating;
  const hider = nameOf(v.hiderId);
  const isSeeker = v.seekers.includes(meId);
  const total = phase === 'hiding' ? settings.hideSeconds : phase === 'seeking' ? settings.seekSeconds : SUMMARY_SECONDS;
  const title = phase === 'hiding' ? (v.isHider ? 'Go hide!' : 'Eyes closed, count out loud!') : phase === 'seeking' ? (v.isHider ? 'Shh. Stay very still.' : v.amFound ? 'You\'re in the tin!' : 'Find the hider!') : v.voided ? 'Round called off' : 'Tin\'s full!';

  return (
    <div className="stack sar" style={{ '--gap': '20px' }}>
      <GameHud kicker={`Round ${v.round} of ${v.totalRounds}`} title={title} deadline={game.deadline} total={total} />
      <TurnBanner playerId={v.hiderId} mine="You're the hider this round." theirs="{name} is the hider." />

      {phase === 'hiding' && v.isHider && canAct && (
        <div className="sar-panel sar-panel-hider">
          <p className="sar-big">Go hide! Tap when you're in position.</p>
          <p className="sar-sub">Pick a spot with room for friends to squeeze in. Stay in the agreed play area.</p>
          <button className="btn btn-primary btn-lg btn-block" onClick={() => act('hidden')}>I'm hidden 🤫</button>
          <p className="muted">Or the search starts automatically when the timer ends.</p>
        </div>
      )}
      {phase === 'hiding' && !v.isHider && (
        <div className="sar-panel" aria-live="polite">
          <p className="sar-big">🙈 No peeking!</p>
          <p className="sar-sub">{hider} is finding a spot. The search starts when they tap ready or time runs out.</p>
        </div>
      )}

      {phase === 'seeking' && isSeeker && !v.amFound && canAct && (
        <div className="sar-panel">
          <p className="sar-sub">Found {hider}? Squeeze in with them quietly, then tap.</p>
          <button className="sar-found-btn" onClick={() => act('found')}>I found them! 🐟</button>
          <p className="muted">The app doesn't track location, so only tap when you're really there.</p>
        </div>
      )}
      {phase === 'seeking' && v.amFound && <p className="sar-note" aria-live="polite">Stay quiet and wait for the others. Sardines don't giggle.</p>}
      {phase === 'seeking' && v.isHider && <p className="sar-note" aria-live="polite">Every seeker still searching when time's up is a point for you.</p>}

      {phase !== 'hiding' && <SardineTin hiderId={v.hiderId} found={v.found} />}

      {phase === 'seeking' && (
        <section aria-live="polite">
          <h3 className="sar-list-title">Still searching ({v.stillSeeking.length})</h3>
          {v.stillSeeking.length ? <PlayerChips ids={v.stillSeeking} label="Still searching" /> : <p className="muted">Everyone's in!</p>}
        </section>
      )}
      {phase === 'seeking' && isHost && canAct && (
        <button className="btn btn-ghost" onClick={() => act('endRound')}>End round now (counts as time up)</button>
      )}

      {phase === 'roundSummary' && (
        <section className="card card-sticker sar-summary" aria-live="polite">
          {v.voided ? (
            <p>{hider} left the game, so this round doesn't count. No points.</p>
          ) : (
            <>
              <h3 className="sar-list-title">Points this round</h3>
              <ul>
                {Object.entries(v.roundPoints ?? {}).sort((a, b) => b[1] - a[1]).map(([id, pts]) => (
                  <li key={id}>
                    <span>{nameOf(id)}{id === meId ? ' (you)' : ''}</span>
                    <span className="muted">{id === v.hiderId ? `hider · ${pts} never found them` : pts === 0 ? 'last one in' : 'found them'}</span>
                    <span className="numeric text-marigold">+{pts}</span>
                  </li>
                ))}
              </ul>
              {v.stillSeeking.length > 0 && <p className="muted">Never found: {v.stillSeeking.map(nameOf).join(', ')}</p>}
            </>
          )}
        </section>
      )}
      {phase === 'roundSummary' && <HostButton onClick={() => act('next')}>{v.round >= v.totalRounds ? 'See final results' : 'Next round, new hider'}</HostButton>}
    </div>
  );
}
