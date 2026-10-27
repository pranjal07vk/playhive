import { fail, requirePhase } from '../baseGame.js';
import { activeOrder, addScore, drawFrom, headlineFor, initScores, markLeft, nameOf, ranking, requireChoice, requireParticipant, requireTurn, secondsFromNow } from '../shared/helpers.js';
import { shuffle, pick } from '../../utils/random.js';
import { CATEGORY_OPTIONS, INTENSITY_OPTIONS, promptBank } from './content.js';

/*
 * Truth or Dare
 * Phases: choosing -> prompt -> (next player's choosing | finished)
 * The turn order is shuffled once. A round is one turn for every player.
 * choosing: the current player picks truth or dare (30s, then picked at random).
 * prompt:   everyone sees the prompt. The current player taps done (+1 point)
 *           or skip (uses one of their skips, no point). After 90s the turn
 *           counts as a pass with no point.
 * The app cannot check that a dare was actually done, so the player marks it
 * themselves and the group keeps them honest. The host can skip the turn of
 * someone who has gone AFK. Disconnected players' turns are skipped.
 */
const CHOOSE_SECONDS = 30;
const PROMPT_SECONDS = 90;
const KINDS = ['truth', 'dare'];

const isHere = (state, ctx, id) => !state.left.includes(id) && (!ctx.connected || ctx.connected.has(id));

function startTurn(state, ctx, playerId) {
  state.turn += 1;
  state.currentId = playerId;
  state.kind = null;
  state.prompt = null;
  state.phase = 'choosing';
  state.deadline = secondsFromNow(ctx, CHOOSE_SECONDS);
}

function showPrompt(state, ctx, kind) {
  state.kind = kind;
  state.prompt = drawFrom(state, kind, promptBank(ctx.settings.category, ctx.settings.intensity, kind), ctx.rng);
  state.phase = 'prompt';
  state.deadline = secondsFromNow(ctx, PROMPT_SECONDS);
}

// Move to the next player in the shuffled order, skipping anyone who left or
// is disconnected (unless nobody is connected, so a network blip can't end the game).
function nextTurn(state, ctx) {
  const anyoneHere = activeOrder(state).some((id) => isHere(state, ctx, id));
  for (;;) {
    state.pos += 1;
    if (state.pos >= state.order.length) {
      state.pos = 0;
      state.round += 1;
    }
    if (state.round > ctx.settings.rounds) return finish(state, ctx);
    const id = state.order[state.pos];
    if (state.left.includes(id)) continue;
    if (anyoneHere && !isHere(state, ctx, id)) {
      state.history.push({ playerId: id, kind: null, prompt: null, outcome: 'away' });
      continue;
    }
    return startTurn(state, ctx, id);
  }
}

// outcome: 'done' | 'skipped' | 'timeout' | 'host-skipped' | 'away' | 'left'
function endTurn(state, ctx, outcome) {
  const id = state.currentId;
  if (outcome === 'done') {
    addScore(state, id, 1);
    state.completed[id][state.kind] += 1;
  }
  state.lastTurn = { playerId: id, kind: state.kind, prompt: state.prompt, outcome };
  state.history.push(state.lastTurn);
  nextTurn(state, ctx);
}

function summarize(state, ctx) {
  const notes = Object.fromEntries(
    Object.entries(state.completed).map(([id, c]) => [id, `${c.truth} truth${c.truth === 1 ? '' : 's'}, ${c.dare} dare${c.dare === 1 ? '' : 's'}`]),
  );
  const most = (kind) => Object.entries(state.completed).reduce((best, [id, c]) => (c[kind] > (best?.n ?? 0) ? { id, n: c[kind] } : best), null);
  const daredevil = most('dare');
  const honest = most('truth');
  const skips = state.history.filter((h) => h.outcome === 'skipped').length;
  const highlights = [];
  if (daredevil) highlights.push(`Daredevil: ${nameOf(ctx, daredevil.id)} finished ${daredevil.n} dare${daredevil.n === 1 ? '' : 's'}`);
  if (honest) highlights.push(`Most honest: ${nameOf(ctx, honest.id)} answered ${honest.n} truth${honest.n === 1 ? '' : 's'}`);
  if (skips) highlights.push(`${skips} prompt${skips === 1 ? ' was' : 's were'} skipped. We saw that.`);
  return {
    headline: headlineFor(ctx, state.scores, 'is the bravest of them all'),
    ranking: ranking(state.scores, notes),
    highlights,
  };
}

function finish(state, ctx) {
  state.phase = 'finished';
  state.deadline = null;
  state.currentId = null;
  state.finished = true;
  state.results = summarize(state, ctx);
}

// Stale-click guard: a client may send the turn number it is acting on.
const isStale = (state, ctx) => ctx.payload.turn !== undefined && ctx.payload.turn !== state.turn;

function requireMyPrompt(state, ctx) {
  requirePhase(state, 'prompt');
  requireParticipant(state, ctx.playerId);
  requireTurn(ctx.playerId, state.currentId);
}

export default {
  meta: {
    id: 'truth-or-dare',
    order: 1,
    name: 'Truth or Dare',
    tagline: 'Spill it or do it. Your call.',
    minPlayers: 3,
    maxPlayers: 12,
    duration: '10–20 min',
    vibe: 'Bold',
    howToPlay: [
      'Players take turns in a shuffled order. On your turn, pick truth or dare.',
      'Everyone sees your prompt. Answer it or do it, then tap Done for a point.',
      'Not feeling it? Use a skip. You get a limited number and score nothing for that turn.',
      'The app cannot see you, so the group decides if you really did it.',
    ],
  },
  settings: [
    { key: 'rounds', label: 'Rounds (one turn each)', type: 'number', min: 1, max: 5, default: 2 },
    { key: 'intensity', label: 'Intensity', type: 'select', options: INTENSITY_OPTIONS, default: 'mild' },
    { key: 'category', label: 'Category', type: 'select', options: CATEGORY_OPTIONS, default: 'mix' },
    { key: 'skipsPerPlayer', label: 'Skips per player', type: 'number', min: 0, max: 3, default: 1 },
  ],

  create(ctx) {
    const ids = ctx.players.map((p) => p.id);
    const state = {
      order: shuffle(ids, ctx.rng),
      scores: initScores(ids),
      skipsLeft: Object.fromEntries(ids.map((id) => [id, ctx.settings.skipsPerPlayer])),
      completed: Object.fromEntries(ids.map((id) => [id, { truth: 0, dare: 0 }])),
      left: [],
      round: 1,
      pos: -1,
      turn: 0,
      currentId: null,
      kind: null,
      prompt: null,
      lastTurn: null,
      history: [],
    };
    nextTurn(state, ctx);
    return state;
  },

  actions: {
    // payload: { kind: 'truth' | 'dare' }
    choose(state, ctx) {
      requirePhase(state, 'choosing');
      requireParticipant(state, ctx.playerId);
      requireTurn(ctx.playerId, state.currentId);
      requireChoice(ctx.payload.kind, KINDS, 'Pick truth or dare.');
      showPrompt(state, ctx, ctx.payload.kind);
    },
    // payload: { turn? }
    done(state, ctx) {
      requireMyPrompt(state, ctx);
      if (isStale(state, ctx)) return;
      endTurn(state, ctx, 'done');
    },
    // payload: { turn? }
    skip(state, ctx) {
      requireMyPrompt(state, ctx);
      if (isStale(state, ctx)) return;
      if (state.skipsLeft[ctx.playerId] <= 0) fail('NO_SKIPS', 'You have no skips left. Time to be brave!');
      state.skipsLeft[ctx.playerId] -= 1;
      endTurn(state, ctx, 'skipped');
    },
    // Host only, for AFK players. payload: { turn } so a double click can't skip two people.
    skipTurn(state, ctx) {
      requirePhase(state, 'choosing', 'prompt');
      if (ctx.playerId !== ctx.hostId) fail('HOST_ONLY', 'Only the host can skip a turn.');
      if (!Number.isInteger(ctx.payload.turn)) fail('BAD_PAYLOAD', 'Which turn should be skipped?');
      if (isStale(state, ctx)) return;
      endTurn(state, ctx, 'host-skipped');
    },
  },

  onTimeout(state, ctx) {
    if (state.phase === 'choosing') {
      if (!isHere(state, ctx, state.currentId)) endTurn(state, ctx, 'away');
      else showPrompt(state, ctx, pick(KINDS, ctx.rng));
    } else if (state.phase === 'prompt') {
      endTurn(state, ctx, 'timeout');
    }
  },

  onPlayerLeft(state, ctx) {
    markLeft(state, ctx.playerId);
    if (ctx.playerId === state.currentId && (state.phase === 'choosing' || state.phase === 'prompt')) endTurn(state, ctx, 'left');
  },

  summarize,

  /*
   * View fields (nothing here is secret, everyone sees the same prompt):
   *   round, totalRounds, turn (send it back with done/skip/skipTurn),
   *   currentPlayerId, isMyTurn, kind ('truth'|'dare'|null), prompt (string|null, prompt phase only),
   *   skipsLeft {id: n}, mySkipsLeft, canSkip,
   *   lastTurn { playerId, kind, prompt, outcome } | null, scores {id: n}
   */
  view(state, playerId, ctx) {
    const isMyTurn = state.currentId === playerId;
    return {
      round: Math.min(state.round, ctx.settings.rounds),
      totalRounds: ctx.settings.rounds,
      turn: state.turn,
      currentPlayerId: state.currentId,
      isMyTurn,
      kind: state.kind,
      prompt: state.phase === 'prompt' ? state.prompt : null,
      skipsLeft: state.skipsLeft,
      mySkipsLeft: state.skipsLeft[playerId] ?? 0,
      canSkip: isMyTurn && state.phase === 'prompt' && (state.skipsLeft[playerId] ?? 0) > 0,
      lastTurn: state.lastTurn,
      scores: state.scores,
    };
  },
};
