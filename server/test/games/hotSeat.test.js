import { test } from 'node:test';
import assert from 'node:assert/strict';
import game from '../../src/games/hotSeat/index.js';
import { validateSettings } from '../../src/games/baseGame.js';
import { seededRng } from '../../src/utils/random.js';
import { AppError } from '../../src/utils/errors.js';

const players = ['Asha', 'Bilal', 'Chitra', 'Dev'].map((name, i) => ({ id: `p${i + 1}`, name }));

function setup(settings = {}) {
  const ctx = {
    players,
    connected: new Set(players.map((p) => p.id)),
    hostId: 'p1',
    settings: validateSettings(game.settings, settings),
    rng: seededRng(11),
    now: 1_000_000,
  };
  const state = game.create(ctx);
  const act = (playerId, type, payload = {}) => game.actions[type](state, { ...ctx, playerId, payload });
  return { ctx, state, act };
}

const throwsCode = (fn, code) => assert.throws(fn, (e) => e instanceof AppError && e.code === code);

test('full game: hot seat rotates, scoring is +1 per correct predictor on both sides', () => {
  const { state, act } = setup({ roundsPerPlayer: 2 });
  const expected = initial();
  const seen = [];
  while (!state.finished) {
    const hot = state.hotSeatId;
    seen.push(hot);
    const others = state.order.filter((id) => id !== hot);
    act(hot, 'answer', { choice: 2 });
    // Two predictors get it right, one does not.
    act(others[0], 'answer', { choice: 2 });
    act(others[1], 'answer', { choice: 2 });
    act(others[2], 'answer', { choice: 0 });
    assert.equal(state.phase, 'reveal');
    assert.deepEqual(state.lastReveal.correctIds.sort(), [others[0], others[1]].sort());
    expected[hot] += 2;
    expected[others[0]] += 1;
    expected[others[1]] += 1;
    act('p1', 'next');
  }
  assert.equal(seen.length, 8);
  assert.deepEqual(seen.slice(0, 4), seen.slice(4), 'the same order repeats');
  assert.equal(new Set(seen).size, 4);
  assert.deepEqual(state.scores, expected);
  assert.equal(state.results.ranking.length, 4);
  assert.ok(state.results.highlights.length >= 2);
});

function initial() {
  return Object.fromEntries(players.map((p) => [p.id, 0]));
}

test('invalid moves are rejected and duplicates ignored', () => {
  const { ctx, state, act } = setup();
  const hot = state.hotSeatId;
  const other = state.order.find((id) => id !== hot);
  throwsCode(() => act('p1', 'next'), 'WRONG_PHASE');
  throwsCode(() => act('ghost', 'answer', { choice: 1 }), 'NOT_IN_GAME');
  throwsCode(() => act(other, 'answer', { choice: 4 }), 'INVALID_CHOICE');
  throwsCode(() => act(other, 'answer', { choice: '1' }), 'INVALID_CHOICE');
  act(other, 'answer', { choice: 1 });
  act(other, 'answer', { choice: 3 });
  assert.equal(game.view(state, other, ctx).myChoice, 1);
  for (const id of state.order) if (id !== other) act(id, 'answer', { choice: 1 });
  throwsCode(() => act(state.order.find((id) => id !== 'p1'), 'next'), 'HOST_ONLY');
  throwsCode(() => act(hot, 'answer', { choice: 0 }), 'WRONG_PHASE');
});

test('hot-seat player missing the deadline voids the round', () => {
  const { ctx, state, act } = setup();
  const hot = state.hotSeatId;
  for (const id of state.order) if (id !== hot) act(id, 'answer', { choice: 0 });
  assert.equal(state.phase, 'answering');
  game.onTimeout(state, ctx);
  assert.equal(state.phase, 'reveal');
  assert.equal(state.lastReveal.void, true);
  assert.equal(state.lastReveal.reason, 'no-answer');
  assert.ok(Object.values(state.scores).every((s) => s === 0));
  game.onTimeout(state, ctx);
  assert.equal(state.phase, 'answering');
  assert.notEqual(state.hotSeatId, hot);
});

test('timeout with the hot seat answered still scores the predictions made', () => {
  const { ctx, state, act } = setup();
  const hot = state.hotSeatId;
  const [a] = state.order.filter((id) => id !== hot);
  act(hot, 'answer', { choice: 3 });
  act(a, 'answer', { choice: 3 });
  game.onTimeout(state, ctx);
  assert.equal(state.lastReveal.void, false);
  assert.equal(state.scores[a], 1);
  assert.equal(state.scores[hot], 1);
});

test('players leaving: hot seat leaving voids, others stop blocking, offline seats are skipped', () => {
  const { ctx, state, act } = setup();
  const [h1, h2, h3, h4] = state.order;
  act(h1, 'answer', { choice: 1 });
  game.onPlayerLeft(state, { ...ctx, playerId: h1 });
  assert.equal(state.lastReveal.void, true);
  assert.equal(state.lastReveal.reason, 'left');
  ctx.connected.delete(h1);
  ctx.connected.delete(h2);
  game.onTimeout(state, ctx); // reveal timer runs out
  assert.equal(state.hotSeatId, h3, 'h2 is offline and skipped');
  act(h3, 'answer', { choice: 0 });
  act(h4, 'answer', { choice: 0 });
  assert.equal(state.phase, 'answering', 'h2 is still in the game, so we wait');
  game.onPlayerLeft(state, { ...ctx, playerId: h2 });
  assert.equal(state.phase, 'reveal');
  assert.equal(state.scores[h3], 1);
  assert.equal(state.scores[h4], 1);
});

test('privacy: no one sees the hot-seat answer or predictions before the reveal', () => {
  const { ctx, state, act } = setup();
  const hot = state.hotSeatId;
  const [a, b, c] = state.order.filter((id) => id !== hot);
  act(hot, 'answer', { choice: 2 });
  act(a, 'answer', { choice: 1 });
  for (const viewer of [a, b, c]) {
    const v = game.view(state, viewer, ctx);
    assert.equal(v.reveal, null);
    assert.equal(v.hotSeatAnswered, true);
    assert.ok(!JSON.stringify(v).includes('"submissions"'));
    if (viewer !== a) assert.equal(v.myChoice, null);
  }
  assert.equal(game.view(state, hot, ctx).myChoice, 2);
  assert.equal(game.view(state, a, ctx).myChoice, 1);
  act(b, 'answer', { choice: 2 });
  act(c, 'answer', { choice: 0 });
  const after = game.view(state, a, ctx);
  assert.equal(after.reveal.answer, 2);
  assert.deepEqual(after.reveal.predictions, { [a]: 1, [b]: 2, [c]: 0 });
});
