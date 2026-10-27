import { fail, requirePhase } from '../baseGame.js';
import { activeOrder, drawFrom, headlineFor, initScores, markLeft, nameOf, ranking, requireChoice, requireParticipant, secondsFromNow } from '../shared/helpers.js';
import { CATEGORY_OPTIONS, statementBank } from './content.js';

/*
 * Never Have I Ever
 * Phases: answering -> reveal -> (next answering | finished)
 * Everyone answers "I have" or "Never" in secret. Answering closes when every
 * remaining player has answered or the timer runs out (no answer costs nothing
 * and is left out of the counts).
 * Lives mode (lives > 0): everyone starts with N fingers, each "I have" costs
 * one at the reveal. At 0 you are out but can keep answering for fun. Most
 * fingers left wins. With lives = 0 there is no scoring, just stories.
 * Privacy: 'named' reveals who said "I have"; 'anonymous' only reveals counts,
 * and other players' lives stay hidden until the end (they would give answers away).
 * Answers are never visible to anyone else before the reveal.
 */
const REVEAL_SECONDS = 8;
const ANSWERS = ['have', 'never'];

function startStatement(state, ctx) {
  state.round += 1;
  state.statement = drawFrom(state, 's', statementBank(ctx.settings.category), ctx.rng);
  state.answers = {};
  state.phase = 'answering';
  state.deadline = secondsFromNow(ctx, ctx.settings.answerSeconds);
}

function reveal(state, ctx) {
  const haveIds = Object.keys(state.answers).filter((id) => state.answers[id] === 'have');
  for (const id of haveIds) {
    state.haveCounts[id] += 1;
    if (state.lives && state.lives[id] > 0) state.lives[id] -= 1;
  }
  const answered = Object.keys(state.answers).length;
  state.lastResult = { have: haveIds.length, never: answered - haveIds.length, haveIds };
  state.history.push({ statement: state.statement, have: haveIds.length, answered });
  state.phase = 'reveal';
  state.deadline = secondsFromNow(ctx, REVEAL_SECONDS);
}

function advance(state, ctx) {
  if (state.round >= ctx.settings.rounds) return finish(state, ctx);
  return startStatement(state, ctx);
}

function summarize(state, ctx) {
  const named = ctx.settings.privacy === 'named';
  const highlights = [];
  const asked = state.history.filter((h) => h.answered > 0);
  const top = asked.reduce((best, h) => (!best || h.have / h.answered > best.have / best.answered ? h : best), null);
  if (top && top.have > 0) highlights.push(`Most of you have ${top.statement} (${top.have} of ${top.answered})`);
  const clean = asked.find((h) => h.have === 0);
  if (clean) highlights.push(`Nobody has ever ${clean.statement}. Suspicious.`);

  if (state.lives) {
    const notes = Object.fromEntries(Object.entries(state.lives).map(([id, n]) => [id, n === 0 ? 'Out of fingers' : `${n} finger${n === 1 ? '' : 's'} left`]));
    return { headline: headlineFor(ctx, state.lives, 'has the most innocent record'), ranking: ranking(state.lives, notes), highlights };
  }
  // No scoring. Only named games may say who admitted the most.
  const zero = initScores(Object.keys(state.haveCounts));
  if (!named) return { headline: 'That is a wrap. Your secrets are safe with us.', ranking: ranking(zero), highlights };
  const notes = Object.fromEntries(Object.entries(state.haveCounts).map(([id, n]) => [id, `${n} × "I have"`]));
  const [mostId, most] = Object.entries(state.haveCounts).sort((a, b) => b[1] - a[1])[0] ?? [];
  if (most > 0) highlights.unshift(`${nameOf(ctx, mostId)} has lived the most: ${most} × "I have"`);
  return { headline: 'That is a wrap. Friendships survived (probably).', ranking: ranking(zero, notes), highlights };
}

function finish(state, ctx) {
  state.phase = 'finished';
  state.deadline = null;
  state.finished = true;
  state.results = summarize(state, ctx);
}

const everyoneAnswered = (state) => activeOrder(state).every((id) => id in state.answers);

export default {
  meta: {
    id: 'never-have-i-ever',
    order: 3,
    name: 'Never Have I Ever',
    tagline: 'Find out who has. No judgement. Mostly.',
    minPlayers: 3,
    maxPlayers: 15,
    duration: '10–15 min',
    vibe: 'Confessions',
    howToPlay: [
      'A "Never have I ever..." statement appears for everyone.',
      'Tap "I have" or "Never" in secret. Nobody sees answers until the reveal.',
      'With fingers on, every "I have" costs a finger. Most fingers left wins.',
      'In anonymous mode only the totals are shown, never who said what.',
    ],
  },
  settings: [
    { key: 'rounds', label: 'Statements', type: 'number', min: 5, max: 25, default: 10 },
    { key: 'answerSeconds', label: 'Seconds to answer', type: 'number', min: 10, max: 60, step: 5, default: 20 },
    { key: 'category', label: 'Category', type: 'select', options: CATEGORY_OPTIONS, default: 'mix' },
    { key: 'lives', label: 'Fingers each (0 = no scoring)', type: 'number', min: 0, max: 10, default: 5 },
    {
      key: 'privacy',
      label: 'Reveal',
      type: 'select',
      options: [
        { value: 'named', label: 'Show who said "I have"' },
        { value: 'anonymous', label: 'Anonymous (totals only)' },
      ],
      default: 'named',
    },
  ],

  create(ctx) {
    const ids = ctx.players.map((p) => p.id);
    const state = {
      order: ids,
      lives: ctx.settings.lives > 0 ? Object.fromEntries(ids.map((id) => [id, ctx.settings.lives])) : null,
      haveCounts: initScores(ids),
      round: 0,
      history: [],
      lastResult: null,
    };
    startStatement(state, ctx);
    return state;
  },

  actions: {
    // payload: { answer: 'have' | 'never' }
    answer(state, ctx) {
      requirePhase(state, 'answering');
      requireParticipant(state, ctx.playerId);
      if (ctx.playerId in state.answers) return; // first answer sticks
      requireChoice(ctx.payload.answer, ANSWERS, 'Answer "have" or "never".');
      state.answers[ctx.playerId] = ctx.payload.answer;
      if (everyoneAnswered(state)) reveal(state, ctx);
    },
    next(state, ctx) {
      requirePhase(state, 'reveal');
      if (ctx.playerId !== ctx.hostId) fail('HOST_ONLY', 'The host moves the game along.');
      advance(state, ctx);
    },
  },

  onTimeout(state, ctx) {
    if (state.phase === 'answering') reveal(state, ctx);
    else if (state.phase === 'reveal') advance(state, ctx);
  },

  onPlayerLeft(state, ctx) {
    markLeft(state, ctx.playerId);
    delete state.answers[ctx.playerId];
    if (state.phase === 'answering' && everyoneAnswered(state)) reveal(state, ctx);
  },

  summarize,

  /*
   * View fields:
   *   round, totalRounds, statement (text after "Never have I ever"), privacy ('named'|'anonymous'),
   *   myAnswer ('have'|'never'|null), answeredIds (who has answered, not what), waitingOn,
   *   result (reveal phase only): { have, never, haveIds (named only, else null) },
   *   livesMode, startingLives, myLives (null if no lives), amOut,
   *   lives ({id: n} in named mode; null in anonymous mode or without lives)
   */
  view(state, playerId, ctx) {
    const named = ctx.settings.privacy === 'named';
    const revealed = state.phase === 'reveal' && state.lastResult;
    return {
      round: state.round,
      totalRounds: ctx.settings.rounds,
      statement: state.statement,
      privacy: ctx.settings.privacy,
      myAnswer: state.answers[playerId] ?? null,
      answeredIds: Object.keys(state.answers),
      waitingOn: activeOrder(state).filter((id) => !(id in state.answers)),
      result: revealed
        ? { have: state.lastResult.have, never: state.lastResult.never, haveIds: named ? state.lastResult.haveIds : null }
        : null,
      livesMode: Boolean(state.lives),
      startingLives: ctx.settings.lives,
      myLives: state.lives?.[playerId] ?? null,
      amOut: state.lives ? state.lives[playerId] === 0 : false,
      lives: state.lives && named ? state.lives : null,
    };
  },
};
