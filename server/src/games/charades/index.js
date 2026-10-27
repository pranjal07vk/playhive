import { fail, requirePhase } from '../baseGame.js';
import { activeOrder, addScore, drawFrom, headlineFor, initScores, markLeft, nameOf, ranking, requireParticipant, secondsFromNow } from '../shared/helpers.js';
import { shuffle } from '../../utils/random.js';
import { CATEGORY_OPTIONS, wordBank } from './content.js';

/*
 * Charades
 * Phases: ready -> acting -> turnSummary -> (next ready | finished)
 * Players take turns as the performer. Only the performer sees the word and
 * acts it out silently; everyone else guesses out loud. In 'acting' the
 * performer may 'skip' up to skipsPerTurn words. When someone guesses right,
 * the performer (or the host) marks 'guessed' with who got it: +1 to the
 * performer and +1 to the guesser, then the next word appears. Moves name
 * the wordId they refer to, so stale or doubled taps are ignored.
 * The app cannot hear guesses; people mark them honestly.
 */
const READY_SECONDS = 20;
const SUMMARY_SECONDS = 8;

const available = (state, ctx, id) => !state.left?.includes(id) && (!ctx.connected || ctx.connected.has(id));

function startTurn(state, ctx) {
  while (state.turnIndex < state.turns.length && !available(state, ctx, state.turns[state.turnIndex])) state.turnIndex += 1;
  if (state.turnIndex >= state.turns.length) return finish(state, ctx);
  state.performerId = state.turns[state.turnIndex];
  state.word = null;
  state.log = [];
  state.skipsUsed = 0;
  state.phase = 'ready';
  state.deadline = secondsFromNow(ctx, READY_SECONDS);
}

function nextWord(state, ctx) {
  state.wordSeq += 1;
  state.word = { id: state.wordSeq, text: drawFrom(state, 'words', wordBank(ctx.settings.category), ctx.rng) };
}

function startActing(state, ctx) {
  state.phase = 'acting';
  state.deadline = secondsFromNow(ctx, ctx.settings.turnSeconds);
  nextWord(state, ctx);
}

function endTurn(state, ctx) {
  const got = state.log.filter((w) => w.result === 'guessed').length;
  state.history.push({ performerId: state.performerId, got });
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

const isCurrentWord = (state, ctx) => ctx.payload.wordId === state.word?.id;

function summarize(state, ctx) {
  const best = state.history.reduce((top, h) => (h.got > 0 && (!top || h.got > top.got) ? h : top), null);
  const highlights = [];
  if (best) highlights.push(`Best performance: ${nameOf(ctx, best.performerId)} got ${best.got} across in one turn`);
  const sharp = Object.entries(state.guesses).sort((a, b) => b[1] - a[1])[0];
  if (sharp && sharp[1] > 0) highlights.push(`Sharpest guesser: ${nameOf(ctx, sharp[0])} with ${sharp[1]} correct`);
  return { headline: headlineFor(ctx, state.scores, 'steals the show'), ranking: ranking(state.scores), highlights };
}

function finish(state, ctx) {
  state.phase = 'finished';
  state.deadline = null;
  state.finished = true;
  state.results = summarize(state, ctx);
}

export default {
  meta: {
    id: 'charades',
    order: 6,
    name: 'Charades',
    tagline: 'No words. Just wild gestures.',
    minPlayers: 3,
    maxPlayers: 12,
    duration: '15–20 min',
    vibe: 'Acting',
    howToPlay: [
      'On your turn, only you see the word. Act it out without speaking.',
      'Everyone else shouts guesses. Play in the same room or with cameras on.',
      'When someone gets it, the performer or host taps who guessed it. Both of you score a point.',
      'Stuck? The performer can skip a few words each turn.',
    ],
  },
  settings: [
    { key: 'turnSeconds', label: 'Seconds per turn', type: 'number', min: 30, max: 180, step: 15, default: 90 },
    { key: 'category', label: 'Category', type: 'select', options: CATEGORY_OPTIONS, default: 'mix' },
    { key: 'skipsPerTurn', label: 'Skips per turn', type: 'number', min: 0, max: 5, default: 2 },
    { key: 'turnsPerPlayer', label: 'Turns each', type: 'number', min: 1, max: 2, default: 1 },
  ],

  create(ctx) {
    const ids = ctx.players.map((p) => p.id);
    const order = shuffle(ids, ctx.rng);
    const turns = Array.from({ length: ctx.settings.turnsPerPlayer }, () => order).flat();
    const state = { order, turns, turnIndex: 0, wordSeq: 0, scores: initScores(ids), guesses: initScores(ids), history: [] };
    startTurn(state, ctx);
    return state;
  },

  actions: {
    start(state, ctx) {
      requirePhase(state, 'ready');
      if (ctx.playerId !== state.performerId && ctx.playerId !== ctx.hostId) fail('NOT_YOUR_TURN', 'The performer starts the turn.');
      startActing(state, ctx);
    },
    // payload: { wordId }
    skip(state, ctx) {
      requirePhase(state, 'acting');
      if (ctx.playerId !== state.performerId) fail('NOT_YOUR_TURN', 'Only the performer can skip.');
      if (!isCurrentWord(state, ctx)) return; // stale tap
      if (state.skipsUsed >= ctx.settings.skipsPerTurn) fail('NO_SKIPS_LEFT', 'No skips left this turn. Keep acting!');
      state.skipsUsed += 1;
      state.log.push({ wordId: state.word.id, text: state.word.text, result: 'skipped' });
      nextWord(state, ctx);
    },
    // payload: { wordId, guesserId }
    guessed(state, ctx) {
      requirePhase(state, 'acting');
      if (ctx.playerId !== state.performerId && ctx.playerId !== ctx.hostId) fail('NOT_YOUR_TURN', 'The performer or host marks guesses.');
      if (!isCurrentWord(state, ctx)) return; // stale or doubled tap
      const { guesserId } = ctx.payload;
      if (typeof guesserId !== 'string' || guesserId === state.performerId || !activeOrder(state).includes(guesserId)) {
        fail('INVALID_CHOICE', 'Pick the player who guessed it.');
      }
      addScore(state, state.performerId, 1);
      addScore(state, guesserId, 1);
      state.guesses[guesserId] += 1;
      state.log.push({ wordId: state.word.id, text: state.word.text, result: 'guessed', guesserId });
      nextWord(state, ctx);
    },
    next(state, ctx) {
      requirePhase(state, 'turnSummary');
      if (ctx.playerId !== ctx.hostId) fail('HOST_ONLY', 'The host moves the game along.');
      advance(state, ctx);
    },
  },

  onTimeout(state, ctx) {
    if (state.phase === 'ready') startActing(state, ctx);
    else if (state.phase === 'acting') endTurn(state, ctx);
    else if (state.phase === 'turnSummary') advance(state, ctx);
  },

  onPlayerLeft(state, ctx) {
    markLeft(state, ctx.playerId);
    if (ctx.playerId !== state.performerId) return;
    if (state.phase === 'ready') advance(state, ctx);
    else if (state.phase === 'acting') endTurn(state, ctx);
  },

  summarize,

  /*
   * View fields:
   *   turn, totalTurns   1-based turn number and total turns planned
   *   performerId        who is acting
   *   isPerformer        true for the performer
   *   wordId             id of the current word (send it with skip/guessed)
   *   word               current word text, performer only
   *   skipsLeft          skips remaining this turn
   *   log                [{ wordId, text, result: 'guessed'|'skipped'|'timeUp', guesserId? }];
   *                      performer only while acting, everyone in 'turnSummary'
   *   gotCount           words guessed this turn (everyone)
   *   guessers           players who can be credited with a guess
   *   scores
   */
  view(state, playerId, ctx) {
    const isPerformer = playerId === state.performerId;
    const showLog = isPerformer || state.phase === 'turnSummary';
    return {
      turn: Math.min(state.turnIndex + 1, state.turns.length),
      totalTurns: state.turns.length,
      performerId: state.performerId,
      isPerformer,
      wordId: state.word?.id ?? null,
      word: isPerformer ? state.word?.text ?? null : null,
      skipsLeft: Math.max(0, ctx.settings.skipsPerTurn - state.skipsUsed),
      log: showLog ? state.log : null,
      gotCount: state.log.filter((w) => w.result === 'guessed').length,
      guessers: activeOrder(state).filter((id) => id !== state.performerId),
      scores: state.scores,
    };
  },
};
