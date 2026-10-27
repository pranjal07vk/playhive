import { fail, requirePhase } from '../baseGame.js';
import { activeOrder, addScore, drawFrom, headlineFor, initScores, markLeft, nameOf, ranking, requireParticipant, requireTurn, secondsFromNow } from '../shared/helpers.js';
import { pick } from '../../utils/random.js';
import { CATEGORY_KINDS, CATEGORY_OPTIONS, PROMPTS } from './content.js';

/*
 * Spin the Bottle (the friendly version: no kissing, just prompts)
 * Phases: ready -> spun -> (ready | finished)
 * ready: the spinner (random at first) taps spin. After 30s it spins itself.
 * spun:  the server picks a target (never the spinner, not the previous target
 *        when possible, and not straight back to the previous spinner when at
 *        least two others are available) and a prompt of a kind allowed by the category.
 *        Every client animates the bottle to state.order[targetIndex];
 *        spinId changes on every spin so clients know to animate.
 *        The target taps done (+1) or skip (limited). After 90s it is a pass.
 *        The target becomes the next spinner.
 * The app cannot check the prompt was done, so the target marks it and the
 * group keeps them honest. The game ends after `spins` resolved spins.
 */
const READY_SECONDS = 30;
const PROMPT_SECONDS = 90;

const isHere = (state, ctx, id) => !state.left.includes(id) && (!ctx.connected || ctx.connected.has(id));

// Prefer connected players; fall back to anyone still in the game.
function candidates(state, ctx, exclude = []) {
  const pool = activeOrder(state).filter((id) => !exclude.includes(id));
  const here = pool.filter((id) => isHere(state, ctx, id));
  return here.length ? here : pool;
}

function startReady(state, ctx, spinnerId) {
  state.spinnerId = spinnerId;
  state.targetId = null;
  state.prompt = null;
  state.phase = 'ready';
  state.deadline = secondsFromNow(ctx, READY_SECONDS);
}

function spin(state, ctx) {
  const spinner = state.spinnerId;
  let pool = candidates(state, ctx, [spinner]);
  // Usually the previous target is the spinner. When it isn't (the spinner was
  // reassigned), avoid them whenever possible.
  const notLastTarget = pool.filter((id) => id !== state.prevTargetId);
  if (notLastTarget.length) pool = notLastTarget;
  // Avoid bouncing straight back to whoever just spun, but only if that still
  // leaves a real choice (with 3 players it would make every spin predictable).
  const noBounce = pool.filter((id) => id !== state.prevSpinnerId);
  if (noBounce.length >= 2) pool = noBounce;
  state.targetId = pick(pool, ctx.rng);
  const kind = pick(CATEGORY_KINDS[ctx.settings.category], ctx.rng);
  const text = drawFrom(state, kind, PROMPTS[kind], ctx.rng).replaceAll('{spinner}', nameOf(ctx, spinner));
  state.prompt = { kind, text };
  state.spinId += 1;
  state.phase = 'spun';
  state.deadline = secondsFromNow(ctx, PROMPT_SECONDS);
}

// outcome: 'done' | 'skipped' | 'timeout' | 'host-skipped'
function resolve(state, ctx, outcome) {
  const target = state.targetId;
  if (outcome === 'done') addScore(state, target, 1);
  state.lastSpin = { spinId: state.spinId, spinnerId: state.spinnerId, targetId: target, prompt: state.prompt, outcome };
  state.history.push(state.lastSpin);
  state.spinsDone += 1;
  state.prevSpinnerId = state.spinnerId;
  state.prevTargetId = target;
  if (state.spinsDone >= ctx.settings.spins) return finish(state, ctx);
  startReady(state, ctx, target);
}

function summarize(state, ctx) {
  const picked = {};
  for (const h of state.history) picked[h.targetId] = (picked[h.targetId] ?? 0) + 1;
  const [favId, favCount] = Object.entries(picked).sort((a, b) => b[1] - a[1])[0] ?? [];
  const compliments = state.history.filter((h) => h.prompt.kind === 'compliment' && h.outcome === 'done').length;
  const skips = state.history.filter((h) => h.outcome === 'skipped').length;
  const highlights = [];
  if (favId) highlights.push(`The bottle's favourite: ${nameOf(ctx, favId)} (picked ${favCount} time${favCount === 1 ? '' : 's'})`);
  if (compliments) highlights.push(`${compliments} compliment${compliments === 1 ? '' : 's'} handed out. Wholesome.`);
  if (skips) highlights.push(`${skips} prompt${skips === 1 ? ' was' : 's were'} skipped.`);
  return { headline: headlineFor(ctx, state.scores, 'tamed the bottle'), ranking: ranking(state.scores), highlights };
}

function finish(state, ctx) {
  state.phase = 'finished';
  state.deadline = null;
  state.finished = true;
  state.results = summarize(state, ctx);
}

// Stale-click guard: clients may send the spinId they are acting on.
const isStale = (state, ctx) => ctx.payload.spinId !== undefined && ctx.payload.spinId !== state.spinId;

function requireMyPrompt(state, ctx) {
  requirePhase(state, 'spun');
  requireParticipant(state, ctx.playerId);
  requireTurn(ctx.playerId, state.targetId, 'The bottle did not pick you this time.');
}

export default {
  meta: {
    id: 'spin-the-bottle',
    order: 11,
    name: 'Spin the Bottle',
    tagline: 'Wherever it stops, the fun starts.',
    minPlayers: 3,
    maxPlayers: 12,
    duration: '10–20 min',
    vibe: 'Chaotic',
    howToPlay: [
      'The spinner taps Spin and the bottle picks someone at random.',
      'That player gets a prompt: a truth, dare, question, compliment or challenge.',
      'Do it and tap Done for a point, or use one of your limited skips.',
      'Whoever the bottle picked spins next. Friendly prompts only, no kissing!',
    ],
  },
  settings: [
    { key: 'spins', label: 'Total spins', type: 'number', min: 5, max: 30, default: 12 },
    { key: 'category', label: 'Prompt mix', type: 'select', options: CATEGORY_OPTIONS, default: 'mix' },
    { key: 'skipsPerPlayer', label: 'Skips per player', type: 'number', min: 0, max: 3, default: 1 },
  ],

  create(ctx) {
    const ids = ctx.players.map((p) => p.id);
    const state = {
      order: ids,
      scores: initScores(ids),
      skipsLeft: Object.fromEntries(ids.map((id) => [id, ctx.settings.skipsPerPlayer])),
      left: [],
      spinId: 0,
      spinsDone: 0,
      prevSpinnerId: null,
      prevTargetId: null,
      lastSpin: null,
      history: [],
    };
    startReady(state, ctx, pick(candidates(state, ctx), ctx.rng));
    return state;
  },

  actions: {
    // Only the current spinner. payload: none
    spin(state, ctx) {
      requirePhase(state, 'ready');
      requireParticipant(state, ctx.playerId);
      requireTurn(ctx.playerId, state.spinnerId, 'Wait for your turn to spin.');
      spin(state, ctx);
    },
    // Only the target. payload: { spinId? }
    done(state, ctx) {
      requireMyPrompt(state, ctx);
      if (isStale(state, ctx)) return;
      resolve(state, ctx, 'done');
    },
    skip(state, ctx) {
      requireMyPrompt(state, ctx);
      if (isStale(state, ctx)) return;
      if (state.skipsLeft[ctx.playerId] <= 0) fail('NO_SKIPS', 'You have no skips left. Go for it!');
      state.skipsLeft[ctx.playerId] -= 1;
      resolve(state, ctx, 'skipped');
    },
    // Host only, for AFK players: spins for an idle spinner, or passes an idle target.
    // payload: { spinId } (the current one) so a double click can't act twice.
    skipTurn(state, ctx) {
      requirePhase(state, 'ready', 'spun');
      if (ctx.playerId !== ctx.hostId) fail('HOST_ONLY', 'Only the host can skip a turn.');
      if (!Number.isInteger(ctx.payload.spinId)) fail('BAD_PAYLOAD', 'Which spin should be skipped?');
      if (isStale(state, ctx)) return;
      if (state.phase === 'ready') spin(state, ctx);
      else resolve(state, ctx, 'host-skipped');
    },
  },

  onTimeout(state, ctx) {
    if (state.phase === 'ready') spin(state, ctx);
    else if (state.phase === 'spun') resolve(state, ctx, 'timeout');
  },

  onPlayerLeft(state, ctx) {
    markLeft(state, ctx.playerId);
    if (state.phase === 'ready' && ctx.playerId === state.spinnerId) {
      startReady(state, ctx, pick(candidates(state, ctx), ctx.rng));
    } else if (state.phase === 'spun' && ctx.playerId === state.targetId) {
      // The spin doesn't count; the same spinner spins again.
      const spinner = state.left.includes(state.spinnerId) ? pick(candidates(state, ctx), ctx.rng) : state.spinnerId;
      startReady(state, ctx, spinner);
    }
  },

  summarize,

  /*
   * View fields (nothing secret in this game):
   *   seats (player ids in a fixed circle, including people who left, so angles stay stable),
   *   leftIds, spinnerId, spinnerIndex, targetId, targetIndex (index into seats, spun phase only),
   *   spinId (increments on every spin: animate the bottle when it changes),
   *   prompt { kind: 'truth'|'dare'|'question'|'compliment'|'challenge', text } (spun phase only),
   *   isMySpin, isMyTarget, mySkipsLeft, canSkip, skipsLeft {id: n},
   *   spinsDone, totalSpins, lastSpin { spinId, spinnerId, targetId, prompt, outcome } | null, scores
   */
  view(state, playerId, ctx) {
    const spun = state.phase === 'spun';
    const isMyTarget = spun && state.targetId === playerId;
    return {
      seats: state.order,
      leftIds: state.left,
      spinnerId: state.spinnerId,
      spinnerIndex: state.order.indexOf(state.spinnerId),
      targetId: spun ? state.targetId : null,
      targetIndex: spun ? state.order.indexOf(state.targetId) : null,
      spinId: state.spinId,
      prompt: spun ? state.prompt : null,
      isMySpin: state.phase === 'ready' && state.spinnerId === playerId,
      isMyTarget,
      mySkipsLeft: state.skipsLeft[playerId] ?? 0,
      canSkip: isMyTarget && (state.skipsLeft[playerId] ?? 0) > 0,
      skipsLeft: state.skipsLeft,
      spinsDone: state.spinsDone,
      totalSpins: ctx.settings.spins,
      lastSpin: state.lastSpin,
      scores: state.scores,
    };
  },
};
