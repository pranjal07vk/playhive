import { test } from 'node:test';
import assert from 'node:assert/strict';
import game from '../../src/games/neverHaveIEver/index.js';
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
    rng: seededRng(3),
    now: 1_000_000,
  };
  const state = game.create(ctx);
  const act = (playerId, type, payload = {}) => game.actions[type](state, { ...ctx, playerId, payload });
  return { ctx, state, act };
}

const throwsCode = (fn, code) => assert.throws(fn, (e) => e instanceof AppError && e.code === code);

test('lives mode: every "I have" costs a finger, out players keep answering, most fingers wins', () => {
  const { ctx, state, act } = setup({ rounds: 5, lives: 2 });
  for (let r = 0; r < 5; r += 1) {
    act('p1', 'answer', { answer: 'have' }); // p1 always has
    act('p2', 'answer', { answer: r === 0 ? 'have' : 'never' });
    act('p3', 'answer', { answer: 'never' });
    act('p4', 'answer', { answer: 'never' });
    assert.equal(state.phase, 'reveal');
    if (r === 1) assert.equal(game.view(state, 'p1', ctx).amOut, true);
    act('p1', 'next');
  }
  assert.equal(state.finished, true);
  assert.deepEqual(state.lives, { p1: 0, p2: 1, p3: 2, p4: 2 });
  const [first, second] = state.results.ranking;
  assert.equal(first.score, 2);
  assert.equal(first.rank, 1);
  assert.equal(second.rank, 1);
  assert.equal(state.results.ranking.at(-1).playerId, 'p1');
  assert.equal(state.results.ranking.at(-1).note, 'Out of fingers');
  assert.match(state.results.headline, /tie/);
});

test('no-lives mode has no scoring', () => {
  const { state, act } = setup({ rounds: 5, lives: 0 });
  for (let r = 0; r < 5; r += 1) {
    for (const p of players) act(p.id, 'answer', { answer: 'have' });
    act('p1', 'next');
  }
  assert.equal(state.lives, null);
  assert.ok(state.results.ranking.every((r) => r.score === 0));
});

test('invalid moves are rejected and duplicate answers are ignored', () => {
  const { ctx, state, act } = setup();
  throwsCode(() => act('p1', 'next'), 'WRONG_PHASE');
  throwsCode(() => act('ghost', 'answer', { answer: 'have' }), 'NOT_IN_GAME');
  throwsCode(() => act('p1', 'answer', { answer: 'maybe' }), 'INVALID_CHOICE');
  throwsCode(() => act('p1', 'answer', { answer: true }), 'INVALID_CHOICE');
  act('p1', 'answer', { answer: 'never' });
  act('p1', 'answer', { answer: 'have' });
  assert.equal(game.view(state, 'p1', ctx).myAnswer, 'never');
  for (const id of ['p2', 'p3', 'p4']) act(id, 'answer', { answer: 'never' });
  throwsCode(() => act('p2', 'next'), 'HOST_ONLY');
  throwsCode(() => act('p2', 'answer', { answer: 'have' }), 'WRONG_PHASE');
  assert.equal(state.round, 1);
});

test('timeouts close answering (silence costs nothing) and then advance', () => {
  const { ctx, state, act } = setup({ lives: 3 });
  act('p1', 'answer', { answer: 'have' });
  game.onTimeout(state, ctx);
  assert.equal(state.phase, 'reveal');
  assert.deepEqual(game.view(state, 'p2', ctx).result, { have: 1, never: 0, haveIds: ['p1'] });
  assert.equal(state.lives.p2, 3);
  game.onTimeout(state, ctx);
  assert.equal(state.phase, 'answering');
  assert.equal(state.round, 2);
});

test('a player leaving no longer holds up the round', () => {
  const { ctx, state, act } = setup();
  for (const id of ['p1', 'p2', 'p3']) act(id, 'answer', { answer: 'never' });
  assert.equal(state.phase, 'answering');
  game.onPlayerLeft(state, { ...ctx, playerId: 'p4' });
  assert.equal(state.phase, 'reveal');
  assert.ok(!game.view(state, 'p1', ctx).waitingOn.includes('p4'));
});

test('privacy: answers hidden before the reveal, names hidden in anonymous mode', () => {
  const { ctx, state, act } = setup({ privacy: 'anonymous', lives: 3 });
  act('p1', 'answer', { answer: 'have' });
  const before = JSON.stringify(game.view(state, 'p2', ctx));
  assert.ok(!before.includes('"have"'), 'no one else sees p1 answered "have"');
  assert.deepEqual(game.view(state, 'p2', ctx).answeredIds, ['p1']);
  for (const id of ['p2', 'p3', 'p4']) act(id, 'answer', { answer: 'never' });
  const after = game.view(state, 'p2', ctx);
  assert.deepEqual(after.result, { have: 1, never: 3, haveIds: null });
  assert.equal(after.lives, null, 'other players\' lives would give answers away');
  assert.equal(after.myLives, 3);
  assert.equal(game.view(state, 'p1', ctx).myLives, 2);
  assert.ok(!JSON.stringify(after).includes('p1":2'));

  // Named mode before the reveal shows nothing either.
  const named = setup({ privacy: 'named' });
  named.act('p3', 'answer', { answer: 'have' });
  assert.equal(game.view(named.state, 'p1', named.ctx).result, null);
  assert.equal(game.view(named.state, 'p1', named.ctx).myAnswer, null);
});
