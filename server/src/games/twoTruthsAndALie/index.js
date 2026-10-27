import { fail, requirePhase } from '../baseGame.js';
import { activeOrder, addScore, headlineFor, initScores, markLeft, nameOf, ranking, requireChoice, requireParticipant, requireTurn, secondsFromNow } from '../shared/helpers.js';
import { shuffle } from '../../utils/random.js';
import { cleanText } from '../../utils/text.js';

/*
 * Two Truths and a Lie
 * Phases: writing -> voting -> reveal -> (next writing | finished)
 * Players take turns as the storyteller (once each, or twice with
 * roundsPerPlayer = 2). In 'writing' the storyteller privately submits three
 * statements and which one is the lie. If the timer runs out, their turn is
 * skipped. In 'voting' everyone else locks in one vote for the lie. Voting
 * closes when all have voted or time is up. Scoring: +2 for every voter who
 * found the lie, +1 to the storyteller for every voter they fooled.
 * The lie index stays server-side until the reveal.
 */
const REVEAL_SECONDS = 10;
const MIN_LENGTH = 3;
const MAX_LENGTH = 120;

// Left players never get a turn; disconnected ones are skipped too.
const available = (state, ctx, id) => !state.left?.includes(id) && (!ctx.connected || ctx.connected.has(id));

const voters = (state) => activeOrder(state).filter((id) => id !== state.storytellerId);
const everyoneVoted = (state) => voters(state).every((id) => id in state.votes);

function startTurn(state, ctx) {
  while (state.turnIndex < state.turns.length && !available(state, ctx, state.turns[state.turnIndex])) {
    state.skipped.push(state.turns[state.turnIndex]);
    state.turnIndex += 1;
  }
  if (state.turnIndex >= state.turns.length) return finish(state, ctx);
  state.storytellerId = state.turns[state.turnIndex];
  state.statements = null;
  state.lieIndex = null;
  state.votes = {};
  state.roundPoints = null;
  state.phase = 'writing';
  state.deadline = secondsFromNow(ctx, ctx.settings.writeSeconds);
}

function advance(state, ctx) {
  state.turnIndex += 1;
  startTurn(state, ctx);
}

function skipTurn(state, ctx) {
  state.skipped.push(state.storytellerId);
  advance(state, ctx);
}

function reveal(state, ctx) {
  const points = {};
  let fooled = 0;
  for (const [id, choice] of Object.entries(state.votes)) {
    if (choice === state.lieIndex) {
      addScore(state, id, 2);
      points[id] = 2;
    } else fooled += 1;
  }
  addScore(state, state.storytellerId, fooled);
  points[state.storytellerId] = fooled;
  state.roundPoints = points;
  state.history.push({ storytellerId: state.storytellerId, statements: state.statements, lieIndex: state.lieIndex, fooled, voters: Object.keys(state.votes).length });
  state.phase = 'reveal';
  state.deadline = secondsFromNow(ctx, REVEAL_SECONDS);
}

function summarize(state, ctx) {
  const best = state.history.reduce((top, h) => (h.fooled > 0 && (!top || h.fooled > top.fooled) ? h : top), null);
  const highlights = [];
  if (best) highlights.push(`Best poker face: ${nameOf(ctx, best.storytellerId)} fooled ${best.fooled} with "${best.statements[best.lieIndex]}"`);
  const transparent = state.history.filter((h) => h.voters > 0 && h.fooled === 0);
  if (transparent.length) highlights.push(`Open book: nobody fell for ${transparent.map((h) => nameOf(ctx, h.storytellerId)).join(', ')}'s lie`);
  return { headline: headlineFor(ctx, state.scores, 'is the best lie detector'), ranking: ranking(state.scores), highlights };
}

function finish(state, ctx) {
  state.phase = 'finished';
  state.deadline = null;
  state.finished = true;
  state.results = { ...summarize(state, ctx), reveal: state.history.map(({ storytellerId, statements, lieIndex }) => ({ storytellerId, statements, lieIndex })) };
}

export default {
  meta: {
    id: 'two-truths-and-a-lie',
    order: 4,
    name: 'Two Truths and a Lie',
    tagline: 'Three facts. One is fake. Trust nobody.',
    minPlayers: 3,
    maxPlayers: 12,
    duration: '10–20 min',
    vibe: 'Bluffing',
    howToPlay: [
      'On your turn, write three statements about yourself and secretly mark which one is the lie.',
      'Everyone else gets one locked-in vote for the lie.',
      'Spot the lie for 2 points. Storytellers get 1 point for every friend they fool.',
      'Keep it fun: share only what you are happy for the group to know.',
    ],
  },
  settings: [
    { key: 'roundsPerPlayer', label: 'Turns each', type: 'number', min: 1, max: 2, default: 1 },
    { key: 'writeSeconds', label: 'Seconds to write', type: 'number', min: 30, max: 180, step: 15, default: 90 },
    { key: 'voteSeconds', label: 'Seconds to vote', type: 'number', min: 10, max: 90, step: 5, default: 30 },
  ],

  create(ctx) {
    const ids = ctx.players.map((p) => p.id);
    const order = shuffle(ids, ctx.rng);
    const turns = Array.from({ length: ctx.settings.roundsPerPlayer }, () => order).flat();
    const state = { order, turns, turnIndex: 0, scores: initScores(ids), history: [], skipped: [] };
    startTurn(state, ctx);
    return state;
  },

  actions: {
    // payload: { statements: [string, string, string], lieIndex: 0 | 1 | 2 }
    submit(state, ctx) {
      requirePhase(state, 'writing');
      requireTurn(ctx.playerId, state.storytellerId, 'Only the storyteller writes this round.');
      const raw = ctx.payload.statements;
      if (!Array.isArray(raw) || raw.length !== 3) fail('INVALID_STATEMENTS', 'Write exactly three statements.');
      const statements = raw.map((s) => cleanText(s, MAX_LENGTH));
      if (statements.some((s) => s.length < MIN_LENGTH)) fail('INVALID_STATEMENTS', `Each statement needs at least ${MIN_LENGTH} characters.`);
      if (new Set(statements.map((s) => s.toLowerCase())).size !== 3) fail('INVALID_STATEMENTS', 'Your three statements must be different.');
      requireChoice(ctx.payload.lieIndex, [0, 1, 2], 'Pick which statement is the lie.');
      state.statements = statements;
      state.lieIndex = ctx.payload.lieIndex;
      state.phase = 'voting';
      state.deadline = secondsFromNow(ctx, ctx.settings.voteSeconds);
    },
    // payload: { choice: 0 | 1 | 2 }. One locked vote per player.
    vote(state, ctx) {
      requirePhase(state, 'voting');
      requireParticipant(state, ctx.playerId);
      if (ctx.playerId === state.storytellerId) fail('NOT_YOUR_TURN', 'You know the answer! Let the others vote.');
      if (ctx.playerId in state.votes) return; // vote is locked; repeats change nothing
      requireChoice(ctx.payload.choice, [0, 1, 2]);
      state.votes[ctx.playerId] = ctx.payload.choice;
      if (everyoneVoted(state)) reveal(state, ctx);
    },
    next(state, ctx) {
      requirePhase(state, 'reveal');
      if (ctx.playerId !== ctx.hostId) fail('HOST_ONLY', 'The host moves the game along.');
      advance(state, ctx);
    },
  },

  onTimeout(state, ctx) {
    if (state.phase === 'writing') skipTurn(state, ctx);
    else if (state.phase === 'voting') reveal(state, ctx);
    else if (state.phase === 'reveal') advance(state, ctx);
  },

  onPlayerLeft(state, ctx) {
    markLeft(state, ctx.playerId);
    if (state.phase === 'writing' && ctx.playerId === state.storytellerId) return skipTurn(state, ctx);
    if (state.phase === 'voting') {
      delete state.votes[ctx.playerId];
      // The lie is already locked in, so the round can still be revealed.
      if (everyoneVoted(state)) reveal(state, ctx);
    }
  },

  summarize,

  /*
   * View fields:
   *   turn, totalTurns       1-based turn number and total turns planned
   *   storytellerId          whose statements these are
   *   isStoryteller          true for the storyteller
   *   statements             the three statements (null while writing)
   *   myLie                  storyteller only: their own lie index
   *   lieIndex               the lie, only in 'reveal'
   *   myVote                 this player's locked vote or null
   *   votedIds, waitingOn    who has voted / who is still voting
   *   votes                  { playerId: choice }, only in 'reveal'
   *   roundPoints            { playerId: points } for this turn, only in 'reveal'
   *   skipped                storytellers whose turn was skipped
   *   scores
   */
  view(state, playerId) {
    const revealed = state.phase === 'reveal';
    const isStoryteller = playerId === state.storytellerId;
    return {
      turn: Math.min(state.turnIndex + 1, state.turns.length),
      totalTurns: state.turns.length,
      storytellerId: state.storytellerId,
      isStoryteller,
      statements: state.statements,
      myLie: isStoryteller ? state.lieIndex : null,
      lieIndex: revealed ? state.lieIndex : null,
      myVote: state.votes?.[playerId] ?? null,
      votedIds: Object.keys(state.votes || {}),
      waitingOn: state.phase === 'voting' ? voters(state).filter((id) => !(id in state.votes)) : [],
      votes: revealed ? state.votes : null,
      roundPoints: revealed ? state.roundPoints : null,
      skipped: state.skipped,
      scores: state.scores,
    };
  },
};
