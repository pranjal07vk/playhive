import { fail, requirePhase } from '../baseGame.js';
import { addScore, drawFrom, headlineFor, initScores, markLeft, activeOrder, ranking, requireChoice, requireParticipant, secondsFromNow } from '../shared/helpers.js';
import { CATEGORY_OPTIONS, questionBank } from './content.js';

/*
 * Would You Rather
 * Phases: voting -> reveal -> (next voting | finished)
 * Everyone votes once per question. Voting closes when every remaining
 * player has voted or the timer runs out. Players in the majority score a point
 * ("hive mind"), so there is something to win.
 */
const REVEAL_SECONDS = 7;

function startQuestion(state, ctx) {
  state.round += 1;
  state.question = drawFrom(state, 'q', questionBank(ctx.settings.category), ctx.rng);
  state.votes = {};
  state.phase = 'voting';
  state.deadline = secondsFromNow(ctx, ctx.settings.voteSeconds);
}

function reveal(state, ctx) {
  const tally = [0, 0];
  for (const choice of Object.values(state.votes)) tally[choice] += 1;
  const majority = tally[0] === tally[1] ? null : tally[0] > tally[1] ? 0 : 1;
  if (majority !== null) {
    for (const [id, choice] of Object.entries(state.votes)) if (choice === majority) addScore(state, id, 1);
  }
  state.history.push({ question: state.question, tally, majority });
  state.lastTally = tally;
  state.phase = 'reveal';
  state.deadline = secondsFromNow(ctx, REVEAL_SECONDS);
}

function advance(state, ctx) {
  if (state.round >= ctx.settings.rounds) return finish(state, ctx);
  return startQuestion(state, ctx);
}

function summarize(state, ctx) {
  // Only questions where both sides got votes count as divisive.
  const split = state.history
    .filter((h) => h.tally[0] > 0 && h.tally[1] > 0)
    .reduce((best, h) => {
      const gap = Math.abs(h.tally[0] - h.tally[1]);
      return !best || gap < best.gap ? { gap, h } : best;
    }, null);
  return {
    headline: headlineFor(ctx, state.scores, 'is the ultimate hive mind'),
    ranking: ranking(state.scores),
    highlights: split ? [`Most divisive: "${split.h.question[0]}" vs "${split.h.question[1]}" (${split.h.tally[0]}–${split.h.tally[1]})`] : [],
  };
}

function finish(state, ctx) {
  state.phase = 'finished';
  state.deadline = null;
  state.finished = true;
  state.results = summarize(state, ctx);
}

const everyoneVoted = (state) => activeOrder(state).every((id) => id in state.votes);

export default {
  meta: {
    id: 'would-you-rather',
    order: 2,
    name: 'Would You Rather',
    tagline: 'Two choices. Zero easy answers.',
    minPlayers: 2,
    maxPlayers: 20,
    duration: '5–10 min',
    vibe: 'Debate',
    howToPlay: [
      'Everyone sees the same two options and picks one in secret.',
      'Votes are revealed together once everyone has chosen or time runs out.',
      'Side with the majority to score a point. Most points wins.',
    ],
  },
  settings: [
    { key: 'rounds', label: 'Questions', type: 'number', min: 3, max: 20, default: 8 },
    { key: 'voteSeconds', label: 'Seconds to vote', type: 'number', min: 10, max: 60, step: 5, default: 20 },
    { key: 'category', label: 'Category', type: 'select', options: CATEGORY_OPTIONS, default: 'mix' },
    { key: 'anonymous', label: 'Hide who voted for what', type: 'boolean', default: false },
  ],

  create(ctx) {
    const state = { order: ctx.players.map((p) => p.id), scores: initScores(ctx.players.map((p) => p.id)), round: 0, history: [] };
    startQuestion(state, ctx);
    return state;
  },

  actions: {
    vote(state, ctx) {
      requirePhase(state, 'voting');
      requireParticipant(state, ctx.playerId);
      if (ctx.playerId in state.votes) return; // a repeated click changes nothing
      requireChoice(ctx.payload.choice, [0, 1]);
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
    if (state.phase === 'voting') reveal(state, ctx);
    else if (state.phase === 'reveal') advance(state, ctx);
  },

  onPlayerLeft(state, ctx) {
    markLeft(state, ctx.playerId);
    delete state.votes[ctx.playerId];
    if (state.phase === 'voting' && everyoneVoted(state)) reveal(state, ctx);
  },

  summarize,

  view(state, playerId, ctx) {
    const revealed = state.phase === 'reveal';
    return {
      round: state.round,
      totalRounds: ctx.settings.rounds,
      question: state.question,
      myVote: state.votes[playerId] ?? null,
      votedIds: Object.keys(state.votes),
      waitingOn: activeOrder(state).filter((id) => !(id in state.votes)),
      tally: revealed ? state.lastTally : null,
      // Individual votes only after the reveal, and never in anonymous mode.
      votes: revealed && !ctx.settings.anonymous ? state.votes : null,
      scores: state.scores,
    };
  },
};
