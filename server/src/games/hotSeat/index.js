import { fail, requirePhase } from '../baseGame.js';
import { activeOrder, addScore, drawFrom, headlineFor, initScores, markLeft, nameOf, ranking, requireChoice, requireParticipant, secondsFromNow } from '../shared/helpers.js';
import { shuffle } from '../../utils/random.js';
import { CATEGORY_OPTIONS, questionBank } from './content.js';

/*
 * Hot Seat
 * Phases: answering -> reveal -> (next answering | finished)
 * The hot seat rotates through a shuffled order, roundsPerPlayer times.
 * Each round shows one question with four options. The hot-seat player
 * secretly picks their true answer; everyone else predicts it.
 * Answering closes when everyone remaining has submitted or time runs out.
 * Scoring: each correct predictor +1, the hot-seat player +1 per correct predictor.
 * If the hot-seat player never answers (or leaves), the round is void: no points.
 * Disconnected players are skipped when their seat comes up.
 */
const REVEAL_SECONDS = 8;
const CHOICES = [0, 1, 2, 3];

const isHere = (state, ctx, id) => !state.left.includes(id) && (!ctx.connected || ctx.connected.has(id));

function startRound(state, ctx, hotSeatId) {
  state.round += 1;
  state.hotSeatId = hotSeatId;
  state.question = drawFrom(state, 'q', questionBank(ctx.settings.category), ctx.rng);
  state.submissions = {};
  state.lastReveal = null;
  state.phase = 'answering';
  state.deadline = secondsFromNow(ctx, ctx.settings.seconds);
}

// The next seat in the queue, skipping players who left or are offline
// (unless nobody is online, so a network blip can't end the game).
function nextSeat(state, ctx) {
  const anyoneHere = activeOrder(state).some((id) => isHere(state, ctx, id));
  while (state.seat + 1 < state.queue.length) {
    state.seat += 1;
    const id = state.queue[state.seat];
    if (state.left.includes(id) || (anyoneHere && !isHere(state, ctx, id))) continue;
    return startRound(state, ctx, id);
  }
  return finish(state, ctx);
}

// reason: null (normal), 'no-answer' or 'left'
function reveal(state, ctx, reason = null) {
  const hot = state.hotSeatId;
  const answer = reason === 'left' ? undefined : state.submissions[hot];
  const predictions = Object.fromEntries(Object.entries(state.submissions).filter(([id]) => id !== hot));
  const isVoid = answer === undefined;
  const correctIds = isVoid ? [] : Object.keys(predictions).filter((id) => predictions[id] === answer);
  for (const id of correctIds) addScore(state, id, 1);
  addScore(state, hot, correctIds.length);
  state.lastReveal = {
    void: isVoid,
    reason: isVoid ? reason ?? 'no-answer' : null,
    answer: isVoid ? null : answer,
    predictions,
    correctIds,
    hotSeatPoints: correctIds.length,
  };
  state.history.push({ hotSeatId: hot, question: state.question, ...state.lastReveal });
  state.phase = 'reveal';
  state.deadline = secondsFromNow(ctx, REVEAL_SECONDS);
}

function summarize(state, ctx) {
  const read = {};
  const guessed = {};
  for (const h of state.history) {
    if (h.void) continue;
    read[h.hotSeatId] = (read[h.hotSeatId] ?? 0) + h.correctIds.length;
    for (const id of h.correctIds) guessed[id] = (guessed[id] ?? 0) + 1;
  }
  const top = (counts) => Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const highlights = [];
  const open = top(read);
  if (open && open[1] > 0) highlights.push(`Open book: ${nameOf(ctx, open[0])} was guessed right ${open[1]} time${open[1] === 1 ? '' : 's'}`);
  const psychic = top(guessed);
  if (psychic) highlights.push(`Mind reader: ${nameOf(ctx, psychic[0])} made ${psychic[1]} correct prediction${psychic[1] === 1 ? '' : 's'}`);
  const mystery = state.history.find((h) => !h.void && h.correctIds.length === 0 && Object.keys(h.predictions).length > 0);
  if (mystery) highlights.push(`Nobody saw it coming: ${nameOf(ctx, mystery.hotSeatId)} picked "${mystery.question.options[mystery.answer]}" for "${mystery.question.text}"`);
  return { headline: headlineFor(ctx, state.scores, 'reads the room best'), ranking: ranking(state.scores), highlights };
}

function finish(state, ctx) {
  state.phase = 'finished';
  state.deadline = null;
  state.finished = true;
  state.results = summarize(state, ctx);
}

const everyoneSubmitted = (state) => activeOrder(state).every((id) => id in state.submissions);

export default {
  meta: {
    id: 'hot-seat',
    order: 9,
    name: 'Hot Seat',
    tagline: 'How well do your friends really know you?',
    minPlayers: 3,
    maxPlayers: 12,
    duration: '10–15 min',
    vibe: 'Personal',
    howToPlay: [
      'Each round one player takes the hot seat.',
      'They secretly pick their honest answer to a four-option question.',
      'Everyone else predicts what they picked.',
      'Right predictions earn a point each, and the hot-seat player earns a point for every friend who got it right.',
    ],
  },
  settings: [
    { key: 'roundsPerPlayer', label: 'Turns in the hot seat each', type: 'number', min: 1, max: 3, default: 1 },
    { key: 'seconds', label: 'Seconds to answer', type: 'number', min: 10, max: 60, step: 5, default: 25 },
    { key: 'category', label: 'Category', type: 'select', options: CATEGORY_OPTIONS, default: 'mix' },
  ],

  create(ctx) {
    const ids = ctx.players.map((p) => p.id);
    const order = shuffle(ids, ctx.rng);
    const state = {
      order,
      queue: Array.from({ length: ctx.settings.roundsPerPlayer }, () => order).flat(),
      seat: -1,
      scores: initScores(ids),
      left: [],
      round: 0,
      history: [],
      submissions: {},
      lastReveal: null,
    };
    nextSeat(state, ctx);
    return state;
  },

  actions: {
    // Hot-seat player: their true answer. Everyone else: their prediction.
    // payload: { choice: 0 | 1 | 2 | 3 }
    answer(state, ctx) {
      requirePhase(state, 'answering');
      requireParticipant(state, ctx.playerId);
      if (ctx.playerId in state.submissions) return; // locked in
      requireChoice(ctx.payload.choice, CHOICES, 'Pick one of the four options.');
      state.submissions[ctx.playerId] = ctx.payload.choice;
      if (everyoneSubmitted(state)) reveal(state, ctx);
    },
    next(state, ctx) {
      requirePhase(state, 'reveal');
      if (ctx.playerId !== ctx.hostId) fail('HOST_ONLY', 'The host moves the game along.');
      nextSeat(state, ctx);
    },
  },

  onTimeout(state, ctx) {
    if (state.phase === 'answering') reveal(state, ctx, 'no-answer');
    else if (state.phase === 'reveal') nextSeat(state, ctx);
  },

  onPlayerLeft(state, ctx) {
    markLeft(state, ctx.playerId);
    if (state.phase !== 'answering') return;
    if (ctx.playerId === state.hotSeatId) return reveal(state, ctx, 'left');
    delete state.submissions[ctx.playerId];
    if (everyoneSubmitted(state)) reveal(state, ctx);
  },

  summarize,

  /*
   * View fields:
   *   round, totalRounds, hotSeatId, amHotSeat,
   *   question { text, options: [4 strings] } (UI: "What would <name> pick?" for predictors),
   *   myChoice (0-3 | null), answeredIds (who has locked in, not what), waitingOn,
   *   hotSeatAnswered (boolean),
   *   reveal (reveal phase only): { void, reason ('no-answer'|'left'|null), answer (0-3|null),
   *     predictions {id: 0-3}, correctIds, hotSeatPoints },
   *   scores {id: n}
   */
  view(state, playerId, ctx) {
    return {
      round: state.round,
      totalRounds: state.queue.length,
      hotSeatId: state.hotSeatId,
      amHotSeat: state.hotSeatId === playerId,
      question: state.question,
      myChoice: state.submissions[playerId] ?? null,
      answeredIds: Object.keys(state.submissions),
      waitingOn: activeOrder(state).filter((id) => !(id in state.submissions)),
      hotSeatAnswered: state.hotSeatId in state.submissions,
      // The hot-seat answer and predictions only after the reveal.
      reveal: state.phase === 'reveal' ? state.lastReveal : null,
      scores: state.scores,
    };
  },
};
