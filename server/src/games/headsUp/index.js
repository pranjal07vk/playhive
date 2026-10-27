import { fail, requirePhase } from '../baseGame.js';
import { activeOrder, addScore, drawFrom, headlineFor, initScores, markLeft, nameOf, ranking, requireParticipant, secondsFromNow } from '../shared/helpers.js';
import { shuffle } from '../../utils/random.js';
import { CATEGORY_OPTIONS, wordBank } from './content.js';

/*
 * Heads Up (remote-friendly)
 * Phases: ready -> playing -> turnSummary -> (next ready | finished)
 * Players take turns as the guesser. Everyone except the guesser sees the
 * word and gives spoken clues (on a call or in person). In 'ready' the
 * guesser taps start (or it auto-starts). In 'playing' a stream of words is
 * shown until the turn timer ends. Anyone can mark the word 'correct'
 * (+1 to the guesser) or 'pass' it (unlimited, but counted). Both moves name
 * the wordId they refer to, so a stale or doubled tap is ignored.
 * The app cannot hear guesses; people mark them honestly.
 */
const READY_SECONDS = 20;
const SUMMARY_SECONDS = 6;

const available = (state, ctx, id) => !state.left?.includes(id) && (!ctx.connected || ctx.connected.has(id));

function startTurn(state, ctx) {
  while (state.turnIndex < state.turns.length && !available(state, ctx, state.turns[state.turnIndex])) state.turnIndex += 1;
  if (state.turnIndex >= state.turns.length) return finish(state, ctx);
  state.guesserId = state.turns[state.turnIndex];
  state.word = null;
  state.log = [];
  state.phase = 'ready';
  state.deadline = secondsFromNow(ctx, READY_SECONDS);
}

function nextWord(state, ctx) {
  state.wordSeq += 1;
  state.word = { id: state.wordSeq, text: drawFrom(state, 'words', wordBank(ctx.settings.category), ctx.rng) };
}

function startPlaying(state, ctx) {
  state.phase = 'playing';
  state.deadline = secondsFromNow(ctx, ctx.settings.turnSeconds);
  nextWord(state, ctx);
}

function endTurn(state, ctx) {
  const got = state.log.filter((w) => w.result === 'correct').length;
  state.history.push({ guesserId: state.guesserId, got });
  // The word on screen when time ran out is shown to everyone in the summary.
  if (state.word) state.log.push({ wordId: state.word.id, text: state.word.text, result: 'timeUp' });
  state.word = null;
  state.phase = 'turnSummary';
  state.deadline = secondsFromNow(ctx, SUMMARY_SECONDS);
}

function advance(state, ctx) {
  state.turnIndex += 1;
  startTurn(state, ctx);
}

// Shared by 'correct' and 'pass'. A tap for an old word does nothing.
function resolveWord(state, ctx, result) {
  requirePhase(state, 'playing');
  requireParticipant(state, ctx.playerId);
  if (ctx.payload.wordId !== state.word?.id) return; // stale tap from an earlier word
  state.log.push({ wordId: state.word.id, text: state.word.text, result });
  if (result === 'correct') addScore(state, state.guesserId, 1);
  else state.passes[state.guesserId] += 1;
  nextWord(state, ctx);
}

function summarize(state, ctx) {
  const best = state.history.reduce((top, h) => (h.got > 0 && (!top || h.got > top.got) ? h : top), null);
  const highlights = [];
  if (best) highlights.push(`Best turn: ${nameOf(ctx, best.guesserId)} got ${best.got} in one go`);
  const passer = Object.entries(state.passes).sort((a, b) => b[1] - a[1])[0];
  if (passer && passer[1] > 0) highlights.push(`Pass master: ${nameOf(ctx, passer[0])} skipped ${passer[1]} words`);
  return { headline: headlineFor(ctx, state.scores, 'reads minds best'), ranking: ranking(state.scores), highlights };
}

function finish(state, ctx) {
  state.phase = 'finished';
  state.deadline = null;
  state.finished = true;
  state.results = summarize(state, ctx);
}

export default {
  meta: {
    id: 'heads-up',
    order: 5,
    name: 'Heads Up',
    tagline: 'Everyone knows the word except you.',
    minPlayers: 3,
    maxPlayers: 12,
    duration: '10–15 min',
    vibe: 'Frantic',
    howToPlay: [
      'On your turn you are the guesser, and your screen hides the word.',
      'Everyone else sees it and shouts clues without saying the word itself.',
      'Tap Correct when the guesser gets it, or Pass to move on. Each correct word is a point for the guesser.',
      'The app cannot hear you, so mark guesses honestly. Play on a call or in the same room.',
    ],
  },
  settings: [
    { key: 'turnSeconds', label: 'Seconds per turn', type: 'number', min: 30, max: 120, step: 15, default: 60 },
    { key: 'category', label: 'Category', type: 'select', options: CATEGORY_OPTIONS, default: 'mix' },
    { key: 'turnsPerPlayer', label: 'Turns each', type: 'number', min: 1, max: 2, default: 1 },
  ],

  create(ctx) {
    const ids = ctx.players.map((p) => p.id);
    const order = shuffle(ids, ctx.rng);
    const turns = Array.from({ length: ctx.settings.turnsPerPlayer }, () => order).flat();
    const state = { order, turns, turnIndex: 0, wordSeq: 0, scores: initScores(ids), passes: initScores(ids), history: [] };
    startTurn(state, ctx);
    return state;
  },

  actions: {
    start(state, ctx) {
      requirePhase(state, 'ready');
      if (ctx.playerId !== state.guesserId && ctx.playerId !== ctx.hostId) fail('NOT_YOUR_TURN', 'The guesser starts the turn.');
      startPlaying(state, ctx);
    },
    // payload: { wordId }
    correct(state, ctx) {
      resolveWord(state, ctx, 'correct');
    },
    // payload: { wordId }
    pass(state, ctx) {
      resolveWord(state, ctx, 'pass');
    },
    next(state, ctx) {
      requirePhase(state, 'turnSummary');
      if (ctx.playerId !== ctx.hostId) fail('HOST_ONLY', 'The host moves the game along.');
      advance(state, ctx);
    },
  },

  onTimeout(state, ctx) {
    if (state.phase === 'ready') startPlaying(state, ctx);
    else if (state.phase === 'playing') endTurn(state, ctx);
    else if (state.phase === 'turnSummary') advance(state, ctx);
  },

  onPlayerLeft(state, ctx) {
    markLeft(state, ctx.playerId);
    if (ctx.playerId !== state.guesserId) return;
    if (state.phase === 'ready') advance(state, ctx);
    else if (state.phase === 'playing') endTurn(state, ctx);
  },

  summarize,

  /*
   * View fields:
   *   turn, totalTurns    1-based turn number and total turns planned
   *   guesserId           whose turn it is
   *   isGuesser           true for the guesser
   *   wordId              id of the current word (send it with correct/pass)
   *   word                current word text; null for the guesser
   *   log                 [{ wordId, text, result: 'correct'|'pass'|'timeUp' }] for this turn;
   *                       hidden from the guesser until 'turnSummary'
   *   gotCount, passCount this turn's totals (everyone)
   *   clueGivers          everyone else still in the game
   *   scores, passes      per-player totals
   */
  view(state, playerId) {
    const isGuesser = playerId === state.guesserId;
    const hideFromMe = isGuesser && state.phase !== 'turnSummary';
    const count = (result) => state.log.filter((w) => w.result === result).length;
    return {
      turn: Math.min(state.turnIndex + 1, state.turns.length),
      totalTurns: state.turns.length,
      guesserId: state.guesserId,
      isGuesser,
      wordId: state.word?.id ?? null,
      word: isGuesser ? null : state.word?.text ?? null,
      log: hideFromMe ? null : state.log,
      gotCount: count('correct'),
      passCount: count('pass'),
      clueGivers: activeOrder(state).filter((id) => id !== state.guesserId),
      scores: state.scores,
      passes: state.passes,
    };
  },
};
