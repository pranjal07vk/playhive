import { fail, requirePhase } from '../baseGame.js';
import { addScore, headlineFor, initScores, markLeft, nameOf, ranking, requireParticipant, secondsFromNow } from '../shared/helpers.js';

/*
 * Freeze Dance
 * Phases: dancing -> frozen -> (dancing | finished)
 * The host is the DJ and referee and does not dance, unless fewer than three
 * others are playing, in which case everyone (host included) is a contestant.
 * In 'dancing' clients play music for a random time chosen by the server
 * (the length depends on the pace setting). In 'frozen' the music stops: the
 * DJ has up to 15s to 'eliminate' anyone they saw move, and players may own
 * up with 'iMoved'. The DJ taps 'resume' (or the timer runs out) and every
 * contestant still standing scores a point for surviving the round.
 * The game ends when one or nobody is left, or after maxRounds.
 * The app cannot see anyone; the DJ judges.
 */
const FROZEN_SECONDS = 15;
const PACES = {
  chill: [10, 15],
  normal: [6, 12],
  hyper: [5, 8],
};
const PACE_OPTIONS = [
  { value: 'chill', label: 'Chill (10–15s songs)' },
  { value: 'normal', label: 'Normal (6–12s)' },
  { value: 'hyper', label: 'Hyper (5–8s)' },
];
const MAX_IDS = 20;

function startDancing(state, ctx) {
  state.round += 1;
  const [min, max] = PACES[ctx.settings.pace] || PACES.normal;
  state.phase = 'dancing';
  state.deadline = secondsFromNow(ctx, min + ctx.rng.int(max - min + 1));
}

function freeze(state, ctx) {
  state.phase = 'frozen';
  state.deadline = secondsFromNow(ctx, FROZEN_SECONDS);
}

function knockOut(state, ctx, playerId, how) {
  if (!state.alive.includes(playerId)) return;
  state.alive = state.alive.filter((id) => id !== playerId);
  state.eliminated.push({ playerId, round: state.round, how });
}

// Survivors score, then either the music starts again or the game ends.
function endRound(state, ctx) {
  for (const id of state.alive) addScore(state, id, 1);
  if (state.alive.length <= 1 || state.round >= ctx.settings.maxRounds) return finish(state, ctx);
  startDancing(state, ctx);
}

const requireDJ = (ctx) => {
  if (ctx.playerId !== ctx.hostId) fail('HOST_ONLY', 'Only the DJ can do that.');
};

function summarize(state, ctx) {
  const highlights = [];
  if (state.alive.length) highlights.push(`Still standing: ${state.alive.map((id) => nameOf(ctx, id)).join(', ')}`);
  const first = state.eliminated.find((e) => e.how !== 'left');
  if (first) highlights.push(`First to wobble: ${nameOf(ctx, first.playerId)} in round ${first.round}`);
  const honest = state.eliminated.filter((e) => e.how === 'self');
  if (honest.length) highlights.push(`Honesty award: ${honest.map((e) => nameOf(ctx, e.playerId)).join(', ')} owned up`);
  return { headline: headlineFor(ctx, state.scores, 'has the stillest moves'), ranking: ranking(state.scores), highlights };
}

function finish(state, ctx) {
  state.phase = 'finished';
  state.deadline = null;
  state.finished = true;
  state.results = summarize(state, ctx);
}

export default {
  meta: {
    id: 'freeze-dance',
    order: 14,
    name: 'Freeze Dance',
    tagline: 'Dance like nobody\'s watching. Freeze because the DJ is.',
    minPlayers: 3,
    maxPlayers: 20,
    duration: '5–10 min',
    vibe: 'Active',
    howToPlay: [
      'The host is the DJ. Everyone else dances while the music plays.',
      'When the music stops, freeze! The DJ calls out anyone who moved.',
      'The app cannot see you, so the DJ judges by watching in person or on video. Be honest and tap "I moved" if you wobbled.',
      'Survive a round to score a point. The last dancer standing wins.',
    ],
  },
  settings: [
    { key: 'maxRounds', label: 'Rounds', type: 'number', min: 3, max: 15, default: 8 },
    { key: 'pace', label: 'Pace', type: 'select', options: PACE_OPTIONS, default: 'normal' },
  ],

  create(ctx) {
    const ids = ctx.players.map((p) => p.id);
    const others = ids.filter((id) => id !== ctx.hostId);
    const contestants = others.length >= 3 ? others : ids;
    const state = { order: ids, contestants, alive: [...contestants], eliminated: [], scores: initScores(contestants), round: 0 };
    startDancing(state, ctx);
    return state;
  },

  actions: {
    // payload: { playerIds: [id, ...] }. Repeats are harmless.
    eliminate(state, ctx) {
      requirePhase(state, 'frozen');
      requireDJ(ctx);
      const ids = ctx.payload.playerIds;
      if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_IDS || ids.some((id) => typeof id !== 'string')) {
        fail('INVALID_CHOICE', 'Pick who moved.');
      }
      if (ids.some((id) => !state.contestants.includes(id))) fail('INVALID_CHOICE', 'That player is not dancing.');
      for (const id of ids) knockOut(state, ctx, id, 'dj');
    },
    // The DJ can undo a call made this round (wrong tap).
    reinstate(state, ctx) {
      requirePhase(state, 'frozen');
      requireDJ(ctx);
      const { playerId } = ctx.payload;
      const entry = state.eliminated.find((e) => e.playerId === playerId && e.round === state.round && e.how !== 'left');
      if (!entry || state.left?.includes(playerId)) fail('INVALID_CHOICE', 'Only players called out this round can be brought back.');
      state.eliminated = state.eliminated.filter((e) => e !== entry);
      state.alive.push(playerId);
    },
    iMoved(state, ctx) {
      requirePhase(state, 'frozen');
      requireParticipant(state, ctx.playerId);
      if (!state.contestants.includes(ctx.playerId)) fail('NOT_A_CONTESTANT', 'You are the DJ, you are not dancing!');
      knockOut(state, ctx, ctx.playerId, 'self'); // already out: nothing happens
    },
    resume(state, ctx) {
      requirePhase(state, 'frozen');
      requireDJ(ctx);
      endRound(state, ctx);
    },
  },

  onTimeout(state, ctx) {
    if (state.phase === 'dancing') freeze(state, ctx);
    else if (state.phase === 'frozen') endRound(state, ctx);
  },

  onPlayerLeft(state, ctx) {
    markLeft(state, ctx.playerId);
    knockOut(state, ctx, ctx.playerId, 'left');
    if (state.contestants.includes(ctx.playerId) && state.alive.length <= 1) finish(state, ctx);
  },

  summarize,

  /*
   * View fields:
   *   phase          'dancing' | 'frozen' | 'finished'
   *   deadline       end of the frozen window; null while dancing so the stop
   *                  stays a surprise (clients stop the music when phase flips)
   *   round, maxRounds
   *   isDJ           true for the host (the referee)
   *   djId           the host's id
   *   isContestant   whether this player is dancing at all
   *   amAlive        whether this player is still in
   *   alive          contestant ids still standing
   *   eliminated     [{ playerId, round, how: 'dj'|'self'|'left' }] in the order they went out
   *   scores         rounds survived per contestant
   */
  view(state, playerId, ctx) {
    return {
      phase: state.phase,
      deadline: state.phase === 'frozen' ? state.deadline : null,
      round: state.round,
      maxRounds: ctx.settings.maxRounds,
      isDJ: playerId === ctx.hostId,
      djId: ctx.hostId,
      isContestant: state.contestants.includes(playerId),
      amAlive: state.alive.includes(playerId),
      alive: state.alive,
      eliminated: state.eliminated,
      scores: state.scores,
    };
  },
};
