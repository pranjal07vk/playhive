import { useState } from 'react';
import { useRoom } from '../../../hooks/useRoom.js';
import { Avatar } from '../../../components/common/Avatar.jsx';
import { GameHud, PlayerChips, StageCard, WaitingOn } from '../shared/components.jsx';
import { usePlayers } from '../shared/usePlayers.js';
import { roleOf } from './roles.js';
import './View.css';

const MOVE_COPY = {
  nightTarget: { kicker: 'Mafia, wake up', title: 'Choose who to eliminate', done: 'Pick locked in. You can still change it until the night ends.' },
  protect: { kicker: 'Doctor, wake up', title: 'Choose who to protect', done: 'Protected. Fingers crossed.' },
  investigate: { kicker: 'Detective, wake up', title: 'Choose who to investigate', done: 'Case file updated. Keep it to yourself.' },
};

function RoleCard({ v, nameOf }) {
  const [flipped, setFlipped] = useState(false);
  const role = roleOf(v.myRole);
  return (
    <div className={`maf-flip ${flipped ? 'maf-flip-on' : ''}`}>
      <button className="maf-flip-inner" onClick={() => setFlipped((f) => !f)} aria-pressed={flipped}>
        <span className="maf-face maf-front" aria-hidden={flipped}>
          <span className="maf-front-glyph" aria-hidden="true">🂠</span>
          <strong>Tap to see your role</strong>
          <span className="maf-small">Shield your screen first!</span>
        </span>
        <span className={`maf-face maf-back maf-tone-${role.tone}`} aria-hidden={!flipped}>
          <span className="maf-role-icon" aria-hidden="true">{role.icon}</span>
          <span className="maf-small">You are the</span>
          <strong className="maf-role-name">{role.label}</strong>
          <span className="maf-role-power">{role.power}</span>
          <span className="sr-only">Tap again to hide.</span>
          {v.teammates && (
            <span className="maf-role-team">
              {v.teammates.length ? `Your team: ${v.teammates.map((t) => nameOf(t.id)).join(', ')}` : 'You are the only Mafia. Lone wolf mode.'}
            </span>
          )}
        </span>
      </button>
    </div>
  );
}

function PlayerGrid({ ids, selected, onPick, disabled, badges = {}, label }) {
  const { byId, meId } = usePlayers();
  return (
    <div className="maf-grid" role="group" aria-label={label}>
      {ids.map((id) => {
        const p = byId(id);
        const on = selected === id;
        return (
          <button key={id} className={`maf-pick ${on ? 'maf-pick-on' : ''}`} aria-pressed={on} disabled={disabled} onClick={() => onPick(id)}>
            <Avatar player={p} size={40} />
            <span className="maf-pick-name">{p.name}{id === meId ? ' (you)' : ''}</span>
            {badges[id] && <span className="maf-pick-badge">{badges[id]}</span>}
            {on && <span className="maf-pick-tick" aria-hidden="true">✓</span>}
          </button>
        );
      })}
    </div>
  );
}

function Announcement({ a, nameOf }) {
  if (!a) return null;
  const role = a.role ? roleOf(a.role) : null;
  return (
    <div className="maf-news card-sticker" aria-live="polite">
      <span className="maf-news-icon" aria-hidden="true">{a.victimId ? (a.kind === 'vote' ? '⚖️' : '🪦') : '🕊️'}</span>
      <div className="stack" style={{ '--gap': '4px' }}>
        <strong className="maf-news-title">{a.victimId ? nameOf(a.victimId) : a.kind === 'vote' ? 'Nobody was voted out' : 'Nobody died'}</strong>
        <span>{a.text}</span>
        {role && <span className={`badge maf-badge-${role.tone}`}>{role.icon} {role.label}</span>}
      </div>
    </div>
  );
}

function VoteBreakdown({ lastVote, nameOf }) {
  if (!lastVote) return null;
  const rows = Object.entries(lastVote.tally).sort((a, b) => b[1] - a[1]);
  const votersFor = (target) => Object.keys(lastVote.votes).filter((id) => lastVote.votes[id] === target).map(nameOf);
  return (
    <details className="maf-breakdown">
      <summary>How the town voted</summary>
      <ul>
        {rows.map(([id, n]) => <li key={id}><strong>{nameOf(id)}</strong> · <span className="numeric">{n}</span> ({votersFor(id).join(', ')})</li>)}
        <li><strong>Skip</strong> · <span className="numeric">{lastVote.skips}</span>{lastVote.skips ? ` (${votersFor(null).join(', ')})` : ''}</li>
      </ul>
    </details>
  );
}

function NightMove({ v, act, nameOf }) {
  const move = v.myMove;
  const copy = MOVE_COPY[move.type];
  const badges = {};
  if (move.type === 'nightTarget' && v.teamPicks) {
    for (const [mafiaId, target] of Object.entries(v.teamPicks)) badges[target] = [badges[target], `🗡️ ${nameOf(mafiaId)}`].filter(Boolean).join(' · ');
  }
  if (move.type === 'investigate' && v.investigations) {
    for (const i of v.investigations) badges[i.targetId] = i.result === 'mafia' ? '🚨 Mafia' : '✅ Not mafia';
  }
  const lockedOut = move.type !== 'nightTarget' && move.done;
  return (
    <div className="stack" style={{ '--gap': '14px' }}>
      <p className="maf-move-title">{copy.title}</p>
      {move.type === 'protect' && v.lastProtectedId && <p className="maf-small">You can't protect {nameOf(v.lastProtectedId)} again tonight.</p>}
      <PlayerGrid ids={move.targetIds} selected={move.targetId} disabled={lockedOut} badges={badges} label={copy.title} onPick={(targetId) => act(move.type, { targetId })} />
      <p className="maf-small" aria-live="polite">{move.done ? copy.done : 'Tap a name. Only you can see this.'}</p>
    </div>
  );
}

function Casebook({ investigations, nameOf }) {
  if (!investigations?.length) return null;
  return (
    <section className="maf-casebook" aria-label="Your investigations">
      <p className="eyebrow">🔍 Your case file (secret)</p>
      <ul>
        {investigations.map((i) => (
          <li key={i.night}>Night {i.night}: <strong>{nameOf(i.targetId)}</strong> is {i.result === 'mafia' ? <span className="text-gulal">🚨 MAFIA</span> : <span className="text-parrot">✅ not mafia</span>}</li>
        ))}
      </ul>
    </section>
  );
}

function TownStrip({ players }) {
  const { byId, meId } = usePlayers();
  return (
    <ul className="maf-town" aria-label="The town">
      {players.map((p) => {
        const who = byId(p.id);
        const role = p.revealedRole ? roleOf(p.revealedRole) : null;
        const status = p.left ? 'left' : p.alive ? 'alive' : 'out';
        return (
          <li key={p.id} className={`maf-townie maf-townie-${status}`}>
            <Avatar player={who} size={34} />
            <span className="maf-townie-name">{who.name}{p.id === meId ? ' (you)' : ''}</span>
            <span className="maf-small">{p.left ? 'Left' : p.alive ? (who.connected ? 'Alive' : 'Alive · away') : `💀 ${role ? role.label : 'Out'}`}</span>
          </li>
        );
      })}
    </ul>
  );
}

export default function MafiaView({ game }) {
  const { act, state } = useRoom();
  const { nameOf, meId } = usePlayers();
  const v = game.view;
  const s = state.room.settings;
  const phase = game.phase;
  const playing = !game.spectating && v.myRole;
  const dead = playing && !v.amAlive;
  const role = roleOf(v.myRole);
  const aliveIds = v.players.filter((p) => p.alive).map((p) => p.id);
  const theme = phase === 'night' || phase === 'roles' ? 'night' : 'day';

  const hud = {
    roles: { kicker: 'Setup', title: 'Who are you, really?', total: 15 },
    night: { kicker: `Night ${v.night}`, title: 'Night falls on the town', total: s.nightSeconds },
    day: { kicker: `Day ${v.night}`, title: 'Rise and shine, suspects', total: s.discussionSeconds },
    voting: { kicker: `Day ${v.night} · Vote`, title: 'Who gets the boot?', total: s.voteSeconds },
  }[phase] ?? { kicker: 'Mafia', title: 'Mafia', total: 0 };

  return (
    <div className={`maf maf-${theme}`}>
      <div className="maf-sky" aria-hidden="true">
        {theme === 'night' ? <><span className="maf-moon" /><span className="maf-stars" /></> : <span className="maf-sun" />}
      </div>

      <div className="maf-body stack" style={{ '--gap': '22px' }}>
        <GameHud kicker={hud.kicker} title={hud.title} deadline={game.deadline} total={hud.total}>
          {playing && phase !== 'roles' && <span className={`badge maf-badge-${role.tone} maf-me-badge`}>{role.icon} You: {role.label}</span>}
        </GameHud>

        {dead && <p className="maf-dead" role="status">💀 You're out, but stay and watch (no spoilers on the call!)</p>}
        {game.spectating && <p className="maf-dead" role="status">👀 You're watching this game. Roles stay secret until the end.</p>}

        {phase === 'roles' && (
          <StageCard tone="dark" kicker="Your secret role" className="maf-stage">
            <div className="stack" style={{ '--gap': '18px' }}>
              {playing ? <RoleCard v={v} nameOf={nameOf} /> : <p className="stage-text">Everyone is peeking at their role…</p>}
              {playing && (
                <button className="btn btn-marigold btn-lg btn-block" disabled={v.readyIds.includes(meId)} onClick={() => act('ready')}>
                  {v.readyIds.includes(meId) ? 'Ready ✓ Waiting for the others' : "I've seen it. Ready!"}
                </button>
              )}
              <p className="maf-small" aria-live="polite">{v.readyIds.length} of {v.players.length} ready · {v.mafiaCount} Mafia hide among you</p>
              <PlayerChips ids={v.players.filter((p) => !p.left).map((p) => p.id)} marked={v.readyIds} label="Ready players" />
            </div>
          </StageCard>
        )}

        {phase === 'night' && (
          <>
            {v.announcement?.kind === 'vote' && (
              <div className="stack" style={{ '--gap': '8px' }}>
                <Announcement a={v.announcement} nameOf={nameOf} />
                <VoteBreakdown lastVote={v.lastVote} nameOf={nameOf} />
              </div>
            )}
            <StageCard tone="dark" kicker={v.myMove ? MOVE_COPY[v.myMove.type].kicker : 'Lights out'} className="maf-stage">
              {v.myMove ? (
                <NightMove v={v} act={act} nameOf={nameOf} />
              ) : (
                <div className="stack" style={{ '--gap': '8px' }}>
                  <p className="stage-text">The town sleeps… 🌙</p>
                  <p className="maf-small">Eyes closed, mics quiet. The night ends on its own.</p>
                </div>
              )}
            </StageCard>
            {v.myRole === 'detective' && <Casebook investigations={v.investigations} nameOf={nameOf} />}
          </>
        )}

        {phase === 'day' && (
          <>
            <Announcement a={v.announcement} nameOf={nameOf} />
            <StageCard tone="paper" kicker="Discussion" className="maf-stage">
              <div className="stack" style={{ '--gap': '14px' }}>
                <p className="stage-text">Talk it out on the call. Someone here is lying.</p>
                <p className="muted">Voting opens when the timer runs out.</p>
                {v.canSkipDiscussion ? (
                  <button className="btn btn-primary" onClick={() => act('skipDiscussion')}>Skip discussion → vote now</button>
                ) : (
                  <p className="muted">The host can skip ahead to the vote.</p>
                )}
              </div>
            </StageCard>
            {v.myRole === 'detective' && <Casebook investigations={v.investigations} nameOf={nameOf} />}
          </>
        )}

        {phase === 'voting' && (
          <StageCard tone="paper" kicker={v.hasVoted ? 'Vote in · you can still change it' : 'Cast your vote'} className="maf-stage">
            <div className="stack" style={{ '--gap': '14px' }}>
              {playing && v.amAlive ? (
                <>
                  <PlayerGrid ids={aliveIds.filter((id) => id !== meId)} selected={v.hasVoted ? v.myVote : undefined} label="Vote to eliminate" onPick={(targetId) => act('vote', { targetId })} />
                  <button className={`btn btn-cream btn-block maf-skip ${v.hasVoted && v.myVote === null ? 'maf-skip-on' : ''}`} aria-pressed={v.hasVoted && v.myVote === null} onClick={() => act('vote', { targetId: null })}>
                    🤷 Skip vote{v.hasVoted && v.myVote === null ? ' ✓' : ''}
                  </button>
                  <p className="muted" aria-live="polite">{v.hasVoted ? `You voted ${v.myVote ? `for ${nameOf(v.myVote)}` : 'to skip'}.` : 'A clear majority over skip is needed to vote someone out.'}</p>
                </>
              ) : (
                <p className="stage-text">The living are voting…</p>
              )}
              <p className="muted">{v.votedIds.length} of {v.votedIds.length + v.waitingOn.length} have voted</p>
              <PlayerChips ids={[...v.votedIds, ...v.waitingOn]} marked={v.votedIds} label="Voting progress" />
              <WaitingOn ids={v.waitingOn} />
            </div>
          </StageCard>
        )}

        <section className="stack" style={{ '--gap': '8px' }}>
          <p className="eyebrow">The town · {aliveIds.length} alive</p>
          <TownStrip players={v.players} />
        </section>
      </div>
    </div>
  );
}
