import { fail, requirePhase } from '../baseGame.js';
import { markLeft, nameOf, ranking, requireParticipant, secondsFromNow } from '../shared/helpers.js';
import { shuffle } from '../../utils/random.js';

/*
 * Mafia
 * Phases: roles -> night -> day -> voting -> (night | finished)
 * The server is the narrator, so the host plays like everyone else.
 *
 * Roles: 1 mafia for 6–7 players, 2 for 8–10, 3 for 11–12; one doctor, one
 * detective, everyone else is a villager.
 * - roles:  everyone privately sees their role (mafia also see their team) and
 *           taps ready. Moves on when every connected player is ready or after 15s.
 * - night:  each living mafia picks a living non-mafia target (they may change
 *           it; teammates see each other's picks). The doctor protects anyone
 *           alive, themselves included, but never the same person two nights in
 *           a row. The detective investigates one living player (not themselves)
 *           and privately learns 'mafia' or 'not mafia'. Night ends when every
 *           connected living actor has acted, or after nightSeconds.
 *           The kill is the plurality of mafia picks (ties broken at random, no
 *           picks = no kill). If the doctor protected that player, nobody dies.
 * - day:    the death (with the victim's role) or "nobody died" is announced,
 *           then discussion on the call. The host may skip to voting.
 * - voting: living players vote for a living player or skip (targetId null)
 *           and may change their vote until everyone connected has voted or time
 *           runs out. A strict plurality (more than skip and every other player)
 *           is eliminated and their role revealed; a tie or a skip win means no one.
 * Win: town wins when every mafia is dead; mafia win when living mafia are at
 * least as many as living non-mafia. Checked after every death or departure.
 * Points: +1 for each member of the winning team, +1 for surviving.
 *
 * Privacy: roles of living players are never shown, not even to the dead
 * (they are still on the call). Who targeted, protected or investigated whom
 * is never sent to anyone except the actor (and the mafia team for kill picks).
 * Players who leave are removed without revealing their role.
 */
const ROLES_SECONDS = 15;

export const mafiaCountFor = (playerCount) => (playerCount <= 7 ? 1 : playerCount <= 10 ? 2 : 3);

const ROLE_LABEL = { mafia: 'Mafia', doctor: 'Doctor', detective: 'Detective', villager: 'Villager' };

const isAlive = (state, id) => state.alive.includes(id);
const isMafia = (state, id) => state.roles[id] === 'mafia';
const teamOf = (state, id) => (isMafia(state, id) ? 'mafia' : 'town');
const isConnected = (ctx, id) => !ctx.connected || ctx.connected.has(id);
const holderOf = (state, role) => state.order.find((id) => state.roles[id] === role);

function freshNight() {
  return { mafiaVotes: {}, protect: null, investigated: null };
}

function startNight(state, ctx) {
  state.night += 1;
  state.phase = 'night';
  state.nightActions = freshNight();
  state.deadline = secondsFromNow(ctx, ctx.settings.nightSeconds);
}

function startDay(state, ctx) {
  state.phase = 'day';
  state.deadline = secondsFromNow(ctx, ctx.settings.discussionSeconds);
}

function startVoting(state, ctx) {
  state.phase = 'voting';
  state.votes = {};
  state.deadline = secondsFromNow(ctx, ctx.settings.voteSeconds);
}

function kill(state, id) {
  state.alive = state.alive.filter((p) => p !== id);
  state.revealed[id] = state.roles[id];
}

function winnerOf(state) {
  const mafia = state.alive.filter((id) => isMafia(state, id)).length;
  const town = state.alive.length - mafia;
  if (mafia === 0) return 'town';
  if (mafia >= town) return 'mafia';
  return null;
}

// Living actors who still owe a night move. Disconnected players are skipped.
function pendingActors(state, ctx) {
  const n = state.nightActions;
  return state.alive.filter((id) => {
    if (!isConnected(ctx, id)) return false;
    const role = state.roles[id];
    if (role === 'mafia') return !(id in n.mafiaVotes);
    if (role === 'doctor') return n.protect === null;
    if (role === 'detective') return n.investigated === null;
    return false;
  });
}

function mafiaTarget(state, ctx) {
  const tally = {};
  for (const [voter, target] of Object.entries(state.nightActions.mafiaVotes)) {
    if (isAlive(state, voter) && isMafia(state, voter) && isAlive(state, target) && !isMafia(state, target)) {
      tally[target] = (tally[target] || 0) + 1;
    }
  }
  const counts = Object.values(tally);
  if (counts.length === 0) return null;
  const top = Math.max(...counts);
  const tied = Object.keys(tally).filter((id) => tally[id] === top).sort();
  return tied[ctx.rng.int(tied.length)];
}

function resolveNight(state, ctx) {
  const target = mafiaTarget(state, ctx);
  const protectedId = state.nightActions.protect;
  state.lastProtected = protectedId;
  if (target && target === protectedId) state.saves += 1;
  const victim = target && target !== protectedId ? target : null;
  if (victim) {
    kill(state, victim);
    state.announcement = {
      kind: 'night',
      night: state.night,
      victimId: victim,
      role: state.roles[victim],
      text: `${nameOf(ctx, victim)} was found dead this morning. They were a ${ROLE_LABEL[state.roles[victim]]}.`,
    };
  } else {
    state.announcement = { kind: 'night', night: state.night, victimId: null, role: null, text: 'The night was quiet. Nobody died.' };
  }
  state.nightActions = freshNight();
  if (!checkWin(state, ctx)) startDay(state, ctx);
}

function resolveVote(state, ctx) {
  const tally = {};
  let skips = 0;
  for (const [voter, target] of Object.entries(state.votes)) {
    if (!isAlive(state, voter)) continue;
    if (target === null) skips += 1;
    else if (isAlive(state, target)) tally[target] = (tally[target] || 0) + 1;
  }
  const sorted = Object.entries(tally).sort((a, b) => b[1] - a[1]);
  const [leader, top] = sorted[0] ?? [null, 0];
  const strict = leader && top > skips && (sorted.length === 1 || top > sorted[1][1]);
  const eliminatedId = strict ? leader : null;
  if (eliminatedId) kill(state, eliminatedId);
  state.lastVote = {
    night: state.night,
    eliminatedId,
    role: eliminatedId ? state.roles[eliminatedId] : null,
    tally,
    skips,
    votes: { ...state.votes },
  };
  state.announcement = {
    kind: 'vote',
    night: state.night,
    victimId: eliminatedId,
    role: state.lastVote.role,
    text: eliminatedId
      ? `The town voted out ${nameOf(ctx, eliminatedId)}. They were a ${ROLE_LABEL[state.roles[eliminatedId]]}.`
      : 'The town could not agree. Nobody was voted out.',
  };
  state.votes = {};
  if (!checkWin(state, ctx)) startNight(state, ctx);
}

function checkWin(state, ctx) {
  const winner = winnerOf(state);
  if (winner) finish(state, ctx, winner);
  return Boolean(winner);
}

function scoresFor(state, winner) {
  const scores = {};
  for (const id of state.order) {
    scores[id] = (winner && teamOf(state, id) === winner ? 1 : 0) + (isAlive(state, id) ? 1 : 0);
  }
  return scores;
}

function summarize(state, ctx) {
  const winner = state.winner ?? winnerOf(state);
  const scores = scoresFor(state, winner);
  const notes = Object.fromEntries(
    state.order.map((id) => [id, `${ROLE_LABEL[state.roles[id]]}, ${state.left?.includes(id) ? 'left' : isAlive(state, id) ? 'survived' : 'eliminated'}`]),
  );
  const mafiaNames = state.order.filter((id) => isMafia(state, id)).map((id) => nameOf(ctx, id));
  const highlights = [`The Mafia: ${mafiaNames.join(', ')}`];
  const doctor = holderOf(state, 'doctor');
  const detective = holderOf(state, 'detective');
  if (doctor) highlights.push(state.saves ? `Doctor ${nameOf(ctx, doctor)} saved a life ${state.saves} time${state.saves === 1 ? '' : 's'}.` : `Doctor ${nameOf(ctx, doctor)} never got to save anyone.`);
  if (detective) {
    // Investigating the same suspect twice still only finds one mafia member.
    const caught = new Set(state.investigations.filter((i) => i.result === 'mafia').map((i) => i.targetId)).size;
    highlights.push(`Detective ${nameOf(ctx, detective)} made ${state.investigations.length} investigation${state.investigations.length === 1 ? '' : 's'} and found ${caught} mafia.`);
  }
  return {
    headline: winner === 'mafia' ? 'The Mafia take over the town!' : winner === 'town' ? 'The town rooted out the Mafia!' : 'The town never found out who did it.',
    ranking: ranking(scores, notes),
    highlights,
    reveal: { winner, roles: state.order.map((id) => ({ playerId: id, role: state.roles[id], alive: isAlive(state, id) })) },
  };
}

function finish(state, ctx, winner) {
  state.winner = winner;
  state.phase = 'finished';
  state.deadline = null;
  state.finished = true;
  state.results = summarize(state, ctx);
}

function requireAlive(state, playerId) {
  if (!isAlive(state, playerId)) fail('NOT_ALIVE', 'You are out of the game, but you can keep watching.');
}

function requireRole(state, playerId, role) {
  if (state.roles[playerId] !== role) fail('NOT_YOUR_ROLE', 'You do not have that move.');
}

function targetFrom(state, payload) {
  const id = payload?.targetId;
  if (typeof id !== 'string' || !isAlive(state, id)) fail('INVALID_TARGET', 'Pick someone who is still in the game.');
  return id;
}

// Repeating the same night move is a no-op; a different one is rejected.
function alreadyActed(previous, targetId) {
  if (previous === null) return false;
  if (previous === targetId) return true;
  return fail('ALREADY_ACTED', 'You already made your move tonight.');
}

function maybeEndNight(state, ctx) {
  if (state.phase === 'night' && pendingActors(state, ctx).length === 0) resolveNight(state, ctx);
}

const pendingVoters = (state, ctx) => state.alive.filter((id) => isConnected(ctx, id) && !(id in state.votes));

function maybeEndVoting(state, ctx) {
  if (state.phase === 'voting' && pendingVoters(state, ctx).length === 0) resolveVote(state, ctx);
}

function maybeEndRoles(state, ctx) {
  if (state.phase !== 'roles') return;
  const waiting = state.order.filter((id) => !state.left?.includes(id) && isConnected(ctx, id) && !state.ready.includes(id));
  if (waiting.length === 0) startNight(state, ctx);
}

// What this player may do tonight, and on whom.
function nightMove(state, playerId) {
  if (state.phase !== 'night' || !isAlive(state, playerId)) return null;
  const n = state.nightActions;
  const role = state.roles[playerId];
  if (role === 'mafia') {
    return { type: 'nightTarget', targetId: n.mafiaVotes[playerId] ?? null, done: playerId in n.mafiaVotes, targetIds: state.alive.filter((id) => !isMafia(state, id)) };
  }
  if (role === 'doctor') {
    return { type: 'protect', targetId: n.protect, done: n.protect !== null, targetIds: state.alive.filter((id) => id !== state.lastProtected) };
  }
  if (role === 'detective') {
    return { type: 'investigate', targetId: n.investigated, done: n.investigated !== null, targetIds: state.alive.filter((id) => id !== playerId) };
  }
  return null;
}

export default {
  meta: {
    id: 'mafia',
    order: 8,
    name: 'Mafia',
    tagline: 'Trust no one. Especially the quiet ones.',
    minPlayers: 6,
    maxPlayers: 12,
    duration: '15–30 min',
    vibe: 'Deduction',
    howToPlay: [
      'Everyone secretly gets a role: Mafia, Doctor, Detective or Villager.',
      'At night the Mafia pick a victim, the Doctor protects someone and the Detective checks one player.',
      'By day, talk it out on the call, then vote to throw someone out or skip.',
      'Town wins by eliminating every Mafia. Mafia win once they match the town in number.',
      'The app narrates, so the host plays too. Dead players watch quietly and keep secrets.',
    ],
  },
  settings: [
    { key: 'nightSeconds', label: 'Seconds for the night', type: 'number', min: 20, max: 90, step: 5, default: 40 },
    { key: 'discussionSeconds', label: 'Seconds to discuss', type: 'number', min: 30, max: 300, step: 15, default: 120 },
    { key: 'voteSeconds', label: 'Seconds to vote', type: 'number', min: 15, max: 90, step: 5, default: 40 },
  ],

  create(ctx) {
    const order = ctx.players.map((p) => p.id);
    const mafiaCount = mafiaCountFor(order.length);
    const roles = {};
    shuffle(order, ctx.rng).forEach((id, i) => {
      roles[id] = i < mafiaCount ? 'mafia' : i === mafiaCount ? 'doctor' : i === mafiaCount + 1 ? 'detective' : 'villager';
    });
    return {
      order,
      roles,
      mafiaCount,
      alive: [...order],
      revealed: {},
      night: 0,
      phase: 'roles',
      ready: [],
      nightActions: freshNight(),
      lastProtected: null,
      investigations: [],
      saves: 0,
      votes: {},
      lastVote: null,
      announcement: null,
      deadline: secondsFromNow(ctx, ROLES_SECONDS),
    };
  },

  actions: {
    ready(state, ctx) {
      requirePhase(state, 'roles');
      requireParticipant(state, ctx.playerId);
      if (state.ready.includes(ctx.playerId)) return;
      state.ready.push(ctx.playerId);
      maybeEndRoles(state, ctx);
    },
    nightTarget(state, ctx) {
      requirePhase(state, 'night');
      requireParticipant(state, ctx.playerId);
      requireAlive(state, ctx.playerId);
      requireRole(state, ctx.playerId, 'mafia');
      const target = targetFrom(state, ctx.payload);
      if (isMafia(state, target)) fail('INVALID_TARGET', 'You cannot target your own team.');
      state.nightActions.mafiaVotes[ctx.playerId] = target; // mafia may change their pick
      maybeEndNight(state, ctx);
    },
    protect(state, ctx) {
      requirePhase(state, 'night');
      requireParticipant(state, ctx.playerId);
      requireAlive(state, ctx.playerId);
      requireRole(state, ctx.playerId, 'doctor');
      const target = targetFrom(state, ctx.payload);
      if (alreadyActed(state.nightActions.protect, target)) return;
      if (target === state.lastProtected) fail('INVALID_TARGET', 'You protected them last night. Pick someone else.');
      state.nightActions.protect = target;
      maybeEndNight(state, ctx);
    },
    investigate(state, ctx) {
      requirePhase(state, 'night');
      requireParticipant(state, ctx.playerId);
      requireAlive(state, ctx.playerId);
      requireRole(state, ctx.playerId, 'detective');
      const target = targetFrom(state, ctx.payload);
      if (target === ctx.playerId) fail('INVALID_TARGET', 'You already know about yourself.');
      if (alreadyActed(state.nightActions.investigated, target)) return;
      state.nightActions.investigated = target;
      state.investigations.push({ night: state.night, targetId: target, result: isMafia(state, target) ? 'mafia' : 'not mafia' });
      maybeEndNight(state, ctx);
    },
    skipDiscussion(state, ctx) {
      requirePhase(state, 'day');
      if (ctx.playerId !== ctx.hostId) fail('HOST_ONLY', 'Only the host can skip the discussion.');
      startVoting(state, ctx);
    },
    vote(state, ctx) {
      requirePhase(state, 'voting');
      requireParticipant(state, ctx.playerId);
      requireAlive(state, ctx.playerId);
      const raw = ctx.payload?.targetId;
      let target = null;
      if (raw !== null) {
        target = targetFrom(state, ctx.payload);
        if (target === ctx.playerId) fail('INVALID_TARGET', 'You cannot vote for yourself.');
      }
      state.votes[ctx.playerId] = target;
      maybeEndVoting(state, ctx);
    },
  },

  onTimeout(state, ctx) {
    if (state.phase === 'roles') startNight(state, ctx);
    else if (state.phase === 'night') resolveNight(state, ctx);
    else if (state.phase === 'day') startVoting(state, ctx);
    else if (state.phase === 'voting') resolveVote(state, ctx);
  },

  onPlayerLeft(state, ctx) {
    const id = ctx.playerId;
    markLeft(state, id);
    state.alive = state.alive.filter((p) => p !== id); // removed quietly, role stays secret
    state.ready = state.ready.filter((p) => p !== id);
    const n = state.nightActions;
    delete n.mafiaVotes[id];
    for (const [voter, target] of Object.entries(n.mafiaVotes)) if (target === id) delete n.mafiaVotes[voter];
    if (state.roles[id] === 'doctor') n.protect = null;
    delete state.votes[id];
    for (const [voter, target] of Object.entries(state.votes)) if (target === id) delete state.votes[voter];
    if (state.phase === 'finished' || checkWin(state, ctx)) return;
    maybeEndRoles(state, ctx);
    maybeEndNight(state, ctx);
    maybeEndVoting(state, ctx);
  },

  summarize,

  /*
   * view fields:
   *   myRole, amAlive          your own role and status
   *   teammates                mafia only: [{ id, alive }] of your fellow mafia (else null)
   *   teamPicks                mafia only, at night: { mafiaId: targetId } so the team can agree
   *   myMove                   at night, if you have one: { type: 'nightTarget'|'protect'|'investigate', targetId, done, targetIds }
   *   lastProtectedId          doctor only: who you protected last night (not allowed again)
   *   investigations           detective only: [{ night, targetId, result: 'mafia'|'not mafia' }]
   *   players                  [{ id, alive, left, revealedRole }] revealedRole only for those killed or voted out
   *   night, mafiaCount        night number and how many mafia started
   *   readyIds                 roles phase: who tapped ready
   *   announcement             { kind: 'night'|'vote', night, victimId, role, text } latest public news
   *   lastVote                 { night, eliminatedId, role, tally, skips, votes } latest vote result
   *   hasVoted, myVote         voting phase: myVote is a targetId, or null for skip / not voted yet
   *   votedIds, waitingOn      voting phase: who has and hasn't voted (not what they voted)
   *   canSkipDiscussion        true for the host during the day
   */
  view(state, playerId, ctx) {
    const role = state.roles[playerId] ?? null;
    const mafia = role === 'mafia';
    return {
      myRole: role,
      amAlive: isAlive(state, playerId),
      teammates: mafia ? state.order.filter((id) => id !== playerId && isMafia(state, id)).map((id) => ({ id, alive: isAlive(state, id) })) : null,
      teamPicks: mafia && state.phase === 'night' ? { ...state.nightActions.mafiaVotes } : null,
      myMove: nightMove(state, playerId),
      lastProtectedId: role === 'doctor' ? state.lastProtected : null,
      investigations: role === 'detective' ? state.investigations.map((i) => ({ ...i })) : null,
      players: state.order.map((id) => ({ id, alive: isAlive(state, id), left: Boolean(state.left?.includes(id)), revealedRole: state.revealed[id] ?? null })),
      night: state.night,
      mafiaCount: state.mafiaCount,
      readyIds: state.phase === 'roles' ? [...state.ready] : [],
      announcement: state.announcement,
      lastVote: state.lastVote,
      hasVoted: state.phase === 'voting' && playerId in state.votes,
      myVote: state.phase === 'voting' ? state.votes[playerId] ?? null : null,
      votedIds: state.phase === 'voting' ? Object.keys(state.votes) : [],
      waitingOn: state.phase === 'voting' ? state.alive.filter((id) => !(id in state.votes)) : [],
      canSkipDiscussion: state.phase === 'day' && playerId === ctx.hostId,
    };
  },
};
