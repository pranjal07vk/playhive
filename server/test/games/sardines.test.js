import { test } from 'node:test';
import assert from 'node:assert/strict';
import game from '../../src/games/sardines/index.js';
import { validateSettings } from '../../src/games/baseGame.js';
import { seededRng } from '../../src/utils/random.js';
import { AppError } from '../../src/utils/errors.js';

function setup(count = 4, raw = {}) {
  const players = ['a', 'b', 'c', 'd', 'e', 'f'].slice(0, count).map((id) => ({ id, name: id.toUpperCase() }));
  const base = { players, connected: new Set(players.map((p) => p.id)), hostId: 'a', settings: validateSettings(game.settings, raw), rng: seededRng(9), now: 1_000_000 };
  const state = game.create(base);
  return {
    state,
    base,
    act: (playerId, type, payload = {}) => game.actions[type](state, { ...base, playerId, payload }),
    timeout: () => {
      base.now = state.deadline;
      game.onTimeout(state, base);
    },
    tick: (seconds) => {
      base.now += seconds * 1000;
    },
    leave: (id) => {
      base.connected.delete(id);
      game.onPlayerLeft(state, { ...base, playerId: id });
    },
    view: (id) => game.view(state, id, base),
  };
}

const throwsCode = (fn, code) => assert.throws(fn, (e) => e instanceof AppError && e.code === code);

test('full game: find order scores n-1 ... 0, hider scores for the unfound', () => {
  const g = setup(4, { rounds: 2 });
  const expected = { a: 0, b: 0, c: 0, d: 0 };
  const hiders = [];

  // Round 1: everyone finds the hider.
  hiders.push(g.state.hiderId);
  g.act(g.state.hiderId, 'hidden');
  assert.equal(g.state.phase, 'seeking');
  const [s1, s2, s3] = g.state.seekers;
  g.tick(30);
  g.act(s2, 'found');
  g.tick(10);
  g.act(s3, 'found');
  g.act(s1, 'found');
  assert.equal(g.state.phase, 'roundSummary');
  expected[s2] += 2;
  expected[s3] += 1;
  assert.deepEqual(g.state.roundPoints, { [s2]: 2, [s3]: 1, [s1]: 0, [g.state.hiderId]: 0 });
  assert.equal(g.view(s1).found[0].afterSeconds, 30);
  assert.equal(g.view(s1).found[2].place, 3);
  g.act('a', 'next');

  // Round 2: a new hider, time runs out with two still searching.
  assert.ok(!hiders.includes(g.state.hiderId));
  g.timeout(); // hiding time over
  const [t1] = g.state.seekers;
  g.tick(45);
  g.act(t1, 'found');
  g.timeout();
  expected[t1] += 2;
  expected[g.state.hiderId] += 2;
  assert.equal(g.state.phase, 'roundSummary');
  g.timeout();
  assert.equal(g.state.finished, true);
  assert.deepEqual(g.state.scores, expected);
  assert.ok(g.state.results.highlights.some((h) => h.includes('30s')));
});

test('hider rotates every round', () => {
  const g = setup(5, { rounds: 5 });
  const hiders = [];
  while (!g.state.finished) {
    if (g.state.phase === 'hiding') hiders.push(g.state.hiderId);
    g.timeout();
  }
  assert.equal(new Set(hiders).size, 5);
});

test('rejects invalid moves; repeated found is a no-op', () => {
  const g = setup(4);
  const hider = g.state.hiderId;
  const [seeker] = g.state.seekers;
  throwsCode(() => g.act(seeker, 'found'), 'WRONG_PHASE');
  throwsCode(() => g.act(seeker, 'hidden'), 'NOT_YOUR_TURN');
  throwsCode(() => g.act('a', 'endRound'), 'WRONG_PHASE');
  g.act(hider, 'hidden');
  throwsCode(() => g.act(hider, 'hidden'), 'WRONG_PHASE');
  throwsCode(() => g.act(hider, 'found'), 'NOT_A_SEEKER');
  throwsCode(() => g.act('zz', 'found'), 'NOT_IN_GAME');
  const notHost = g.state.order.find((id) => id !== 'a');
  throwsCode(() => g.act(notHost, 'endRound'), 'HOST_ONLY');
  g.act(seeker, 'found');
  g.tick(5);
  g.act(seeker, 'found');
  assert.equal(g.state.found.length, 1);
  assert.equal(g.view(seeker).amFound, true);
});

test('host can end the round; scored like time running out', () => {
  const g = setup(5);
  g.act(g.state.hiderId, 'hidden');
  const [s1] = g.state.seekers;
  g.act(s1, 'found');
  g.act('a', 'endRound');
  assert.equal(g.state.phase, 'roundSummary');
  assert.equal(g.state.roundPoints[s1], 3);
  assert.equal(g.state.roundPoints[g.state.hiderId], 3);
});

test('views carry no hidden data and differ only in personal flags', () => {
  const g = setup(4);
  g.act(g.state.hiderId, 'hidden');
  const strip = ({ isHider, amFound, ...rest }) => rest;
  const views = g.state.order.map((id) => strip(g.view(id)));
  for (const v of views) assert.deepEqual(v, views[0]);
  assert.equal(g.view('zz').isHider, false);
});

test('hider leaving voids the round; seeker leaving can complete it', () => {
  const g = setup(6, { rounds: 3 });
  const hider = g.state.hiderId;
  g.leave(hider);
  assert.equal(g.state.phase, 'roundSummary');
  assert.equal(g.state.voided, true);
  assert.ok(Object.values(g.state.scores).every((s) => s === 0));
  g.timeout();
  assert.equal(g.state.phase, 'hiding');
  assert.notEqual(g.state.hiderId, hider);
  g.act(g.state.hiderId, 'hidden');
  const seekers = g.state.seekers;
  assert.ok(!seekers.includes(hider));
  for (const id of seekers.slice(0, -1)) g.act(id, 'found');
  g.leave(seekers.at(-1));
  assert.equal(g.state.phase, 'roundSummary');
  // Three seekers remain: 2, 1, 0 points.
  assert.deepEqual(seekers.slice(0, 3).map((id) => g.state.roundPoints[id]), [2, 1, 0]);
});
