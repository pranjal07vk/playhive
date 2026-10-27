import { test } from 'node:test';
import assert from 'node:assert/strict';
import game from '../../src/games/charades/index.js';
import { WORDS } from '../../src/games/charades/content.js';
import { validateSettings } from '../../src/games/baseGame.js';
import { seededRng } from '../../src/utils/random.js';
import { AppError } from '../../src/utils/errors.js';

function setup(count = 3, raw = {}) {
  const players = ['a', 'b', 'c', 'd', 'e', 'f'].slice(0, count).map((id) => ({ id, name: id.toUpperCase() }));
  const base = { players, connected: new Set(players.map((p) => p.id)), hostId: 'a', settings: validateSettings(game.settings, raw), rng: seededRng(11), now: 1_000_000 };
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
    others: () => state.order.filter((id) => id !== state.performerId && !state.left?.includes(id)),
  };
}

const throwsCode = (fn, code) => assert.throws(fn, (e) => e instanceof AppError && e.code === code);

test('content has 20+ words in every category', () => {
  for (const words of Object.values(WORDS)) assert.ok(words.length >= 20);
});

test('full game: performer and guesser both score', () => {
  const g = setup(3, { category: 'movies' });
  const expected = { a: 0, b: 0, c: 0 };
  for (let turn = 0; turn < 3; turn += 1) {
    const performer = g.state.performerId;
    g.act(performer, 'start');
    assert.equal(g.state.phase, 'acting');
    assert.ok(WORDS.movies.includes(g.view(performer).word));
    const [guesser] = g.others();
    g.act(performer, 'guessed', { wordId: g.state.word.id, guesserId: guesser });
    g.act(performer, 'skip', { wordId: g.state.word.id });
    expected[performer] += 1;
    expected[guesser] += 1;
    g.timeout();
    assert.equal(g.state.phase, 'turnSummary');
    // Everyone sees all the words in the summary.
    const summary = g.view(guesser).log;
    assert.deepEqual(summary.map((w) => w.result), ['guessed', 'skipped', 'timeUp']);
    g.act('a', 'next');
  }
  assert.equal(g.state.finished, true);
  assert.deepEqual(g.state.scores, expected);
});

test('only the performer sees the word while acting', () => {
  const g = setup(4);
  const performer = g.state.performerId;
  g.act(performer, 'start');
  const first = g.state.word.text;
  g.act(performer, 'skip', { wordId: g.state.word.id });
  for (const id of [...g.others(), 'zz']) {
    const v = g.view(id);
    assert.equal(v.word, null);
    assert.equal(v.log, null);
    assert.ok(!JSON.stringify(v).includes(g.state.word.text));
    assert.ok(!JSON.stringify(v).includes(first));
  }
  assert.equal(g.view(performer).word, g.state.word.text);
});

test('host can mark guesses; guesser must be another participant', () => {
  const g = setup(4);
  const performer = g.state.performerId;
  g.act(performer, 'start');
  const wordId = g.state.word.id;
  const notHost = g.others().find((id) => id !== 'a');
  throwsCode(() => g.act(notHost, 'guessed', { wordId, guesserId: notHost }), 'NOT_YOUR_TURN');
  throwsCode(() => g.act(performer, 'guessed', { wordId, guesserId: performer }), 'INVALID_CHOICE');
  throwsCode(() => g.act(performer, 'guessed', { wordId, guesserId: 'zz' }), 'INVALID_CHOICE');
  throwsCode(() => g.act(performer, 'guessed', { wordId, guesserId: 5 }), 'INVALID_CHOICE');
  if (performer !== 'a') {
    g.act('a', 'guessed', { wordId, guesserId: notHost });
    assert.equal(g.state.scores[notHost], 1);
    assert.equal(g.state.scores[performer], 1);
  }
});

test('stale guessed/skip taps are ignored and skips are limited', () => {
  const g = setup(3, { skipsPerTurn: 1 });
  const performer = g.state.performerId;
  const [guesser] = g.others();
  g.act(performer, 'start');
  const wordId = g.state.word.id;
  g.act(performer, 'guessed', { wordId, guesserId: guesser });
  g.act(performer, 'guessed', { wordId, guesserId: guesser });
  g.act(performer, 'skip', { wordId });
  assert.equal(g.state.scores[guesser], 1);
  assert.equal(g.state.skipsUsed, 0);
  g.act(performer, 'skip', { wordId: g.state.word.id });
  assert.equal(g.view(performer).skipsLeft, 0);
  throwsCode(() => g.act(performer, 'skip', { wordId: g.state.word.id }), 'NO_SKIPS_LEFT');
  throwsCode(() => g.act(guesser, 'skip', { wordId: g.state.word.id }), 'NOT_YOUR_TURN');
});

test('wrong phase and host-only moves', () => {
  const g = setup(3);
  const performer = g.state.performerId;
  throwsCode(() => g.act(performer, 'skip', { wordId: 1 }), 'WRONG_PHASE');
  throwsCode(() => g.act('a', 'next'), 'WRONG_PHASE');
  g.timeout(); // ready auto-starts
  assert.equal(g.state.phase, 'acting');
  g.timeout();
  throwsCode(() => g.act(g.state.order.find((id) => id !== 'a'), 'next'), 'HOST_ONLY');
  g.timeout();
  assert.equal(g.state.phase, 'ready');
});

test('performer leaving ends the turn; they get no later turns', () => {
  const g = setup(4, { turnsPerPlayer: 2 });
  const performer = g.state.performerId;
  g.act(performer, 'start');
  g.leave(performer);
  assert.equal(g.state.phase, 'turnSummary');
  const seen = [];
  while (!g.state.finished) {
    if (g.state.phase === 'ready') seen.push(g.state.performerId);
    g.timeout();
  }
  assert.equal(seen.length, 6);
  assert.ok(!seen.includes(performer));
});
