import { fail, requirePhase } from '../baseGame.js';
import { drawFrom, initScores, markLeft, nameOf, ranking, requireParticipant, secondsFromNow } from '../shared/helpers.js';
import { cleanText } from '../../utils/text.js';
import { validateDrawing } from '../pictionary/strokes.js';
import { SUGGESTIONS } from './content.js';

/*
 * Telephone (Telestrations-style)
 * Phases: writing -> step (repeats) -> reveal -> finished
 * n players start n chains. Step 0 ('writing'): everyone writes a starting
 * phrase (or asks for a suggestion). At step k, player i works on chain
 * (i + k) mod n and only sees that chain's previous entry, so nobody sees
 * their own chain until the reveal. There are min(n, maxSteps) steps.
 *   mode 'draw': steps alternate draw (odd) and describe (even).
 *   mode 'text': every step is text; the previous phrase is shown for a few
 *                seconds (until showUntil), then rewritten from memory.
 * Drawings are submitted whole with submitDrawing (no live relay). Missing
 * entries at the deadline become '(they ran out of time)' or a blank drawing;
 * a missing starting phrase becomes a random suggestion.
 * Reveal: the host steps through the chains with nextReveal (auto after 90s).
 * There is no winner; everyone scores 0.
 */
const SHOW_SECONDS = 6;
const REVEAL_SECONDS = 90;
const PHRASE_MAX = 80;
const MAX_DRAWING_POINTS = 8000;
const TIMED_OUT = '(they ran out of time)';
const LEFT = '(they left the game)';

const kindOf = (state, step) => (step === 0 || state.mode === 'text' ? 'text' : step % 2 === 1 ? 'drawing' : 'text');
const chainIndexFor = (state, playerId, step = state.step) => (state.order.indexOf(playerId) + step) % state.order.length;
const myChain = (state, playerId) => state.chains[chainIndexFor(state, playerId)];
const everyoneIn = (state) => state.order.every((id) => state.submitted[id]);

function record(state, playerId, entry) {
  myChain(state, playerId).entries[state.step] = { ...entry, authorId: playerId };
  state.submitted[playerId] = true;
}

function placeholder(state, reason) {
  return kindOf(state, state.step) === 'drawing'
    ? { kind: 'drawing', strokes: [], missing: true }
    : { kind: 'text', text: reason, missing: true };
}

// Fill in anyone who has not submitted, then move on.
function closeStep(state, ctx) {
  for (const id of state.order) {
    if (state.submitted[id]) continue;
    if (state.step === 0) {
      const text = state.suggestions[id] ?? drawFrom(state, 's', SUGGESTIONS, ctx.rng);
      record(state, id, { kind: 'text', text, missing: true });
    } else {
      record(state, id, placeholder(state, TIMED_OUT));
    }
  }
  advance(state, ctx);
}

function advance(state, ctx) {
  if (state.step + 1 < state.totalSteps) return startStep(state, ctx, state.step + 1);
  state.phase = 'reveal';
  state.revealIndex = 0;
  state.showUntil = null;
  state.deadline = secondsFromNow(ctx, REVEAL_SECONDS);
}

function startStep(state, ctx, step) {
  state.step = step;
  state.submitted = {};
  state.phase = step === 0 ? 'writing' : 'step';
  const kind = kindOf(state, step);
  const textRecall = step > 0 && state.mode === 'text';
  state.showUntil = textRecall ? secondsFromNow(ctx, SHOW_SECONDS) : null;
  const seconds = kind === 'drawing' ? ctx.settings.drawSeconds : ctx.settings.writeSeconds + (textRecall ? SHOW_SECONDS : 0);
  state.deadline = secondsFromNow(ctx, seconds);
  // People who already left are filled in straight away.
  for (const id of state.left) record(state, id, step === 0 ? { kind: 'text', text: drawFrom(state, 's', SUGGESTIONS, ctx.rng), missing: true } : placeholder(state, LEFT));
  if (everyoneIn(state)) advance(state, ctx);
}

function chainForReveal(state, ctx, chain) {
  return {
    ownerId: chain.ownerId,
    ownerName: nameOf(ctx, chain.ownerId),
    entries: chain.entries.map((e) => ({ ...e, authorName: nameOf(ctx, e.authorId) })),
  };
}

function summarize(state, ctx) {
  const highlights = [];
  for (const chain of state.chains) {
    const texts = chain.entries.filter((e) => e.kind === 'text' && !e.missing);
    if (texts.length >= 2 && highlights.length < 3) highlights.push(`"${texts[0].text}" somehow became "${texts.at(-1).text}"`);
  }
  const notes = Object.fromEntries(state.chains.map((c) => [c.ownerId, c.entries[0] ? `Started: "${c.entries[0].text}"` : undefined]));
  return {
    headline: 'The message got delightfully lost along the way.',
    ranking: ranking(state.scores, notes),
    highlights,
  };
}

function finish(state, ctx) {
  state.phase = 'finished';
  state.deadline = null;
  state.finished = true;
  state.results = {
    ...summarize(state, ctx),
    reveal: { mode: state.mode, chains: state.chains.map((c) => chainForReveal(state, ctx, c)) },
  };
}

function requireWorking(state, ctx, kind) {
  requirePhase(state, 'writing', 'step');
  requireParticipant(state, ctx.playerId);
  if (state.deadline && ctx.now > state.deadline) fail('TOO_LATE', 'Time is up for this step.');
  if (kindOf(state, state.step) !== kind) {
    fail('WRONG_STEP', kind === 'text' ? 'This step needs a drawing, not words.' : 'This step needs words, not a drawing.');
  }
}

export default {
  meta: {
    id: 'telephone',
    order: 13,
    name: 'Telephone',
    tagline: 'Whisper, doodle, misunderstand. Repeat.',
    minPlayers: 4,
    maxPlayers: 12,
    duration: '10–15 min',
    vibe: 'Chaotic',
    howToPlay: [
      'Everyone writes a starting phrase, then passes it along.',
      'In draw mode you take turns drawing the phrase you get and describing the drawing you get.',
      'In text mode you see the last phrase for a few seconds, then rewrite it from memory.',
      'You only ever see the one entry before yours. At the end, watch every chain fall apart.',
      'Nobody wins. Everybody laughs.',
    ],
  },
  settings: [
    { key: 'mode', label: 'Mode', type: 'select', options: [{ value: 'draw', label: 'Draw & describe' }, { value: 'text', label: 'Text only (memory)' }], default: 'draw' },
    { key: 'maxSteps', label: 'Max steps per chain', type: 'number', min: 4, max: 12, default: 8 },
    { key: 'drawSeconds', label: 'Seconds to draw', type: 'number', min: 30, max: 120, step: 15, default: 60 },
    { key: 'writeSeconds', label: 'Seconds to write', type: 'number', min: 20, max: 90, step: 5, default: 40 },
  ],

  create(ctx) {
    const order = ctx.players.map((p) => p.id);
    const state = {
      order,
      scores: initScores(order),
      left: [],
      mode: ctx.settings.mode,
      totalSteps: Math.min(order.length, ctx.settings.maxSteps),
      chains: order.map((ownerId) => ({ ownerId, entries: [] })),
      suggestions: {},
      revealIndex: null,
    };
    startStep(state, ctx, 0);
    return state;
  },

  actions: {
    useSuggestion(state, ctx) {
      requireWorking(state, ctx, 'text');
      requirePhase(state, 'writing');
      if (state.submitted[ctx.playerId]) return;
      state.suggestions[ctx.playerId] = drawFrom(state, 's', SUGGESTIONS, ctx.rng);
    },

    submit(state, ctx) {
      requireWorking(state, ctx, 'text');
      if (state.submitted[ctx.playerId]) return; // already in; a second click changes nothing
      const text = cleanText(ctx.payload.text, PHRASE_MAX);
      if (!text) fail('INVALID_TEXT', 'Write something first (up to 80 characters).');
      record(state, ctx.playerId, { kind: 'text', text });
      if (everyoneIn(state)) advance(state, ctx);
    },

    submitDrawing(state, ctx) {
      requireWorking(state, ctx, 'drawing');
      if (state.submitted[ctx.playerId]) return;
      const strokes = validateDrawing(ctx.payload.strokes, { maxTotalPoints: MAX_DRAWING_POINTS });
      record(state, ctx.playerId, { kind: 'drawing', strokes });
      if (everyoneIn(state)) advance(state, ctx);
    },

    nextReveal(state, ctx) {
      requirePhase(state, 'reveal');
      if (ctx.playerId !== ctx.hostId) fail('HOST_ONLY', 'The host moves the reveal along.');
      if (state.revealIndex + 1 >= state.chains.length) return finish(state, ctx);
      state.revealIndex += 1;
      state.deadline = secondsFromNow(ctx, REVEAL_SECONDS);
    },
  },

  onTimeout(state, ctx) {
    if (state.phase === 'writing' || state.phase === 'step') closeStep(state, ctx);
    else if (state.phase === 'reveal') {
      if (state.revealIndex + 1 >= state.chains.length) finish(state, ctx);
      else {
        state.revealIndex += 1;
        state.deadline = secondsFromNow(ctx, REVEAL_SECONDS);
      }
    }
  },

  onPlayerLeft(state, ctx) {
    markLeft(state, ctx.playerId);
    if ((state.phase === 'writing' || state.phase === 'step') && !state.submitted[ctx.playerId]) {
      record(state, ctx.playerId, state.step === 0
        ? { kind: 'text', text: state.suggestions[ctx.playerId] ?? drawFrom(state, 's', SUGGESTIONS, ctx.rng), missing: true }
        : placeholder(state, LEFT));
      if (everyoneIn(state)) advance(state, ctx);
    }
  },

  summarize,

  /*
   * View fields:
   *   mode               'draw' | 'text'
   *   step, totalSteps   current step (0 = writing the starting phrase)
   *   kind               what you make this step: 'text' | 'drawing'
   *   prompt             the single previous entry of the chain you work on:
   *                      { kind: 'text', text } or { kind: 'drawing', strokes }; null at step 0.
   *                      In text mode the phrase is only included until showUntil.
   *   showUntil          text mode: ms epoch until which the phrase is shown; then show the input
   *   mySuggestion       step 0: the suggestion you asked for (prefill the input), or null
   *   submitted          whether you are done this step
   *   doneIds, waitingOn who has / has not submitted this step
   *   reveal             reveal phase only: { index, total, chain: { ownerId, ownerName, entries: [{ kind, text | strokes, authorId, authorName, missing? }] } }
   */
  view(state, playerId, ctx) {
    const working = (state.phase === 'writing' || state.phase === 'step') && state.order.includes(playerId);
    let prompt = null;
    if (working && state.step > 0) {
      const prev = myChain(state, playerId).entries[state.step - 1];
      const hidden = state.showUntil !== null && ctx.now >= state.showUntil;
      if (prev && !hidden) prompt = prev.kind === 'drawing' ? { kind: 'drawing', strokes: prev.strokes } : { kind: 'text', text: prev.text };
    }
    const inStep = state.phase === 'writing' || state.phase === 'step';
    return {
      mode: state.mode,
      step: state.step,
      totalSteps: state.totalSteps,
      kind: inStep ? kindOf(state, state.step) : null,
      prompt,
      showUntil: inStep ? state.showUntil : null,
      mySuggestion: state.phase === 'writing' ? state.suggestions[playerId] ?? null : null,
      submitted: Boolean(state.submitted[playerId]),
      doneIds: inStep ? state.order.filter((id) => state.submitted[id]) : [],
      waitingOn: inStep ? state.order.filter((id) => !state.submitted[id]) : [],
      reveal: state.phase === 'reveal'
        ? { index: state.revealIndex, total: state.chains.length, chain: chainForReveal(state, ctx, state.chains[state.revealIndex]) }
        : null,
    };
  },
};
