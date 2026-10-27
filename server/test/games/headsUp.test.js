import { test } from 'node:test';
import assert from 'node:assert/strict';
import game from '../../src/games/headsUp/index.js';
import { WORDS } from '../../src/games/headsUp/content.js';
import { validateSettings } from '../../src/games/baseGame.js';
import { seededRng } from '../../src/utils/random.js';
import { AppError } from '../../src/utils/errors.js';

function setup(count = 3, raw = {}) {
  const players = ['a', 'b', 'c', 'd', 'e', 'f'].slice(0, count).map((id) => ({ id, name: id.toUpperCase() }));
  const base = { players, connected: new Set(players.map((p) => p.id)), hostId: 'a', settings: validateSettings(game.settings, raw), rng: seededRng(3), now: 1_000_000 };
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
    clueGiver: () => state.order.find((id) => id !== state.guesserId && !state.left?.includes(id)),
  };
}

const throwsCode = (fn, code) => assert.throws(fn, (e) => e instanceof AppError && e.code === code);

test('content has 20+ words in every category', () => {
  for (const words of Object.values(WORDS)) assert.ok(words.length >= 20);
});

test('full game: correct words score for the guesser only', () => {
  const g = setup(3, { category: 'food' });
  const got = { a: 0, b: 0, c: 0 };
  for (let turn = 0; turn < 3; turn += 1) {
    assert.equal(g.state.phase, 'ready');
    const guesser = g.state.guesserId;
    g.act(guesser, 'start');
    assert.equal(g.state.phase, 'playing');
    const clue = g.clueGiver();
    assert.ok(WORDS.food.includes(g.view(clue).word));
    for (let i = 0; i <= turn; i += 1) g.act(clue, 'correct', { wordId: g.view(clue).wordId });
    g.act(guesser, 'pass', { wordId: g.view(guesser).wordId });
    got[guesser] += turn + 1;
    g.timeout();
    assert.equal(g.state.phase, 'turnSummary');
    const summary = g.view(guesser);
    assert.equal(summary.gotCount, turn + 1);
    assert.equal(summary.passCount, 1);
    assert.equal(summary.log.at(-1).result, 'timeUp');
    g.act('a', 'next');
  }
  assert.equal(g.state.finished, true);
  assert.deepEqual(g.state.scores, got);
  assert.equal(Object.values(g.state.passes).reduce((s, n) => s + n, 0), 3);
  assert.equal(g.state.results.ranking[0].score, 3);
});

test('the guesser never sees the word during the turn', () => {
  const g = setup(4);
  const guesser = g.state.guesserId;
  g.act(guesser, 'start');
  const clue = g.clueGiver();
  const word = g.view(clue).word;
  g.act(clue, 'pass', { wordId: g.state.word.id });
  const passedWord = word;
  const mine = g.view(guesser);
  assert.equal(mine.word, null);
  assert.equal(mine.log, null);
  assert.ok(typeof mine.wordId === 'number');
  assert.ok(!JSON.stringify(mine).includes(g.state.word.text));
  assert.ok(!JSON.stringify(mine).includes(passedWord));
  assert.equal(mine.passCount, 1);
});

test('stale or doubled taps are ignored', () => {
  const g = setup(3);
  const guesser = g.state.guesserId;
  g.act(guesser, 'start');
  const clue = g.clueGiver();
  const wordId = g.state.word.id;
  g.act(clue, 'correct', { wordId });
  g.act(guesser, 'correct', { wordId }); // same word, second tap
  g.act(clue, 'pass', { wordId });
  g.act(clue, 'correct', {});
  assert.equal(g.state.scores[guesser], 1);
  assert.equal(g.state.log.length, 1);
});

test('rejects invalid moves', () => {
  const g = setup(3);
  const guesser = g.state.guesserId;
  const clue = g.clueGiver();
  const notHost = g.state.order.find((id) => id !== guesser && id !== 'a');
  throwsCode(() => g.act(clue, 'correct', { wordId: 1 }), 'WRONG_PHASE');
  if (notHost) throwsCode(() => g.act(notHost, 'start'), 'NOT_YOUR_TURN');
  g.act(guesser, 'start');
  throwsCode(() => g.act(guesser, 'start'), 'WRONG_PHASE');
  throwsCode(() => g.act('zz', 'correct', { wordId: g.state.word.id }), 'NOT_IN_GAME');
  throwsCode(() => g.act('a', 'next'), 'WRONG_PHASE');
  g.timeout();
  throwsCode(() => g.act(g.state.order.find((id) => id !== 'a'), 'next'), 'HOST_ONLY');
});

test('ready auto-starts; summary auto-advances', () => {
  const g = setup(3);
  g.timeout();
  assert.equal(g.state.phase, 'playing');
  g.timeout();
  assert.equal(g.state.phase, 'turnSummary');
  g.timeout();
  assert.equal(g.state.phase, 'ready');
  assert.equal(g.view('a').turn, 2);
});

test('guesser leaving ends their turn; left players get no turn', () => {
  const g = setup(4);
  const guesser = g.state.guesserId;
  g.act(guesser, 'start');
  g.leave(guesser);
  assert.equal(g.state.phase, 'turnSummary');
  const seen = [];
  while (!g.state.finished) {
    if (g.state.phase === 'ready') seen.push(g.state.guesserId);
    g.timeout();
  }
  assert.equal(seen.length, 3);
  assert.ok(!seen.includes(guesser));
});

test('guesser leaving during ready skips to the next guesser', () => {
  const g = setup(4);
  const guesser = g.state.guesserId;
  g.leave(guesser);
  assert.equal(g.state.phase, 'ready');
  assert.notEqual(g.state.guesserId, guesser);
});
