import { test } from 'node:test';
import assert from 'node:assert/strict';
import game from '../../src/games/freezeDance/index.js';
import { validateSettings } from '../../src/games/baseGame.js';
import { seededRng } from '../../src/utils/random.js';
import { AppError } from '../../src/utils/errors.js';

function setup(count = 5, raw = {}) {
  const players = ['a', 'b', 'c', 'd', 'e', 'f'].slice(0, count).map((id) => ({ id, name: id.toUpperCase() }));
  const base = { players, connected: new Set(players.map((p) => p.id)), hostId: 'a', settings: validateSettings(game.settings, raw), rng: seededRng(5), now: 1_000_000 };
  const state = game.create(base);
  return {
    state,
    base,
    act: (playerId, type, payload = {}) => game.actions[type](state, { ...base, playerId, payload }),
    timeout: () => {
      base.now = state.deadline;
      game.onTimeout(state, base);
    },
    leave: (id) => {
      base.connected.delete(id);
      game.onPlayerLeft(state, { ...base, playerId: id });
    },
    view: (id) => game.view(state, id, base),
  };
}

const throwsCode = (fn, code) => assert.throws(fn, (e) => e instanceof AppError && e.code === code);

test('host is the DJ and not a contestant when 3+ others play', () => {
  const g = setup(4);
  assert.deepEqual(g.state.contestants, ['b', 'c', 'd']);
  assert.equal(g.view('a').isDJ, true);
  assert.equal(g.view('a').isContestant, false);
  assert.equal(g.view('b').isDJ, false);
  const small = setup(3);
  assert.deepEqual(small.state.contestants, ['a', 'b', 'c']);
});

test('dance length follows the pace setting', () => {
  for (const [pace, min, max] of [['chill', 10, 15], ['normal', 6, 12], ['hyper', 5, 8]]) {
    const g = setup(4, { pace });
    for (let i = 0; i < 5; i += 1) {
      const seconds = (g.state.deadline - g.base.now) / 1000;
      assert.ok(seconds >= min && seconds <= max, `${pace}: ${seconds}`);
      g.timeout();
      g.act('a', 'resume');
    }
  }
});

test('full game: last one standing wins with rounds survived as points', () => {
  const g = setup(5);
  assert.equal(g.state.phase, 'dancing');
  assert.equal(g.view('b').deadline, null); // the stop is a surprise
  g.timeout();
  assert.equal(g.state.phase, 'frozen');
  assert.ok(g.view('b').deadline > g.base.now);
  g.act('a', 'eliminate', { playerIds: ['b'] });
  g.act('c', 'iMoved');
  g.act('a', 'resume'); // round 1: d, e survive
  assert.equal(g.state.phase, 'dancing');
  assert.equal(g.state.round, 2);
  g.timeout();
  g.act('a', 'resume'); // round 2: d, e survive
  g.timeout();
  g.act('a', 'eliminate', { playerIds: ['e'] });
  g.act('a', 'resume'); // round 3: d wins
  assert.equal(g.state.finished, true);
  assert.deepEqual(g.state.scores, { b: 0, c: 0, d: 3, e: 2 });
  assert.equal(g.state.results.ranking[0].playerId, 'd');
  assert.deepEqual(g.state.eliminated, [
    { playerId: 'b', round: 1, how: 'dj' },
    { playerId: 'c', round: 1, how: 'self' },
    { playerId: 'e', round: 3, how: 'dj' },
  ]);
  assert.ok(!('a' in g.state.scores));
});

test('ends after maxRounds with a shared win', () => {
  const g = setup(4, { maxRounds: 3 });
  for (let i = 0; i < 3; i += 1) {
    g.timeout(); // freeze
    g.timeout(); // frozen window runs out
  }
  assert.equal(g.state.finished, true);
  assert.ok(g.state.results.ranking.every((r) => r.rank === 1 && r.score === 3));
});

test('rejects invalid moves; repeats are harmless', () => {
  const g = setup(5);
  throwsCode(() => g.act('a', 'eliminate', { playerIds: ['b'] }), 'WRONG_PHASE');
  throwsCode(() => g.act('b', 'iMoved'), 'WRONG_PHASE');
  throwsCode(() => g.act('a', 'resume'), 'WRONG_PHASE');
  g.timeout();
  throwsCode(() => g.act('b', 'eliminate', { playerIds: ['c'] }), 'HOST_ONLY');
  throwsCode(() => g.act('b', 'resume'), 'HOST_ONLY');
  throwsCode(() => g.act('a', 'eliminate', { playerIds: 'b' }), 'INVALID_CHOICE');
  throwsCode(() => g.act('a', 'eliminate', { playerIds: [] }), 'INVALID_CHOICE');
  throwsCode(() => g.act('a', 'eliminate', { playerIds: ['a'] }), 'INVALID_CHOICE');
  throwsCode(() => g.act('a', 'eliminate', { playerIds: ['zz'] }), 'INVALID_CHOICE');
  throwsCode(() => g.act('a', 'iMoved'), 'NOT_A_CONTESTANT');
  throwsCode(() => g.act('zz', 'iMoved'), 'NOT_IN_GAME');
  g.act('a', 'eliminate', { playerIds: ['b', 'b'] });
  g.act('a', 'eliminate', { playerIds: ['b'] });
  g.act('b', 'iMoved');
  assert.equal(g.state.eliminated.length, 1);
  assert.deepEqual(g.view('b').amAlive, false);
});

test('the DJ can undo a call from this round only', () => {
  const g = setup(5);
  g.timeout();
  g.act('a', 'eliminate', { playerIds: ['b'] });
  g.act('a', 'reinstate', { playerId: 'b' });
  assert.ok(g.state.alive.includes('b'));
  g.act('a', 'eliminate', { playerIds: ['b'] });
  g.act('a', 'resume');
  g.timeout();
  throwsCode(() => g.act('a', 'reinstate', { playerId: 'b' }), 'INVALID_CHOICE');
});

test('leaving removes a dancer and can end the game', () => {
  const g = setup(5);
  g.leave('b');
  assert.deepEqual(g.state.alive, ['c', 'd', 'e']);
  assert.equal(g.state.eliminated[0].how, 'left');
  g.timeout();
  g.act('a', 'eliminate', { playerIds: ['c'] });
  g.leave('d');
  assert.equal(g.state.finished, true);
  assert.equal(g.state.results.ranking.find((r) => r.playerId === 'e').rank, 1);
});
