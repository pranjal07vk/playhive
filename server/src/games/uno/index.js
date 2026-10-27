import { fail, requirePhase } from '../baseGame.js';
import { activeOrder, markLeft, nameOf, requireParticipant, requireTurn, secondsFromNow } from '../shared/helpers.js';
import { shuffle } from '../../utils/random.js';

/*
 * Colour Clash (an UNO-style shedding game)
 * Phases: playing -> finished
 *
 * The exact variant, fixed (no house-rule settings):
 * - Deck of 108. For each colour (red, yellow, green, blue): one 0, two each of
 *   1–9, Skip, Reverse and Draw Two. Plus 4 Wild and 4 Wild Draw Four.
 * - Everyone is dealt 7. The starter is flipped from the pile; anything that is
 *   not a number card goes back and the pile is reshuffled until it is.
 * - On your turn play a card matching the current colour or the top card's
 *   value/symbol, or any Wild. Wilds need a colour in the payload. Wild Draw Four
 *   may be played at any time: there is no challenge rule.
 * - Or draw 1 card. If it is playable you may play that card (only that card)
 *   or pass; if not, your turn ends automatically.
 * - Skip: the next player misses a turn. Reverse: direction flips; with 2
 *   players it works like a Skip. Draw Two / Wild Draw Four: the next player
 *   draws 2 / 4 and misses their turn. No stacking.
 * - When the draw pile is empty, the discard pile (except its top card) is
 *   shuffled into a new draw pile.
 * - Calling "uno": allowed when you hold 1 card, or hold 2 and it is your turn.
 *   If you go down to 1 card without having called, any opponent may catch you
 *   until the next move is made; you then draw 2. Once caught, it is too late.
 *   Drawing cards cancels an earlier call.
 * - The first to empty their hand wins at once (a final Draw Two is not dealt).
 *   The winner scores the card points left in everyone else's hand: number cards
 *   at face value, Skip/Reverse/Draw Two 20, Wild/Wild Draw Four 50. Everyone
 *   else scores 0 and is ranked by fewest card points left.
 * - Each turn has turnSeconds; on timeout the player draws 1 and passes.
 *   Disconnected players' turns are skipped (they still take draw penalties).
 */
export const COLORS = ['red', 'yellow', 'green', 'blue'];
const NUMBERS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
const ACTIONS = ['skip', 'reverse', 'draw2'];
const VALUE_ORDER = [...NUMBERS, ...ACTIONS, 'wild', 'wild4'];
const HAND_SIZE = 7;

const LABEL = { skip: 'Skip', reverse: 'Reverse', draw2: 'Draw Two', wild: 'Wild', wild4: 'Wild Draw Four' };
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const cardName = (card) => (card.color ? `${cap(card.color)} ${LABEL[card.value] ?? card.value}` : LABEL[card.value]);

export function buildDeck() {
  const deck = [];
  for (const color of COLORS) {
    deck.push({ id: `${color}-0`, color, value: '0' });
    for (const value of [...NUMBERS.slice(1), ...ACTIONS]) {
      for (const n of [1, 2]) deck.push({ id: `${color}-${value}-${n}`, color, value });
    }
  }
  for (let n = 1; n <= 4; n += 1) {
    deck.push({ id: `wild-${n}`, color: null, value: 'wild' });
    deck.push({ id: `wild4-${n}`, color: null, value: 'wild4' });
  }
  return deck;
}

export const isWild = (card) => card.value === 'wild' || card.value === 'wild4';
const isNumber = (card) => NUMBERS.includes(card.value);

export function cardPoints(card) {
  if (isNumber(card)) return Number(card.value);
  return isWild(card) ? 50 : 20;
}

const handPoints = (hand) => hand.reduce((sum, c) => sum + cardPoints(c), 0);
const topOf = (state) => state.discard[state.discard.length - 1];

function canPlay(state, card) {
  if (isWild(card)) return true;
  const top = topOf(state);
  return card.color === state.currentColor || card.value === top.value;
}

const currentId = (state) => state.order[state.turn];
const isConnected = (ctx, id) => !ctx.connected || ctx.connected.has(id);
const hasLeft = (state, id) => Boolean(state.left?.includes(id));

// Index of the next player still in the game, `steps` seats away.
function seatAfter(state, from, steps = 1) {
  const n = state.order.length;
  let index = from;
  for (let s = 0; s < steps; s += 1) {
    do index = (index + state.direction + n) % n;
    while (hasLeft(state, state.order[index]));
  }
  return index;
}

// Hand the turn to `index`, skipping anyone disconnected (if anyone is connected).
function giveTurn(state, ctx, index) {
  let next = index;
  for (let i = 0; i < state.order.length && !isConnected(ctx, state.order[next]); i += 1) next = seatAfter(state, next);
  if (!isConnected(ctx, state.order[next])) next = index;
  state.turn = next;
  state.pendingDraw = null;
  state.deadline = secondsFromNow(ctx, ctx.settings.turnSeconds);
}

function refill(state, ctx) {
  if (state.drawPile.length > 0 || state.discard.length <= 1) return;
  const top = state.discard.pop();
  state.drawPile = shuffle(state.discard, ctx.rng);
  state.discard = [top];
  state.reshuffles += 1;
}

// Draw up to `count` cards (fewer if every card is in someone's hand).
function drawCards(state, ctx, playerId, count) {
  const drawn = [];
  for (let i = 0; i < count; i += 1) {
    refill(state, ctx);
    if (state.drawPile.length === 0) break;
    const card = state.drawPile.pop();
    state.hands[playerId].push(card);
    drawn.push(card);
  }
  if (drawn.length > 0) state.unoCalled[playerId] = false;
  return drawn;
}

// A new move closes the window to catch whoever went down to one card before it.
function closeCatchWindow(state) {
  state.catchable = [];
}

function finish(state, ctx, winnerId) {
  state.winnerId = winnerId;
  state.phase = 'finished';
  state.deadline = null;
  state.pendingDraw = null;
  state.finished = true;
  state.results = summarize(state, ctx);
}

function summarize(state, ctx) {
  const winnerId = state.winnerId ?? null;
  const points = Object.fromEntries(state.order.map((id) => [id, handPoints(state.hands[id])]));
  const pot = state.order.filter((id) => id !== winnerId).reduce((sum, id) => sum + points[id], 0);
  // Winner first, then fewest card points left. Equal points share a rank.
  const sorted = [...state.order].sort((a, b) => (b === winnerId) - (a === winnerId) || points[a] - points[b]);
  let rank = 0;
  const rows = sorted.map((id, i) => {
    const prev = sorted[i - 1];
    if (i === 0 || id === winnerId || prev === winnerId || points[id] !== points[prev]) rank = i + 1;
    const count = state.hands[id].length;
    const note = id === winnerId ? 'Emptied their hand' : `${count} card${count === 1 ? '' : 's'} left (${points[id]} pts)${hasLeft(state, id) ? ', left' : ''}`;
    return { playerId: id, score: id === winnerId ? pot : 0, rank, note };
  });
  const highlights = [];
  if (state.catches > 0) highlights.push(`${state.catches} forgotten uno call${state.catches === 1 ? '' : 's'} caught.`);
  if (state.reshuffles > 0) highlights.push(`The draw pile ran dry ${state.reshuffles} time${state.reshuffles === 1 ? '' : 's'}.`);
  highlights.push(`${state.moves} moves played.`);
  return {
    headline: winnerId ? `${nameOf(ctx, winnerId)} clears their hand and wins ${pot} points!` : 'Game over before anyone went out.',
    ranking: rows,
    highlights,
  };
}

function startMove(state, ctx) {
  requirePhase(state, 'playing');
  requireParticipant(state, ctx.playerId);
  requireTurn(ctx.playerId, currentId(state));
}

function play(state, ctx, card) {
  const me = ctx.playerId;
  const hand = state.hands[me];
  hand.splice(hand.indexOf(card), 1);
  state.discard.push(card);
  if (isWild(card)) state.currentColor = ctx.payload.color;
  else state.currentColor = card.color;
  state.moves += 1;
  state.lastAction = `${nameOf(ctx, me)} played ${cardName(card)}${isWild(card) ? ` and chose ${ctx.payload.color}` : ''}.`;

  if (hand.length === 0) return finish(state, ctx, me);
  if (hand.length === 1 && !state.unoCalled[me]) state.catchable = [me];

  const here = state.turn;
  const twoPlayers = activeOrder(state).length === 2;
  if (card.value === 'skip' || (card.value === 'reverse' && twoPlayers)) {
    if (card.value === 'reverse') state.direction *= -1;
    const skipped = state.order[seatAfter(state, here)];
    state.lastAction += ` ${nameOf(ctx, skipped)} is skipped.`;
    return giveTurn(state, ctx, seatAfter(state, here, 2));
  }
  if (card.value === 'reverse') {
    state.direction *= -1;
    return giveTurn(state, ctx, seatAfter(state, here));
  }
  if (card.value === 'draw2' || card.value === 'wild4') {
    const victimSeat = seatAfter(state, here);
    const victim = state.order[victimSeat];
    const n = card.value === 'draw2' ? 2 : 4;
    drawCards(state, ctx, victim, n);
    state.lastAction += ` ${nameOf(ctx, victim)} draws ${n} and is skipped.`;
    return giveTurn(state, ctx, seatAfter(state, victimSeat));
  }
  return giveTurn(state, ctx, seatAfter(state, here));
}

function drawAndMaybeEnd(state, ctx, { autoPass = false } = {}) {
  const me = currentId(state);
  const [card] = drawCards(state, ctx, me, 1);
  state.moves += 1;
  state.lastAction = `${nameOf(ctx, me)} drew a card${autoPass ? ' and ran out of time' : ''}.`;
  if (card && !autoPass && canPlay(state, card)) {
    state.pendingDraw = { playerId: me, cardId: card.id };
    return;
  }
  giveTurn(state, ctx, seatAfter(state, state.turn));
}

export default {
  meta: {
    id: 'uno',
    order: 12,
    name: 'Colour Clash',
    tagline: 'The UNO-style shedding game: match, skip, reverse, and don\'t forget to call it.',
    minPlayers: 2,
    maxPlayers: 10,
    duration: '10–20 min',
    vibe: 'Chaos',
    howToPlay: [
      'Everyone starts with 7 cards. On your turn, play a card that matches the colour or the symbol, or play a Wild.',
      'Can\'t play? Draw one. If it fits, you may play it right away.',
      'Skip, Reverse, Draw Two and Wild Draw Four mess with the next player.',
      'Down to your last card? Tap "Uno!" first, or anyone can catch you and make you draw 2.',
      'Empty your hand first to win the points left in everyone else\'s hands.',
    ],
  },
  settings: [{ key: 'turnSeconds', label: 'Seconds per turn', type: 'number', min: 15, max: 60, step: 5, default: 30 }],

  create(ctx) {
    const order = ctx.players.map((p) => p.id);
    let drawPile = shuffle(buildDeck(), ctx.rng);
    const hands = Object.fromEntries(order.map((id) => [id, []]));
    for (let i = 0; i < HAND_SIZE; i += 1) for (const id of order) hands[id].push(drawPile.pop());
    // Flip a starter; non-number cards go back and the pile is reshuffled.
    while (!isNumber(drawPile[drawPile.length - 1])) drawPile = shuffle(drawPile, ctx.rng);
    const starter = drawPile.pop();
    const state = {
      phase: 'playing',
      order,
      hands,
      drawPile,
      discard: [starter],
      currentColor: starter.color,
      direction: 1,
      turn: 0,
      pendingDraw: null,
      unoCalled: Object.fromEntries(order.map((id) => [id, false])),
      catchable: [],
      lastAction: `${cardName(starter)} starts the pile.`,
      moves: 0,
      catches: 0,
      reshuffles: 0,
    };
    giveTurn(state, ctx, 0);
    return state;
  },

  actions: {
    play(state, ctx) {
      startMove(state, ctx);
      const cardId = ctx.payload?.cardId;
      if (typeof cardId !== 'string') fail('INVALID_CARD', 'Pick a card to play.');
      const card = state.hands[ctx.playerId].find((c) => c.id === cardId);
      if (!card) fail('INVALID_CARD', 'You do not have that card.');
      if (state.pendingDraw && state.pendingDraw.cardId !== cardId) fail('INVALID_CARD', 'You can only play the card you just drew, or pass.');
      if (!canPlay(state, card)) fail('INVALID_CARD', 'That card does not match the colour or symbol.');
      if (isWild(card) && !COLORS.includes(ctx.payload.color)) fail('COLOR_REQUIRED', 'Pick a colour for your Wild.');
      closeCatchWindow(state);
      play(state, ctx, card);
    },
    draw(state, ctx) {
      startMove(state, ctx);
      if (state.pendingDraw) fail('ALREADY_DREW', 'You already drew. Play that card or pass.');
      closeCatchWindow(state);
      drawAndMaybeEnd(state, ctx);
    },
    pass(state, ctx) {
      startMove(state, ctx);
      if (!state.pendingDraw) fail('CANNOT_PASS', 'Play a card or draw first.');
      state.lastAction = `${nameOf(ctx, ctx.playerId)} kept the card and passed.`;
      giveTurn(state, ctx, seatAfter(state, state.turn));
    },
    callUno(state, ctx) {
      requirePhase(state, 'playing');
      requireParticipant(state, ctx.playerId);
      const me = ctx.playerId;
      const size = state.hands[me].length;
      if (state.unoCalled[me]) return; // already called
      if (!(size === 1 || (size === 2 && currentId(state) === me))) {
        fail('CANNOT_CALL', 'Call uno when you are down to your last card, or on your turn with two.');
      }
      state.unoCalled[me] = true;
      state.catchable = state.catchable.filter((id) => id !== me);
      state.lastAction = `${nameOf(ctx, me)} calls uno!`;
    },
    catch(state, ctx) {
      requirePhase(state, 'playing');
      requireParticipant(state, ctx.playerId);
      const target = ctx.payload?.targetId;
      if (target === ctx.playerId) fail('INVALID_TARGET', 'You cannot catch yourself.');
      if (!state.catchable.includes(target)) fail('NOT_CATCHABLE', 'Too late, or they already called it.');
      state.catchable = state.catchable.filter((id) => id !== target);
      drawCards(state, ctx, target, 2);
      state.catches += 1;
      state.lastAction = `${nameOf(ctx, ctx.playerId)} caught ${nameOf(ctx, target)} without an uno call. +2 cards!`;
    },
  },

  onTimeout(state, ctx) {
    if (state.phase !== 'playing') return;
    closeCatchWindow(state);
    if (state.pendingDraw) {
      state.lastAction = `${nameOf(ctx, currentId(state))} ran out of time and passed.`;
      return giveTurn(state, ctx, seatAfter(state, state.turn));
    }
    drawAndMaybeEnd(state, ctx, { autoPass: true });
  },

  onPlayerLeft(state, ctx) {
    const id = ctx.playerId;
    const wasTurn = currentId(state) === id;
    markLeft(state, id);
    // Their cards go back under the draw pile.
    state.drawPile = [...shuffle(state.hands[id], ctx.rng), ...state.drawPile];
    state.hands[id] = [];
    state.catchable = state.catchable.filter((p) => p !== id);
    if (wasTurn) giveTurn(state, ctx, seatAfter(state, state.turn));
  },

  summarize,

  /*
   * view fields:
   *   myHand            sorted [{ id, color (null for wilds), value ('0'–'9'|'skip'|'reverse'|'draw2'|'wild'|'wild4'), playable }]
   *   myTurn            true when it is your move
   *   pendingDraw       true when you just drew a playable card: play it (cardId pendingCardId) or 'pass'
   *   pendingCardId     the drawn card's id while pendingDraw, else null
   *   canCallUno        true when the 'callUno' button should be shown
   *   topCard           { id, color, value } on the discard pile
   *   currentColor      the colour to match (a wild's chosen colour)
   *   currentPlayerId, direction (1 = clockwise in seat order, -1 = reversed)
   *   players           [{ id, cardCount, calledUno, left }] in seat order
   *   drawPileCount, discardCount
   *   catchableIds      players anyone else can 'catch' right now
   *   lastAction        one line for the feed
   */
  view(state, playerId) {
    const mine = state.hands[playerId] ?? [];
    const myTurn = state.phase === 'playing' && currentId(state) === playerId;
    const pending = myTurn && state.pendingDraw?.playerId === playerId ? state.pendingDraw.cardId : null;
    const sortKey = (c) => (c.color ? COLORS.indexOf(c.color) : COLORS.length) * 100 + VALUE_ORDER.indexOf(c.value);
    const myHand = [...mine]
      .sort((a, b) => sortKey(a) - sortKey(b) || a.id.localeCompare(b.id))
      .map((c) => ({ id: c.id, color: c.color, value: c.value, playable: myTurn && (pending ? c.id === pending : canPlay(state, c)) }));
    const top = topOf(state);
    return {
      myHand,
      myTurn,
      pendingDraw: Boolean(pending),
      pendingCardId: pending,
      canCallUno: state.phase === 'playing' && !state.unoCalled[playerId] && (mine.length === 1 || (mine.length === 2 && myTurn)),
      topCard: { id: top.id, color: top.color, value: top.value },
      currentColor: state.currentColor,
      currentPlayerId: currentId(state),
      direction: state.direction,
      players: state.order.map((id) => ({ id, cardCount: state.hands[id].length, calledUno: Boolean(state.unoCalled[id]), left: hasLeft(state, id) })),
      drawPileCount: state.drawPile.length,
      discardCount: state.discard.length,
      catchableIds: [...state.catchable],
      lastAction: state.lastAction,
    };
  },
};
