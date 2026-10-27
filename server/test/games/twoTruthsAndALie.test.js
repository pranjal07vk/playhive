import { test } from 'node:test';
import assert from 'node:assert/strict';
import game from '../../src/games/twoTruthsAndALie/index.js';
import { validateSettings } from '../../src/games/baseGame.js';
import { seededRng } from '../../src/utils/random.js';
import { AppError } from '../../src/utils/errors.js';

const STATEMENTS = ['I have been to Ladakh', 'I can juggle five balls', 'I once met a cricketer'];

function setup(count = 3, raw = {}) {
  const players = ['a', 'b', 'c', 'd', 'e', 'f'].slice(0, count).map((id) => ({ id, name: id.toUpperCase() }));
  const base = { players, connected: new Set(players.map((p) => p.id)), hostId: 'a', settings: validateSettings(game.settings, raw), rng: seededRng(7), now: 1_000_000 };
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
    voters: () => state.order.filter((id) => id !== state.storytellerId && !state.left?.includes(id)),
  };
}

const throwsCode = (fn, code) => assert.throws(fn, (e) => e instanceof AppError && e.code === code);

test('full game: every player tells once and scores add up', () => {
  const g = setup(3);
  const expected = { a: 0, b: 0, c: 0 };
  const tellers = [];
  for (let turn = 0; turn < 3; turn += 1) {
    assert.equal(g.state.phase, 'writing');
    const teller = g.state.storytellerId;
    tellers.push(teller);
    g.act(teller, 'submit', { statements: STATEMENTS, lieIndex: 1 });
    const [right, wrong] = g.voters();
    g.act(right, 'vote', { choice: 1 });
    g.act(wrong, 'vote', { choice: 0 });
    assert.equal(g.state.phase, 'reveal');
    expected[right] += 2;
    expected[teller] += 1;
    assert.deepEqual(g.state.roundPoints, { [right]: 2, [teller]: 1 });
    assert.equal(g.view(wrong).lieIndex, 1);
    g.act('a', 'next');
  }
  assert.deepEqual([...tellers].sort(), ['a', 'b', 'c']);
  assert.equal(g.state.finished, true);
  assert.deepEqual(g.state.scores, expected);
  assert.equal(g.state.results.ranking.length, 3);
  assert.equal(g.state.results.reveal.length, 3);
});

test('roundsPerPlayer 2 gives everyone two turns', () => {
  const g = setup(3, { roundsPerPlayer: 2 });
  assert.equal(g.view('a').totalTurns, 6);
});

test('the lie index never reaches other players before the reveal', () => {
  const g = setup(4);
  const teller = g.state.storytellerId;
  g.act(teller, 'submit', { statements: STATEMENTS, lieIndex: 2 });
  for (const id of g.voters()) {
    const v = g.view(id);
    assert.equal(v.lieIndex, null);
    assert.equal(v.myLie, null);
    assert.equal(v.votes, null);
    assert.ok(!JSON.stringify(v).includes('lie":2'));
  }
  assert.equal(g.view(teller).myLie, 2);
  assert.equal(g.view('zz').lieIndex, null); // spectator
});

test('rejects invalid moves', () => {
  const g = setup(3);
  const teller = g.state.storytellerId;
  const [other] = g.voters();
  throwsCode(() => g.act(other, 'vote', { choice: 0 }), 'WRONG_PHASE');
  throwsCode(() => g.act(other, 'submit', { statements: STATEMENTS, lieIndex: 0 }), 'NOT_YOUR_TURN');
  throwsCode(() => g.act(teller, 'submit', { statements: STATEMENTS.slice(0, 2), lieIndex: 0 }), 'INVALID_STATEMENTS');
  throwsCode(() => g.act(teller, 'submit', { statements: 'nope', lieIndex: 0 }), 'INVALID_STATEMENTS');
  throwsCode(() => g.act(teller, 'submit', { statements: ['hi', 'hello there', 'third one'], lieIndex: 0 }), 'INVALID_STATEMENTS');
  throwsCode(() => g.act(teller, 'submit', { statements: ['same', 'Same', 'other'], lieIndex: 0 }), 'INVALID_STATEMENTS');
  throwsCode(() => g.act(teller, 'submit', { statements: STATEMENTS, lieIndex: 3 }), 'INVALID_CHOICE');
  throwsCode(() => g.act(teller, 'submit', { statements: STATEMENTS, lieIndex: '1' }), 'INVALID_CHOICE');
  throwsCode(() => g.act('a', 'next'), 'WRONG_PHASE');
  g.act(teller, 'submit', { statements: [' long   ' + 'x'.repeat(200), 'second statement', 'third statement'], lieIndex: 0 });
  assert.equal(g.state.statements[0].length, 120);
  throwsCode(() => g.act(teller, 'submit', { statements: STATEMENTS, lieIndex: 0 }), 'WRONG_PHASE');
  throwsCode(() => g.act(teller, 'vote', { choice: 0 }), 'NOT_YOUR_TURN');
  throwsCode(() => g.act('zz', 'vote', { choice: 0 }), 'NOT_IN_GAME');
  throwsCode(() => g.act(other, 'vote', { choice: 5 }), 'INVALID_CHOICE');
});

test('votes are locked: repeat votes change nothing', () => {
  const g = setup(4);
  g.act(g.state.storytellerId, 'submit', { statements: STATEMENTS, lieIndex: 0 });
  const [first] = g.voters();
  g.act(first, 'vote', { choice: 1 });
  g.act(first, 'vote', { choice: 0 });
  assert.equal(g.state.votes[first], 1);
  assert.equal(g.state.phase, 'voting');
});

test('writing timeout skips the turn; voting timeout reveals', () => {
  const g = setup(3);
  const first = g.state.storytellerId;
  g.timeout();
  assert.equal(g.state.phase, 'writing');
  assert.notEqual(g.state.storytellerId, first);
  assert.deepEqual(g.view('a').skipped, [first]);
  g.act(g.state.storytellerId, 'submit', { statements: STATEMENTS, lieIndex: 0 });
  g.act(g.voters()[0], 'vote', { choice: 1 });
  g.timeout();
  assert.equal(g.state.phase, 'reveal');
  assert.equal(g.state.scores[g.state.storytellerId], 1);
  g.timeout();
  g.timeout(); // third storyteller does not write either
  assert.equal(g.state.finished, true);
});

test('player leaving: storyteller skipped, voter removed from the wait', () => {
  const g = setup(5);
  const teller = g.state.storytellerId;
  g.leave(teller);
  assert.notEqual(g.state.storytellerId, teller);
  assert.equal(g.state.phase, 'writing');
  g.act(g.state.storytellerId, 'submit', { statements: STATEMENTS, lieIndex: 0 });
  const [v1, v2, v3] = g.voters();
  g.act(v1, 'vote', { choice: 0 });
  g.act(v2, 'vote', { choice: 0 });
  g.leave(v3);
  assert.equal(g.state.phase, 'reveal');
  // The player who left never gets a turn.
  const later = [];
  while (!g.state.finished) {
    if (g.state.phase === 'writing') later.push(g.state.storytellerId);
    g.timeout();
  }
  assert.ok(!later.includes(teller) && !later.includes(v3));
  assert.ok(g.state.skipped.includes(teller));
});

test('disconnected storytellers are skipped', () => {
  const g = setup(3);
  const upcoming = g.state.turns[1];
  g.base.connected.delete(upcoming);
  g.timeout(); // skip current writer
  assert.notEqual(g.state.storytellerId, upcoming);
});
