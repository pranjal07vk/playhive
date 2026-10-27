import { test } from 'node:test';
import assert from 'node:assert/strict';
import game from '../../src/games/truthOrDare/index.js';
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
    rng: seededRng(7),
    now: 1_000_000,
  };
  const state = game.create(ctx);
  const act = (playerId, type, payload = {}) => game.actions[type](state, { ...ctx, playerId, payload });
  return { ctx, state, act };
}

const throwsCode = (fn, code) => assert.throws(fn, (e) => e instanceof AppError && e.code === code);

test('full game: done scores, skip does not, game finishes after rounds × players turns', () => {
  const { ctx, state, act } = setup({ rounds: 2, skipsPerPlayer: 1 });
  assert.equal(state.phase, 'choosing');
  assert.equal(new Set(state.order).size, 4);
  const firstTurns = [];
  let turns = 0;
  while (!state.finished) {
    const id = state.currentId;
    if (turns < 4) firstTurns.push(id);
    else assert.equal(id, firstTurns[turns - 4], 'the same shuffled order repeats each round');
    act(id, 'choose', { kind: turns % 2 ? 'dare' : 'truth' });
    assert.equal(state.phase, 'prompt');
    assert.equal(typeof game.view(state, 'p2', ctx).prompt, 'string');
    // The first player skips in round 1, everyone else completes.
    if (turns === 0) act(id, 'skip');
    else act(id, 'done', { turn: state.turn });
    turns += 1;
  }
  assert.equal(turns, 8);
  assert.equal(state.scores[firstTurns[0]], 1);
  for (const id of firstTurns.slice(1)) assert.equal(state.scores[id], 2);
  assert.equal(state.results.ranking[0].score, 2);
  assert.equal(state.results.ranking.at(-1).playerId, firstTurns[0]);
  assert.ok(state.results.highlights.some((h) => h.includes('skipped')));
});

test('rejects wrong phase, wrong turn, non-participant and bad payloads', () => {
  const { state, act } = setup();
  const me = state.currentId;
  const other = state.order.find((id) => id !== me);
  throwsCode(() => act(me, 'done'), 'WRONG_PHASE');
  throwsCode(() => act(other, 'choose', { kind: 'truth' }), 'NOT_YOUR_TURN');
  throwsCode(() => act('stranger', 'choose', { kind: 'truth' }), 'NOT_IN_GAME');
  throwsCode(() => act(me, 'choose', { kind: 'kiss' }), 'INVALID_CHOICE');
  throwsCode(() => act(me, 'choose', {}), 'INVALID_CHOICE');
  act(me, 'choose', { kind: 'dare' });
  throwsCode(() => act(me, 'choose', { kind: 'truth' }), 'WRONG_PHASE');
  throwsCode(() => act(other, 'done'), 'NOT_YOUR_TURN');
  throwsCode(() => act(other, 'skipTurn', { turn: state.turn }), 'HOST_ONLY');
  throwsCode(() => act('p1', 'skipTurn', {}), 'BAD_PAYLOAD');
});

test('skips run out, and duplicate done or skipTurn never double-advances', () => {
  const { state, act } = setup({ skipsPerPlayer: 0 });
  const first = state.currentId;
  act(first, 'choose', { kind: 'truth' });
  throwsCode(() => act(first, 'skip'), 'NO_SKIPS');
  const turn = state.turn;
  act(first, 'done', { turn });
  const second = state.currentId;
  assert.notEqual(second, first);
  // A stale repeat of the first player's done is rejected or ignored.
  assert.throws(() => act(first, 'done', { turn }));
  assert.equal(state.currentId, second);
  assert.equal(state.scores[first], 1);

  // Host double-clicks skip on an AFK player: only one turn is skipped.
  const afkTurn = state.turn;
  act('p1', 'skipTurn', { turn: afkTurn });
  const third = state.currentId;
  act('p1', 'skipTurn', { turn: afkTurn });
  assert.equal(state.currentId, third);
  assert.equal(state.lastTurn.outcome, 'host-skipped');
  assert.equal(state.scores[second], 0);
});

test('timeouts: choosing auto-picks, prompt passes without a point', () => {
  const { ctx, state } = setup();
  const id = state.currentId;
  game.onTimeout(state, ctx);
  assert.equal(state.phase, 'prompt');
  assert.ok(['truth', 'dare'].includes(state.kind));
  assert.equal(state.deadline, ctx.now + 90_000);
  game.onTimeout(state, ctx);
  assert.equal(state.lastTurn.outcome, 'timeout');
  assert.equal(state.scores[id], 0);
  assert.notEqual(state.currentId, id);
  assert.equal(state.phase, 'choosing');
});

test('disconnected players are skipped, and a leaving current player ends their turn', () => {
  const { ctx, state, act } = setup({ rounds: 1 });
  const [a, b, c, d] = state.order;
  ctx.connected.delete(b);
  act(a, 'choose', { kind: 'truth' });
  game.actions.done(state, { ...ctx, playerId: a, payload: {} });
  assert.equal(state.currentId, c, 'b is disconnected and skipped');
  assert.equal(state.history.at(-1).outcome, 'away');

  game.onPlayerLeft(state, { ...ctx, playerId: c });
  assert.equal(state.currentId, d);
  assert.equal(state.lastTurn.outcome, 'left');
  game.actions.choose(state, { ...ctx, playerId: d, payload: { kind: 'dare' } });
  game.actions.done(state, { ...ctx, playerId: d, payload: {} });
  assert.equal(state.finished, true);
  assert.equal(state.scores[a], 1);
  assert.equal(state.scores[d], 1);
});

test('a disconnected player whose choosing timer runs out loses the turn', () => {
  const { ctx, state } = setup();
  const id = state.currentId;
  ctx.connected.delete(id);
  game.onTimeout(state, ctx);
  assert.equal(state.lastTurn.outcome, 'away');
  assert.notEqual(state.currentId, id);
});

test('view hides the prompt until it is chosen and summarize works mid-game', () => {
  const { ctx, state, act } = setup({ intensity: 'spicy', category: 'campus' });
  const v = game.view(state, state.currentId, ctx);
  assert.equal(v.prompt, null);
  assert.equal(v.isMyTurn, true);
  act(state.currentId, 'choose', { kind: 'truth' });
  assert.equal(game.view(state, 'p3', ctx).canSkip, state.currentId === 'p3');
  const s = game.summarize(state, ctx);
  assert.equal(s.ranking.length, 4);
});
