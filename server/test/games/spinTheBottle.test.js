import { test } from 'node:test';
import assert from 'node:assert/strict';
import game from '../../src/games/spinTheBottle/index.js';
import { validateSettings } from '../../src/games/baseGame.js';
import { seededRng } from '../../src/utils/random.js';
import { AppError } from '../../src/utils/errors.js';
import { CATEGORY_KINDS } from '../../src/games/spinTheBottle/content.js';

const players = ['Asha', 'Bilal', 'Chitra', 'Dev', 'Esha'].map((name, i) => ({ id: `p${i + 1}`, name }));

function setup(settings = {}, count = 5) {
  const roster = players.slice(0, count);
  const ctx = {
    players: roster,
    connected: new Set(roster.map((p) => p.id)),
    hostId: 'p1',
    settings: validateSettings(game.settings, settings),
    rng: seededRng(5),
    now: 1_000_000,
  };
  const state = game.create(ctx);
  const act = (playerId, type, payload = {}) => game.actions[type](state, { ...ctx, playerId, payload });
  return { ctx, state, act };
}

const throwsCode = (fn, code) => assert.throws(fn, (e) => e instanceof AppError && e.code === code);

test('full game: target is never the spinner, avoids bouncing back, becomes next spinner, scores', () => {
  const { ctx, state, act } = setup({ spins: 10, skipsPerPlayer: 1 });
  assert.equal(state.phase, 'ready');
  const expected = Object.fromEntries(players.map((p) => [p.id, 0]));
  let skipped = false;
  for (let i = 0; i < 10; i += 1) {
    const spinner = state.spinnerId;
    const prevSpinner = state.prevSpinnerId;
    act(spinner, 'spin');
    assert.equal(state.phase, 'spun');
    assert.equal(state.spinId, i + 1);
    const target = state.targetId;
    assert.notEqual(target, spinner);
    assert.notEqual(target, prevSpinner, 'with 5 players the bottle does not bounce straight back');
    const v = game.view(state, 'p3', ctx);
    assert.equal(v.seats[v.targetIndex], target);
    assert.ok(CATEGORY_KINDS.mix.includes(v.prompt.kind));
    assert.ok(!v.prompt.text.includes('{spinner}'));
    if (!skipped) {
      act(target, 'skip', { spinId: state.spinId });
      skipped = true;
    } else {
      act(target, 'done', { spinId: state.spinId });
      expected[target] += 1;
    }
    if (!state.finished) assert.equal(state.spinnerId, target);
  }
  assert.equal(state.finished, true);
  assert.deepEqual(state.scores, expected);
  assert.equal(state.results.ranking.reduce((n, r) => n + r.score, 0), 9);
});

test('category limits the prompt kinds and {spinner} is filled in', () => {
  const { state, act } = setup({ category: 'wholesome', spins: 30 });
  for (let i = 0; i < 30; i += 1) {
    act(state.spinnerId, 'spin');
    assert.ok(CATEGORY_KINDS.wholesome.includes(state.prompt.kind));
    act(state.targetId, 'done');
  }
  assert.ok(state.history.some((h) => players.some((p) => h.prompt.text.includes(p.name))));
});

test('invalid moves are rejected and duplicates never double-advance', () => {
  const { state, act } = setup({ skipsPerPlayer: 0 });
  const spinner = state.spinnerId;
  const other = state.order.find((id) => id !== spinner);
  throwsCode(() => act(other, 'spin'), 'NOT_YOUR_TURN');
  throwsCode(() => act('ghost', 'spin'), 'NOT_IN_GAME');
  throwsCode(() => act(spinner, 'done'), 'WRONG_PHASE');
  act(spinner, 'spin');
  throwsCode(() => act(spinner, 'spin'), 'WRONG_PHASE');
  const target = state.targetId;
  const bystander = state.order.find((id) => id !== target && id !== spinner);
  throwsCode(() => act(bystander, 'done'), 'NOT_YOUR_TURN');
  throwsCode(() => act(target, 'skip'), 'NO_SKIPS');
  const nonHost = state.order.find((id) => id !== 'p1');
  throwsCode(() => act(nonHost, 'skipTurn', { spinId: state.spinId }), 'HOST_ONLY');
  throwsCode(() => act('p1', 'skipTurn', {}), 'BAD_PAYLOAD');
  const spinId = state.spinId;
  act(target, 'done', { spinId });
  assert.equal(state.spinsDone, 1);
  assert.throws(() => act(target, 'done', { spinId })); // now in 'ready'
  assert.equal(state.spinsDone, 1);
  assert.equal(state.scores[target], 1);

  // Host double click on skipTurn acts once per spin.
  act('p1', 'skipTurn', { spinId: state.spinId }); // spins for the idle spinner
  assert.equal(state.phase, 'spun');
  const now = state.spinId;
  act('p1', 'skipTurn', { spinId: now - 1 }); // stale
  assert.equal(state.phase, 'spun');
  act('p1', 'skipTurn', { spinId: now });
  act('p1', 'skipTurn', { spinId: now });
  assert.equal(state.spinsDone, 2);
  assert.equal(state.lastSpin.outcome, 'host-skipped');
});

test('timeouts: ready auto-spins, prompt passes without a point', () => {
  const { ctx, state } = setup();
  game.onTimeout(state, ctx);
  assert.equal(state.phase, 'spun');
  assert.equal(state.deadline, ctx.now + 90_000);
  const target = state.targetId;
  game.onTimeout(state, ctx);
  assert.equal(state.lastSpin.outcome, 'timeout');
  assert.equal(state.scores[target], 0);
  assert.equal(state.spinnerId, target);
  assert.equal(state.phase, 'ready');
});

test('players leaving: spinner replaced, target leaving means a re-spin, offline players are avoided', () => {
  const { ctx, state, act } = setup({}, 4);
  const spinner = state.spinnerId;
  game.onPlayerLeft(state, { ...ctx, playerId: spinner });
  ctx.connected.delete(spinner);
  assert.equal(state.phase, 'ready');
  assert.notEqual(state.spinnerId, spinner);

  const s2 = state.spinnerId;
  act(s2, 'spin');
  const target = state.targetId;
  assert.notEqual(target, spinner);
  game.onPlayerLeft(state, { ...ctx, playerId: target });
  ctx.connected.delete(target);
  assert.equal(state.phase, 'ready');
  assert.equal(state.spinnerId, s2);
  assert.equal(state.spinsDone, 0);

  // Only one other player remains, so the bottle must land on them.
  act(s2, 'spin');
  const last = state.order.find((id) => ![spinner, target, s2].includes(id));
  assert.equal(state.targetId, last);
});

test('disconnected players are not picked while others are online', () => {
  const { ctx, state, act } = setup({ spins: 20 });
  ctx.connected.delete('p5');
  for (let i = 0; i < 20 && !state.finished; i += 1) {
    act(state.spinnerId, 'spin');
    assert.notEqual(state.targetId, 'p5');
    act(state.targetId, 'done');
  }
});

test('view shows target and prompt only after the spin', () => {
  const { ctx, state, act } = setup();
  const before = game.view(state, 'p2', ctx);
  assert.equal(before.targetIndex, null);
  assert.equal(before.prompt, null);
  assert.equal(game.view(state, state.spinnerId, ctx).isMySpin, true);
  act(state.spinnerId, 'spin');
  const v = game.view(state, state.targetId, ctx);
  assert.equal(v.isMyTarget, true);
  assert.equal(v.canSkip, true);
});
