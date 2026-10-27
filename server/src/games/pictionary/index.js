import { fail, requirePhase } from '../baseGame.js';
import { activeOrder, addScore, drawFrom, headlineFor, initScores, markLeft, nameOf, ranking, requireChoice, requireParticipant, requireTurn, secondsFromNow } from '../shared/helpers.js';
import { cleanText, normalizeGuess } from '../../utils/text.js';
import { DIFFICULTY_OPTIONS, wordBank } from './content.js';
import { addSegment, clearDrawing, emptyDrawing, undoLast } from './strokes.js';

/*
 * Pictionary
 * Phases: choosing -> drawing -> roundEnd -> (next choosing | finished)
 * The drawer rotates; every player draws `rounds` times. The drawer secretly
 * picks one of three words (or gets a random one after 15s), then draws while
 * everyone else types guesses. A correct guess scores 5, 4, 3, 2, then 1 point
 * in order, and earns the drawer 2 points per guesser (max 10). Correct guesses
 * are announced, never shown as text; near misses get a private "so close!".
 * Halfway through, the hint reveals one letter. The turn ends when time runs
 * out or every connected guesser has got it.
 *
 * Strokes arrive on 'game:draw' as action 'stroke' and are relayed live
 * (draw:stroke / draw:clear / draw:undo) without a full state broadcast. The
 * whole drawing is also kept in state and sent in the view, so a player who
 * reconnects can replay it. Full broadcasts only happen on guesses and phase
 * changes, so resending the strokes then is an acceptable cost.
 */
const CHOOSE_SECONDS = 15;
const ROUND_END_SECONDS = 6;
const OPTION_COUNT = 3;
const MAX_DRAWING_POINTS = 30000;
const FEED_SIZE = 30;
const GUESS_MAX = 60;
const DRAWER_POINTS_PER_GUESS = 2;
const DRAWER_MAX_POINTS = 10;

// Classic Levenshtein distance; words are short so this is cheap.
function editDistance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    for (let j = 1; j <= b.length; j += 1) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length];
}

// Lowercase words separated by single spaces, for "does this sentence contain the answer?".
const tokens = (text) => ` ${cleanText(text, 80).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim()} `;

function hintFor(state) {
  return [...state.word].map((ch, i) => (ch === ' ' ? ' ' : i === state.hintIndex ? ch : '_')).join('');
}

function pushFeed(state, entry) {
  state.feedSeq += 1;
  state.feed.push({ id: state.feedSeq, ...entry });
  if (state.feed.length > FEED_SIZE) state.feed.splice(0, state.feed.length - FEED_SIZE);
}

function startTurn(state, ctx) {
  // Skip drawers who left or are offline right now; they lose that turn.
  let drawerId = null;
  while (state.queue.length && !drawerId) {
    const next = state.queue.shift();
    if (!state.left.includes(next) && ctx.connected.has(next)) drawerId = next;
  }
  if (!drawerId) return finish(state, ctx);
  state.turn += 1;
  state.drawerId = drawerId;
  state.options = Array.from({ length: OPTION_COUNT }, () => drawFrom(state, 'w', wordBank(ctx.settings.difficulty), ctx.rng));
  state.word = null;
  state.hintIndex = null;
  state.drawing = emptyDrawing();
  state.guessed = [];
  state.drawerPoints = 0;
  state.feed = [];
  state.notes = {};
  state.endsAt = null;
  state.phase = 'choosing';
  state.deadline = secondsFromNow(ctx, CHOOSE_SECONDS);
}

function startDrawing(state, ctx, word) {
  state.word = word;
  state.options = null;
  state.phase = 'drawing';
  state.startedAt = ctx.now;
  state.endsAt = secondsFromNow(ctx, ctx.settings.drawSeconds);
  // The first deadline is the halfway mark, when a hint letter is revealed.
  state.deadline = ctx.now + Math.round((ctx.settings.drawSeconds * 1000) / 2);
}

function revealHintLetter(state, ctx) {
  const letters = [...state.word].map((ch, i) => (ch === ' ' ? -1 : i)).filter((i) => i >= 0);
  state.hintIndex = letters[ctx.rng.int(letters.length)];
  state.deadline = state.endsAt;
}

function endTurn(state, ctx, reason) {
  state.lastRound = {
    word: state.word,
    drawerId: state.drawerId,
    guessers: state.guessed.map(({ playerId, points }) => ({ playerId, points })),
    drawerPoints: state.drawerPoints,
    reason, // 'allGuessed' | 'time' | 'drawerLeft'
  };
  state.history.push({ word: state.word, drawerId: state.drawerId, guessed: state.guessed });
  state.phase = 'roundEnd';
  state.deadline = secondsFromNow(ctx, ROUND_END_SECONDS);
}

// Everyone still here (and online) apart from the drawer has guessed.
function everyoneGuessed(state, ctx) {
  if (state.guessed.length === 0) return false;
  const done = new Set(state.guessed.map((g) => g.playerId));
  return activeOrder(state).every((id) => id === state.drawerId || done.has(id) || !ctx.connected.has(id));
}

function summarize(state, ctx) {
  const highlights = [];
  const fastest = state.history
    .flatMap((h) => h.guessed.map((g) => ({ ...g, word: h.word })))
    .sort((a, b) => a.ms - b.ms)[0];
  if (fastest) highlights.push(`Fastest guess: ${nameOf(ctx, fastest.playerId)} got "${fastest.word}" in ${Math.max(1, Math.round(fastest.ms / 1000))}s`);
  const missed = state.history.find((h) => h.word && h.guessed.length === 0);
  if (missed) highlights.push(`Nobody got "${missed.word}" (sorry, ${nameOf(ctx, missed.drawerId)})`);
  return { headline: headlineFor(ctx, state.scores, 'is the Picasso of the room'), ranking: ranking(state.scores), highlights };
}

function finish(state, ctx) {
  state.phase = 'finished';
  state.deadline = null;
  state.finished = true;
  state.results = summarize(state, ctx);
}

function requireDrawer(state, ctx) {
  requirePhase(state, 'drawing');
  requireParticipant(state, ctx.playerId);
  requireTurn(ctx.playerId, state.drawerId, 'Only the drawer can draw right now.');
}

export default {
  meta: {
    id: 'pictionary',
    order: 7,
    name: 'Pictionary',
    tagline: 'Draw it badly. Guess it fast.',
    minPlayers: 3,
    maxPlayers: 12,
    duration: '10–20 min',
    vibe: 'Creative',
    howToPlay: [
      'Take turns drawing a secret word you pick from three options.',
      'Everyone else types guesses; the faster you get it, the more points you score.',
      'The drawer scores for every correct guess, so draw clearly, not beautifully.',
      'No letters or numbers in the drawing. Halfway through, the hint shows one letter.',
    ],
  },
  settings: [
    { key: 'rounds', label: 'Turns each to draw', type: 'number', min: 1, max: 3, default: 1 },
    { key: 'drawSeconds', label: 'Seconds to draw', type: 'number', min: 45, max: 120, step: 15, default: 75 },
    { key: 'difficulty', label: 'Words', type: 'select', options: DIFFICULTY_OPTIONS, default: 'mix' },
  ],

  create(ctx) {
    const order = ctx.players.map((p) => p.id);
    const queue = [];
    for (let r = 0; r < ctx.settings.rounds; r += 1) queue.push(...order);
    const state = { order, scores: initScores(order), left: [], queue, turn: 0, totalTurns: queue.length, history: [], feedSeq: 0, lastRound: null };
    startTurn(state, ctx);
    return state;
  },

  actions: {
    choose(state, ctx) {
      requirePhase(state, 'choosing');
      requireParticipant(state, ctx.playerId);
      requireTurn(ctx.playerId, state.drawerId, 'The drawer is picking a word.');
      requireChoice(ctx.payload.index, state.options.map((_, i) => i));
      startDrawing(state, ctx, state.options[ctx.payload.index]);
    },

    guess(state, ctx) {
      requirePhase(state, 'drawing');
      requireParticipant(state, ctx.playerId);
      if (ctx.playerId === state.drawerId) fail('DRAWER_CANNOT_GUESS', 'You are drawing! No guessing your own word.');
      if (state.guessed.some((g) => g.playerId === ctx.playerId)) fail('ALREADY_GUESSED', 'You already got it. Sit back and enjoy the chaos.');
      const text = cleanText(ctx.payload.text, GUESS_MAX);
      if (!text) fail('INVALID_GUESS', 'Type a guess first.');
      const guess = normalizeGuess(text);
      const answer = normalizeGuess(state.word);

      if (guess === answer) {
        const points = Math.max(1, 5 - state.guessed.length);
        state.guessed.push({ playerId: ctx.playerId, points, ms: ctx.now - state.startedAt });
        addScore(state, ctx.playerId, points);
        const drawerBonus = Math.min(DRAWER_POINTS_PER_GUESS, DRAWER_MAX_POINTS - state.drawerPoints);
        if (drawerBonus > 0) {
          state.drawerPoints += drawerBonus;
          addScore(state, state.drawerId, drawerBonus);
        }
        delete state.notes[ctx.playerId];
        pushFeed(state, { kind: 'correct', playerId: ctx.playerId, text: `${nameOf(ctx, ctx.playerId)} guessed it!` });
        if (everyoneGuessed(state, ctx)) endTurn(state, ctx, 'allGuessed');
        return;
      }
      // Never echo anything that would give the word away to the room.
      if (answer.length > 4 && editDistance(guess, answer) === 1) {
        state.notes[ctx.playerId] = { text: 'So close!' };
        return;
      }
      if (tokens(text).includes(tokens(state.word))) {
        state.notes[ctx.playerId] = { text: 'Type just your answer, one guess at a time.' };
        return;
      }
      state.notes[ctx.playerId] = null;
      pushFeed(state, { kind: 'guess', playerId: ctx.playerId, text });
    },

    // Live drawing (sent on 'game:draw'). Only the new segment goes out.
    stroke(state, ctx) {
      requireDrawer(state, ctx);
      const stroke = addSegment(state.drawing, ctx.payload.stroke, MAX_DRAWING_POINTS);
      return { relay: { event: 'draw:stroke', data: { stroke } }, silent: true };
    },
    clear(state, ctx) {
      requireDrawer(state, ctx);
      clearDrawing(state.drawing);
      return { relay: { event: 'draw:clear', data: {} }, silent: true };
    },
    undo(state, ctx) {
      requireDrawer(state, ctx);
      const id = undoLast(state.drawing);
      if (!id) return { silent: true }; // nothing to undo
      return { relay: { event: 'draw:undo', data: { id } }, silent: true };
    },
  },

  onTimeout(state, ctx) {
    if (state.phase === 'choosing') {
      // An offline drawer loses the turn; otherwise pick a word for them.
      if (!ctx.connected.has(state.drawerId)) return startTurn(state, ctx);
      return startDrawing(state, ctx, state.options[ctx.rng.int(state.options.length)]);
    }
    if (state.phase === 'drawing') {
      if (state.hintIndex === null && ctx.now < state.endsAt) return revealHintLetter(state, ctx);
      return endTurn(state, ctx, 'time');
    }
    if (state.phase === 'roundEnd') startTurn(state, ctx);
  },

  onPlayerLeft(state, ctx) {
    markLeft(state, ctx.playerId);
    if (ctx.playerId === state.drawerId) {
      if (state.phase === 'choosing') startTurn(state, ctx);
      else if (state.phase === 'drawing') endTurn(state, ctx, 'drawerLeft');
    } else if (state.phase === 'drawing' && everyoneGuessed(state, ctx)) {
      endTurn(state, ctx, 'allGuessed');
    }
  },

  summarize,

  /*
   * View fields:
   *   turn, totalTurns       which drawing turn this is, out of how many
   *   drawerId, isDrawer     who draws now; true for the drawer
   *   options                drawer only, while choosing: three words to pick from (send choose {index})
   *   word                   drawer while drawing; everyone at roundEnd; otherwise null
   *   hint                   guessers while drawing: the word with letters as '_' (spaces kept), one letter shown after half time
   *   endsAt                 ms epoch when drawing ends (use this for the timer; `deadline` is the halfway mark first)
   *   strokes                the whole current drawing, for replay on (re)connect
   *   guessedIds             who has guessed correctly this turn, in order
   *   iGuessed               whether you already got it
   *   feed                   last 30 entries: { id, kind: 'guess' | 'correct', playerId, text }
   *   myNote                 private note for you only, e.g. { text: 'So close!' } (your own guess text is not echoed back)
   *   lastRound              at roundEnd: { word, drawerId, guessers: [{ playerId, points }], drawerPoints, reason }
   *   scores
   */
  view(state, playerId) {
    const isDrawer = playerId === state.drawerId;
    const showWord = state.phase === 'roundEnd' || (state.phase === 'drawing' && isDrawer);
    return {
      turn: state.turn,
      totalTurns: state.totalTurns,
      drawerId: state.drawerId,
      isDrawer,
      options: state.phase === 'choosing' && isDrawer ? state.options : null,
      word: showWord ? state.word : null,
      hint: state.phase === 'drawing' && !isDrawer ? hintFor(state) : null,
      endsAt: state.phase === 'drawing' ? state.endsAt : null,
      strokes: state.drawing.strokes,
      guessedIds: state.guessed.map((g) => g.playerId),
      iGuessed: state.guessed.some((g) => g.playerId === playerId),
      feed: state.feed,
      myNote: state.notes[playerId] ?? null,
      lastRound: state.phase === 'roundEnd' ? state.lastRound : null,
      scores: state.scores,
    };
  },
};
