import { fail, requirePhase } from '../baseGame.js';
import { activeOrder, addScore, headlineFor, initScores, markLeft, nameOf, ranking, requireParticipant, requireTurn, secondsFromNow } from '../shared/helpers.js';

/*
 * Sardines (a companion for real-world hide-and-seek)
 * Phases: hiding -> seeking -> roundSummary -> (next hiding | finished)
 * One player hides (random first, then rotating so each round has a new
 * hider). In 'hiding' the hider has hideSeconds, or taps 'hidden' to start
 * the search early. In 'seeking' everyone else looks; when you find the
 * hider you tap 'found' (honour system) and squeeze in with the pack.
 * The round ends when everyone is found, time runs out, or the host taps
 * 'endRound'. Scoring with n seekers: the first finder gets n-1, the next
 * n-2, and so on, so the last one found gets 0. If the round ends with
 * seekers still searching, the hider gets +1 for each of them.
 * The app does not track location; it only keeps time and order.
 */
const SUMMARY_SECONDS = 15;

const available = (state, ctx, id) => !state.left?.includes(id) && (!ctx.connected || ctx.connected.has(id));

// Next hider after `fromIndex` in turn order, skipping anyone gone.
function nextHiderIndex(state, ctx, fromIndex) {
  for (let step = 1; step <= state.order.length; step += 1) {
    const i = (fromIndex + step) % state.order.length;
    if (available(state, ctx, state.order[i])) return i;
  }
  return -1;
}

function startRound(state, ctx, hiderIndex) {
  if (hiderIndex < 0) return finish(state, ctx);
  state.round += 1;
  state.hiderIndex = hiderIndex;
  state.hiderId = state.order[hiderIndex];
  state.seekers = activeOrder(state).filter((id) => id !== state.hiderId);
  state.found = [];
  state.seekStartedAt = null;
  state.roundPoints = null;
  state.voided = false;
  state.phase = 'hiding';
  state.deadline = secondsFromNow(ctx, ctx.settings.hideSeconds);
}

function startSeeking(state, ctx) {
  state.phase = 'seeking';
  state.seekStartedAt = ctx.now;
  state.deadline = secondsFromNow(ctx, ctx.settings.seekSeconds);
}

const stillSeeking = (state) => state.seekers.filter((id) => !state.left?.includes(id) && !state.found.some((f) => f.playerId === id));

function endRound(state, ctx, { voided = false } = {}) {
  const points = {};
  if (!voided) {
    const seekers = state.seekers.filter((id) => !state.left?.includes(id));
    const finders = state.found.filter((f) => seekers.includes(f.playerId));
    finders.forEach((f, place) => {
      points[f.playerId] = seekers.length - 1 - place;
    });
    points[state.hiderId] = stillSeeking(state).length;
    for (const [id, p] of Object.entries(points)) addScore(state, id, p);
  }
  state.roundPoints = points;
  state.voided = voided;
  state.history.push({ hiderId: state.hiderId, found: state.found.length, seekers: state.seekers.length, voided });
  state.phase = 'roundSummary';
  state.deadline = secondsFromNow(ctx, SUMMARY_SECONDS);
}

function advance(state, ctx) {
  if (state.round >= ctx.settings.rounds) return finish(state, ctx);
  startRound(state, ctx, nextHiderIndex(state, ctx, state.hiderIndex));
}

function summarize(state, ctx) {
  const highlights = [];
  const sneaky = state.history.filter((h) => !h.voided && h.found < h.seekers);
  if (sneaky.length) highlights.push(`Master of hiding: ${sneaky.map((h) => nameOf(ctx, h.hiderId)).join(', ')} stayed hidden from someone`);
  const fastest = state.fastest;
  if (fastest) highlights.push(`Bloodhound: ${nameOf(ctx, fastest.playerId)} found the hider in ${Math.round(fastest.ms / 1000)}s`);
  return { headline: headlineFor(ctx, state.scores, 'is the top sardine'), ranking: ranking(state.scores), highlights };
}

function finish(state, ctx) {
  state.phase = 'finished';
  state.deadline = null;
  state.finished = true;
  state.results = summarize(state, ctx);
}

export default {
  meta: {
    id: 'sardines',
    order: 15,
    name: 'Sardines',
    tagline: 'Hide-and-seek, but everyone ends up squished together.',
    minPlayers: 4,
    maxPlayers: 12,
    duration: '15–30 min',
    vibe: 'Outdoor',
    howToPlay: [
      'One player hides while everyone else waits. Each round has a new hider.',
      'When the search starts, look for the hider. Found them? Tap Found and quietly squeeze in with them.',
      'The sooner you find the hider, the more you score. The last one to find the pack scores nothing.',
      'The hider scores for every seeker still searching when time is up.',
      'The app does not track anyone\'s location, so tap Found honestly. Agree on safe play areas first.',
    ],
  },
  settings: [
    { key: 'rounds', label: 'Rounds', type: 'number', min: 1, max: 12, default: 4 },
    { key: 'hideSeconds', label: 'Seconds to hide', type: 'number', min: 30, max: 300, step: 15, default: 60 },
    { key: 'seekSeconds', label: 'Seconds to seek', type: 'number', min: 60, max: 900, step: 30, default: 300 },
  ],

  create(ctx) {
    const order = ctx.players.map((p) => p.id);
    const state = { order, scores: initScores(order), round: 0, history: [], fastest: null };
    const first = ctx.rng.int(order.length);
    // nextHiderIndex starts after the index it is given, so step back one.
    startRound(state, ctx, nextHiderIndex(state, ctx, first - 1 + order.length));
    return state;
  },

  actions: {
    hidden(state, ctx) {
      requirePhase(state, 'hiding');
      requireTurn(ctx.playerId, state.hiderId, 'Only the hider can start the search.');
      startSeeking(state, ctx);
    },
    found(state, ctx) {
      requirePhase(state, 'seeking');
      requireParticipant(state, ctx.playerId);
      if (ctx.playerId === state.hiderId) fail('NOT_A_SEEKER', 'You are the one hiding!');
      if (!state.seekers.includes(ctx.playerId)) fail('NOT_A_SEEKER', 'You are not seeking this round.');
      if (state.found.some((f) => f.playerId === ctx.playerId)) return; // already in the pack
      state.found.push({ playerId: ctx.playerId, at: ctx.now });
      const ms = ctx.now - state.seekStartedAt;
      if (state.found.length === 1 && (!state.fastest || ms < state.fastest.ms)) state.fastest = { playerId: ctx.playerId, ms };
      if (stillSeeking(state).length === 0) endRound(state, ctx);
    },
    // Host ends the search early. Scored like the timer running out.
    endRound(state, ctx) {
      requirePhase(state, 'seeking');
      if (ctx.playerId !== ctx.hostId) fail('HOST_ONLY', 'Only the host can end the round.');
      endRound(state, ctx);
    },
    next(state, ctx) {
      requirePhase(state, 'roundSummary');
      if (ctx.playerId !== ctx.hostId) fail('HOST_ONLY', 'The host moves the game along.');
      advance(state, ctx);
    },
  },

  onTimeout(state, ctx) {
    if (state.phase === 'hiding') startSeeking(state, ctx);
    else if (state.phase === 'seeking') endRound(state, ctx);
    else if (state.phase === 'roundSummary') advance(state, ctx);
  },

  onPlayerLeft(state, ctx) {
    markLeft(state, ctx.playerId);
    if (ctx.playerId === state.hiderId && (state.phase === 'hiding' || state.phase === 'seeking')) {
      return endRound(state, ctx, { voided: true }); // no hider, no round
    }
    if (state.phase === 'seeking' && stillSeeking(state).length === 0) endRound(state, ctx);
  },

  summarize,

  /*
   * View fields:
   *   round, totalRounds
   *   hiderId, isHider
   *   seekers          ids searching this round
   *   amFound          this player is already in the pack
   *   found            [{ playerId, at, place, afterSeconds }] in find order
   *   stillSeeking     seekers not yet found
   *   seekStartedAt    ms epoch the search began (null while hiding)
   *   roundPoints      { playerId: points }, only in 'roundSummary'
   *   voided           true if the hider left and the round did not count
   *   scores
   */
  view(state, playerId, ctx) {
    const seeking = state.phase !== 'hiding';
    return {
      round: state.round,
      totalRounds: ctx.settings.rounds,
      hiderId: state.hiderId,
      isHider: playerId === state.hiderId,
      seekers: state.seekers,
      amFound: state.found.some((f) => f.playerId === playerId),
      found: state.found.map((f, i) => ({ ...f, place: i + 1, afterSeconds: Math.round((f.at - state.seekStartedAt) / 1000) })),
      stillSeeking: stillSeeking(state),
      seekStartedAt: seeking ? state.seekStartedAt ?? null : null,
      roundPoints: state.phase === 'roundSummary' ? state.roundPoints : null,
      voided: state.voided,
      scores: state.scores,
    };
  },
};
