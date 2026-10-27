import { test } from 'node:test';
import assert from 'node:assert/strict';
import game, { buildDeck, cardPoints } from '../../src/games/uno/index.js';
import { validateSettings } from '../../src/games/baseGame.js';
import { seededRng } from '../../src/utils/random.js';
import { AppError } from '../../src/utils/errors.js';

const NOW = 1_000_000;

function setup(count = 4, seed = 42, raw = {}) {
  const players = Array.from({ length: count }, (_, i) => ({ id: `p${i + 1}`, name: `Player ${i + 1}` }));
  const ctx = {
    players,
    connected: new Set(players.map((p) => p.id)),
    hostId: 'p1',
    settings: validateSettings(game.settings, raw),
    rng: seededRng(seed),
    now: NOW,
  };
  const state = game.create(ctx);
  const act = (playerId, type, payload = {}) => game.actions[type](state, { ...ctx, playerId, payload });
  const view = (id) => game.view(state, id, ctx);
  const current = () => state.order[state.turn];
  return { ctx, state, act, view, current };
}

const throwsApp = (fn, code) => assert.throws(fn, (err) => err instanceof AppError && (!code || err.code === code));
const totalCards = (state) => state.drawPile.length + state.discard.length + Object.values(state.hands).reduce((s, h) => s + h.length, 0);

// Puts a known top card and hands in place, moving the replaced cards into the draw pile.
function rig(state, { top, color, hands, turn = 0 }) {
  const used = new Set([top, ...Object.values(hands).flat()].map((c) => c.id));
  const rest = [...state.drawPile, ...state.discard, ...Object.values(state.hands).flat()].filter((c) => !used.has(c.id));
  state.discard = [top];
  state.currentColor = color ?? top.color;
  for (const id of state.order) state.hands[id] = hands[id] ?? [];
  state.drawPile = rest;
  state.turn = turn;
  state.pendingDraw = null;
  state.catchable = [];
}
// Real deck cards by id, so the 108-card total stays intact.
const deckCard = (id) => buildDeck().find((c) => c.id === id);

test('deck has 108 unique cards with the right make-up', () => {
  const deck = buildDeck();
  assert.equal(deck.length, 108);
  assert.equal(new Set(deck.map((c) => c.id)).size, 108);
  assert.equal(deck.filter((c) => c.value === 'wild').length, 4);
  assert.equal(deck.filter((c) => c.value === 'wild4').length, 4);
  for (const color of ['red', 'yellow', 'green', 'blue']) {
    const mine = deck.filter((c) => c.color === color);
    assert.equal(mine.length, 25);
    assert.equal(mine.filter((c) => c.value === '0').length, 1);
    assert.equal(mine.filter((c) => c.value === '7').length, 2);
    assert.equal(mine.filter((c) => c.value === 'draw2').length, 2);
  }
  assert.equal(cardPoints({ value: '7' }), 7);
  assert.equal(cardPoints({ value: 'skip' }), 20);
  assert.equal(cardPoints({ value: 'wild4' }), 50);
});

test('create deals 7 each and starts on a number card', () => {
  for (let seed = 1; seed < 30; seed += 1) {
    const { state } = setup(4, seed);
    assert.ok(Object.values(state.hands).every((h) => h.length === 7));
    assert.match(state.discard[0].value, /^[0-9]$/);
    assert.equal(state.currentColor, state.discard[0].color);
    assert.equal(totalCards(state), 108);
  }
});

function botGame(count, seed) {
  const { state, act, view, current } = setup(count, seed);
  let steps = 0;
  while (!state.finished && steps < 5000) {
    steps += 1;
    const me = current();
    const v = view(me);
    if (v.canCallUno) act(me, 'callUno');
    const playable = v.myHand.find((c) => c.playable);
    if (playable) {
      act(me, 'play', { cardId: playable.id, color: playable.color ? undefined : 'blue' });
    } else if (v.pendingDraw) {
      act(me, 'pass');
    } else {
      act(me, 'draw');
    }
    if (!state.finished) assert.equal(totalCards(state), 108);
  }
  return { state, steps };
}

test('a seeded bot game plays to completion with correct scoring', () => {
  for (const [count, seed] of [[2, 1], [3, 7], [4, 42], [6, 99], [10, 5]]) {
    const { state, steps } = botGame(count, seed);
    assert.equal(state.finished, true, `game with ${count} players did not finish in ${steps} steps`);
    const winner = state.winnerId;
    assert.equal(state.hands[winner].length, 0);
    const expected = state.order.filter((id) => id !== winner).flatMap((id) => state.hands[id]).reduce((s, c) => s + cardPoints(c), 0);
    const [first, ...rest] = state.results.ranking;
    assert.equal(first.playerId, winner);
    assert.equal(first.score, expected);
    assert.equal(first.rank, 1);
    assert.ok(rest.every((r) => r.score === 0 && r.rank > 1));
    assert.equal(state.results.ranking.length, count);
    assert.match(state.results.headline, /wins/);
  }
});

test('playing a matching number card passes the turn and sets the colour', () => {
  const { state, act, ctx } = setup(3);
  rig(state, {
    top: deckCard('red-5-1'),
    hands: { p1: [deckCard('blue-5-1'), deckCard('green-2-1')], p2: [deckCard('red-1-1'), deckCard('red-2-1')], p3: [deckCard('red-3-1'), deckCard('red-4-1')] },
  });
  throwsApp(() => act('p1', 'play', { cardId: 'green-2-1' }), 'INVALID_CARD');
  act('p1', 'play', { cardId: 'blue-5-1' });
  assert.equal(state.currentColor, 'blue');
  assert.equal(state.order[state.turn], 'p2');
  assert.equal(state.deadline, NOW + ctx.settings.turnSeconds * 1000);
});

test('skip, reverse, draw two and wild draw four effects', () => {
  const { state, act } = setup(4);
  const filler = (n) => Array.from({ length: n }, (_, i) => deckCard(`yellow-${i + 1}-2`));
  rig(state, {
    top: deckCard('red-5-1'),
    hands: {
      p1: [deckCard('red-skip-1'), deckCard('green-3-1'), deckCard('green-4-1')],
      p2: filler(3),
      p3: [deckCard('red-reverse-1'), deckCard('blue-draw2-1'), deckCard('green-5-1')],
      p4: filler(3).map((c, i) => deckCard(`blue-${i + 1}-2`)),
    },
  });
  // Skip: p1 -> p3 (p2 skipped)
  act('p1', 'play', { cardId: 'red-skip-1' });
  assert.equal(state.order[state.turn], 'p3');
  assert.match(state.lastAction, /Player 2 is skipped/);
  // Reverse: direction flips, p3 -> p2
  act('p3', 'play', { cardId: 'red-reverse-1' });
  assert.equal(state.direction, -1);
  assert.equal(state.order[state.turn], 'p2');

  // Draw two from p3 (direction -1): next is p2, who draws 2 and is skipped -> p1
  rig(state, {
    top: deckCard('blue-5-1'),
    hands: { p1: [deckCard('wild4-1'), deckCard('green-3-1'), deckCard('green-4-1')], p2: filler(3), p3: [deckCard('blue-draw2-1'), deckCard('green-5-1')], p4: [deckCard('blue-1-2'), deckCard('blue-2-2')] },
    turn: 2,
  });
  state.direction = -1;
  act('p3', 'play', { cardId: 'blue-draw2-1' });
  assert.equal(state.hands.p2.length, 5);
  assert.equal(state.order[state.turn], 'p1');

  // Wild Draw Four needs a colour; then p4 draws 4 and p3 is next.
  throwsApp(() => act('p1', 'play', { cardId: 'wild4-1' }), 'COLOR_REQUIRED');
  throwsApp(() => act('p1', 'play', { cardId: 'wild4-1', color: 'purple' }), 'COLOR_REQUIRED');
  assert.equal(state.hands.p1.length, 3); // rejected moves change nothing
  act('p1', 'play', { cardId: 'wild4-1', color: 'green' });
  assert.equal(state.currentColor, 'green');
  assert.equal(state.hands.p4.length, 6);
  assert.equal(state.order[state.turn], 'p3');
  assert.equal(totalCards(state), 108);
});

test('a wild is playable on anything and sets the chosen colour', () => {
  const { state, act, view } = setup(3);
  rig(state, { top: deckCard('red-5-1'), hands: { p1: [deckCard('wild-1'), deckCard('blue-2-1')], p2: [deckCard('green-7-1'), deckCard('yellow-1-1')], p3: [deckCard('green-8-1')] } });
  act('p1', 'play', { cardId: 'wild-1', color: 'green' });
  assert.equal(state.currentColor, 'green');
  const v = view('p2');
  assert.deepEqual(v.myHand.map((c) => [c.id, c.playable]), [['yellow-1-1', false], ['green-7-1', true]]);
  assert.equal(v.topCard.value, 'wild');
});

test('two players: reverse acts as a skip', () => {
  const { state, act } = setup(2);
  rig(state, { top: deckCard('red-5-1'), hands: { p1: [deckCard('red-reverse-1'), deckCard('red-1-1'), deckCard('blue-1-1')], p2: [deckCard('green-1-1'), deckCard('green-2-1')] } });
  act('p1', 'play', { cardId: 'red-reverse-1' });
  assert.equal(state.order[state.turn], 'p1');
  act('p1', 'play', { cardId: 'red-1-1' });
  assert.equal(state.order[state.turn], 'p2');
});

test('out-of-turn play, cards you do not hold, and bad payloads are rejected', () => {
  const { state, act, current } = setup(3);
  const me = current();
  const other = state.order.find((id) => id !== me);
  const theirCard = state.hands[other][0];
  throwsApp(() => act(other, 'play', { cardId: theirCard.id, color: 'red' }), 'NOT_YOUR_TURN');
  throwsApp(() => act(other, 'draw'), 'NOT_YOUR_TURN');
  throwsApp(() => act(me, 'play', { cardId: theirCard.id, color: 'red' }), 'INVALID_CARD');
  throwsApp(() => act(me, 'play', { cardId: 'made-up', color: 'red' }), 'INVALID_CARD');
  throwsApp(() => act(me, 'play', { cardId: 7 }), 'INVALID_CARD');
  throwsApp(() => act(me, 'play', {}), 'INVALID_CARD');
  throwsApp(() => act(me, 'pass'), 'CANNOT_PASS');
  throwsApp(() => act('stranger', 'draw'), 'NOT_IN_GAME');
  assert.equal(totalCards(state), 108);
});

test('drawing: a playable draw can be played or passed; an unplayable one ends the turn', () => {
  const { state, act, view } = setup(3);
  rig(state, { top: deckCard('red-5-1'), hands: { p1: [deckCard('blue-1-1')], p2: [deckCard('blue-2-1'), deckCard('blue-3-1')], p3: [deckCard('blue-4-1')] } });
  // Make the next draw a playable red 9, with an unplayable green 1 below it.
  const red9 = state.drawPile.find((c) => c.id === 'red-9-1');
  const green1 = state.drawPile.find((c) => c.id === 'green-1-1');
  state.drawPile = [...state.drawPile.filter((c) => c !== red9 && c !== green1), green1, red9];
  act('p1', 'draw');
  assert.equal(state.order[state.turn], 'p1');
  const v = view('p1');
  assert.equal(v.pendingDraw, true);
  assert.equal(v.pendingCardId, 'red-9-1');
  assert.deepEqual(v.myHand.filter((c) => c.playable).map((c) => c.id), ['red-9-1']);
  throwsApp(() => act('p1', 'draw'), 'ALREADY_DREW');
  act('p1', 'pass');
  assert.equal(state.order[state.turn], 'p2');
  assert.equal(state.pendingDraw, null);

  // p2 draws the green 1: unplayable on red, turn moves on automatically.
  act('p2', 'draw');
  assert.equal(state.hands.p2.length, 3);
  assert.equal(state.order[state.turn], 'p3');
});

test('after drawing, only the drawn card may be played', () => {
  const { state, act } = setup(3);
  rig(state, { top: deckCard('red-5-1'), hands: { p1: [deckCard('blue-1-1'), deckCard('wild-1')], p2: [deckCard('blue-2-1')], p3: [deckCard('blue-4-1')] } });
  const red9 = state.drawPile.find((c) => c.id === 'red-9-1');
  state.drawPile = [...state.drawPile.filter((c) => c !== red9), red9];
  act('p1', 'draw');
  throwsApp(() => act('p1', 'play', { cardId: 'wild-1', color: 'red' }), 'INVALID_CARD');
  act('p1', 'play', { cardId: 'red-9-1' });
  assert.equal(state.order[state.turn], 'p2');
});

test('timeout: the current player draws one and passes; a pending draw is passed', () => {
  const { state, ctx, act } = setup(3);
  rig(state, { top: deckCard('red-5-1'), hands: { p1: [deckCard('red-1-1')], p2: [deckCard('blue-2-1'), deckCard('blue-3-1')], p3: [deckCard('blue-4-1')] } });
  game.onTimeout(state, ctx);
  assert.equal(state.hands.p1.length, 2);
  assert.equal(state.order[state.turn], 'p2');
  // pending draw then timeout
  const red9 = state.drawPile.find((c) => c.id === 'red-9-1');
  state.drawPile = [...state.drawPile.filter((c) => c !== red9), red9];
  act('p2', 'draw');
  assert.ok(state.pendingDraw);
  game.onTimeout(state, ctx);
  assert.equal(state.order[state.turn], 'p3');
  assert.equal(state.hands.p2.length, 3);
});

test('disconnected players are skipped when the turn passes to them', () => {
  const { state, ctx, act } = setup(3);
  rig(state, { top: deckCard('red-5-1'), hands: { p1: [deckCard('red-1-1'), deckCard('red-2-1')], p2: [deckCard('blue-2-1')], p3: [deckCard('blue-4-1')] } });
  ctx.connected.delete('p2');
  act('p1', 'play', { cardId: 'red-1-1' });
  assert.equal(state.order[state.turn], 'p3');
});

test('uno: calling on your turn with two cards keeps you safe', () => {
  const { state, act, view } = setup(3);
  rig(state, { top: deckCard('red-5-1'), hands: { p1: [deckCard('red-1-1'), deckCard('red-2-1')], p2: [deckCard('blue-2-1'), deckCard('blue-3-1')], p3: [deckCard('blue-4-1'), deckCard('blue-5-1')] } });
  throwsApp(() => act('p2', 'callUno'), 'CANNOT_CALL'); // two cards, not their turn
  assert.equal(view('p1').canCallUno, true);
  act('p1', 'callUno');
  act('p1', 'callUno'); // repeat is a no-op
  act('p1', 'play', { cardId: 'red-1-1' });
  assert.deepEqual(state.catchable, []);
  throwsApp(() => act('p2', 'catch', { targetId: 'p1' }), 'NOT_CATCHABLE');
  assert.equal(view('p3').players.find((p) => p.id === 'p1').calledUno, true);
});

test('uno: forgetting to call can be caught for +2, until the next move', () => {
  const { state, act, view } = setup(3);
  rig(state, { top: deckCard('red-5-1'), hands: { p1: [deckCard('red-1-1'), deckCard('red-2-1')], p2: [deckCard('blue-2-1'), deckCard('red-3-1')], p3: [deckCard('blue-4-1'), deckCard('blue-5-1')] } });
  act('p1', 'play', { cardId: 'red-1-1' });
  assert.deepEqual(view('p3').catchableIds, ['p1']);
  throwsApp(() => act('p1', 'catch', { targetId: 'p1' }), 'INVALID_TARGET');
  act('p3', 'catch', { targetId: 'p1' });
  assert.equal(state.hands.p1.length, 3);
  assert.deepEqual(state.catchable, []);
  throwsApp(() => act('p2', 'catch', { targetId: 'p1' }), 'NOT_CATCHABLE'); // only once
  throwsApp(() => act('p1', 'callUno'), 'CANNOT_CALL'); // too late now
  assert.equal(totalCards(state), 108);

  // Second scenario: the window closes once the next player moves.
  rig(state, { top: deckCard('red-5-1'), hands: { p1: [deckCard('red-1-1'), deckCard('red-2-1')], p2: [deckCard('blue-2-1'), deckCard('red-3-1')], p3: [deckCard('blue-4-1'), deckCard('blue-5-1')] } });
  act('p1', 'play', { cardId: 'red-1-1' });
  act('p2', 'play', { cardId: 'red-3-1' });
  throwsApp(() => act('p3', 'catch', { targetId: 'p1' }), 'NOT_CATCHABLE');

  // Third: calling with one card before anyone catches you is fine.
  rig(state, { top: deckCard('red-5-1'), hands: { p1: [deckCard('red-1-1'), deckCard('red-2-1')], p2: [deckCard('blue-2-1'), deckCard('red-3-1')], p3: [deckCard('blue-4-1'), deckCard('blue-5-1')] } });
  state.unoCalled.p1 = false;
  act('p1', 'play', { cardId: 'red-1-1' });
  assert.equal(view('p1').canCallUno, true);
  act('p1', 'callUno');
  throwsApp(() => act('p3', 'catch', { targetId: 'p1' }), 'NOT_CATCHABLE');
});

test('the draw pile is rebuilt from the discard pile (minus the top card) when it runs out', () => {
  const { state, act } = setup(3);
  rig(state, { top: deckCard('red-5-1'), hands: { p1: [deckCard('blue-1-1')], p2: [deckCard('blue-2-1')], p3: [deckCard('blue-4-1')] } });
  // Move the whole draw pile under the top discard card.
  const top = state.discard[0];
  state.discard = [...state.drawPile, top];
  state.drawPile = [];
  const before = state.discard.length;
  act('p1', 'draw');
  assert.equal(state.reshuffles, 1);
  assert.deepEqual(state.discard, [top]);
  assert.equal(state.drawPile.length, before - 1 - 1);
  assert.equal(totalCards(state), 108);
});

test('drawing with no cards anywhere does not crash', () => {
  const { state, act } = setup(2);
  rig(state, { top: deckCard('red-5-1'), hands: { p1: [deckCard('blue-1-1')], p2: [deckCard('blue-2-1')] } });
  // Park every remaining card in p2's hand.
  state.hands.p2 = [...state.hands.p2, ...state.drawPile];
  state.drawPile = [];
  act('p1', 'draw');
  assert.equal(state.hands.p1.length, 1);
  assert.equal(state.order[state.turn], 'p2');
});

test('a player leaving: their cards return to the pile and their turn moves on', () => {
  const { state, ctx, current } = setup(4);
  const me = current();
  game.onPlayerLeft(state, { ...ctx, playerId: me });
  assert.notEqual(current(), me);
  assert.equal(state.hands[me].length, 0);
  assert.equal(totalCards(state), 108);
  // Turns keep skipping the departed player.
  for (let i = 0; i < 8; i += 1) {
    game.onTimeout(state, ctx);
    assert.notEqual(current(), me);
  }
  // Down to 2 active players, reverse is a skip.
  game.onPlayerLeft(state, { ...ctx, playerId: state.order.find((id) => id !== me && id !== current()) });
  const a = current();
  const b = state.order.find((id) => !state.left.includes(id) && id !== a);
  rig(state, { top: deckCard('red-5-1'), hands: { [a]: [deckCard('red-reverse-1'), deckCard('red-0')], [b]: [deckCard('blue-1-1')] }, turn: state.order.indexOf(a) });
  game.actions.play(state, { ...ctx, playerId: a, payload: { cardId: 'red-reverse-1' } });
  assert.equal(current(), a);
});

test('summarize mid-game ranks by fewest card points', () => {
  const { state, ctx } = setup(3);
  rig(state, { top: deckCard('red-5-1'), hands: { p1: [deckCard('wild-1')], p2: [deckCard('blue-2-1')], p3: [deckCard('blue-skip-1')] } });
  const s = game.summarize(state, ctx);
  assert.deepEqual(s.ranking.map((r) => [r.playerId, r.rank, r.score]), [['p2', 1, 0], ['p3', 2, 0], ['p1', 3, 0]]);
  assert.match(s.ranking[0].note, /1 card left \(2 pts\)/);
});

test('privacy: views never contain other hands or the draw pile', () => {
  const { state, view } = setup(4);
  for (const id of state.order) {
    const v = view(id);
    const json = JSON.stringify(v);
    assert.deepEqual(v.myHand.map((c) => c.id).sort(), state.hands[id].map((c) => c.id).sort());
    for (const other of state.order.filter((o) => o !== id)) {
      for (const c of state.hands[other]) assert.ok(!json.includes(`"${c.id}"`), `${other}'s ${c.id} leaked to ${id}`);
      assert.equal(v.players.find((p) => p.id === other).cardCount, 7);
    }
    for (const c of state.drawPile) assert.ok(!json.includes(`"${c.id}"`));
    assert.equal(v.drawPileCount, state.drawPile.length);
    assert.ok(!('hands' in v) && !('drawPile' in v));
  }
  // Spectators see no hand.
  assert.deepEqual(view('stranger').myHand, []);
});

test('view: playable flags only on your turn, hand sorted by colour then value', () => {
  const { state, view } = setup(3);
  rig(state, { top: deckCard('red-5-1'), hands: { p1: [deckCard('wild4-1'), deckCard('blue-5-1'), deckCard('red-9-1'), deckCard('red-1-1'), deckCard('green-2-1')], p2: [deckCard('red-2-1')] } });
  const v = view('p1');
  assert.deepEqual(v.myHand.map((c) => c.id), ['red-1-1', 'red-9-1', 'green-2-1', 'blue-5-1', 'wild4-1']);
  assert.deepEqual(v.myHand.map((c) => c.playable), [true, true, false, true, true]);
  assert.equal(view('p2').myHand[0].playable, false);
  assert.equal(v.currentPlayerId, 'p1');
  assert.equal(v.direction, 1);
});
