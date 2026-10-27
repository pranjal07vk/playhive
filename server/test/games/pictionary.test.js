import { test } from 'node:test';
import assert from 'node:assert/strict';
import game from '../../src/games/pictionary/index.js';
import { PALETTE, validateDrawing } from '../../src/games/pictionary/strokes.js';
import { validateSettings } from '../../src/games/baseGame.js';
import { AppError } from '../../src/utils/errors.js';
import { seededRng } from '../../src/utils/random.js';

const NOW = 1_700_000_000_000;
const players = ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id.toUpperCase() }));

function setup(settings = {}, list = players) {
  const ctx = {
    players: list,
    connected: new Set(list.map((p) => p.id)),
    hostId: list[0].id,
    settings: validateSettings(game.settings, settings),
    rng: seededRng(7),
    now: NOW,
  };
  const state = game.create(ctx);
  const act = (playerId, type, payload = {}) => game.actions[type](state, { ...ctx, playerId, payload });
  const timeout = (at) => {
    ctx.now = at ?? state.deadline;
    game.onTimeout(state, ctx);
  };
  return { ctx, state, act, timeout };
}

const rejects = (fn, code) => assert.throws(fn, (err) => err instanceof AppError && (!code || err.code === code));
const stroke = (id, n = 3, extra = {}) => ({ id, color: PALETTE[0], size: 6, tool: 'pen', points: Array.from({ length: n }, (_, i) => [i / 200, 0.5]), ...extra });

test('full game: rotation, scoring, early end and finish', () => {
  const { state, act, timeout } = setup({ rounds: 1 });
  assert.equal(state.phase, 'choosing');
  assert.equal(state.drawerId, 'a');
  assert.equal(state.totalTurns, 4);

  for (const drawer of ['a', 'b', 'c', 'd']) {
    assert.equal(state.drawerId, drawer);
    act(drawer, 'choose', { index: 1 });
    assert.equal(state.phase, 'drawing');
    const word = state.word;
    const guessers = ['a', 'b', 'c', 'd'].filter((id) => id !== drawer);
    // Upper case and missing spaces still count.
    act(guessers[0], 'guess', { text: word.toUpperCase() });
    act(guessers[1], 'guess', { text: word.replace(/ /g, '') });
    act(guessers[2], 'guess', { text: `  ${word}  ` });
    assert.equal(state.phase, 'roundEnd');
    assert.deepEqual(state.lastRound.guessers.map((g) => g.points), [5, 4, 3]);
    assert.equal(state.lastRound.drawerPoints, 6);
    assert.equal(state.lastRound.reason, 'allGuessed');
    timeout();
  }
  assert.equal(state.finished, true);
  // Each player: drew once (6) and guessed first, second and third once each across the turns.
  const total = Object.values(state.scores).reduce((s, n) => s + n, 0);
  assert.equal(total, 4 * (5 + 4 + 3 + 6));
  assert.equal(state.results.ranking.length, 4);
  assert.ok(state.results.highlights[0].startsWith('Fastest guess'));
});

test('rounds setting makes everyone draw that many times', () => {
  const { state, act, timeout } = setup({ rounds: 2 }, players.slice(0, 3));
  const drawers = [];
  while (!state.finished) {
    drawers.push(state.drawerId);
    timeout(); // choose for them
    timeout(); // hint
    timeout(); // time up
    assert.equal(state.phase, 'roundEnd');
    timeout();
  }
  assert.deepEqual(drawers, ['a', 'b', 'c', 'a', 'b', 'c']);
  assert.ok(Object.values(state.scores).every((s) => s === 0));
  void act;
});

test('invalid moves are rejected', () => {
  const { state, act } = setup();
  rejects(() => act('b', 'choose', { index: 0 }), 'NOT_YOUR_TURN');
  rejects(() => act('a', 'choose', { index: 5 }), 'INVALID_CHOICE');
  rejects(() => act('a', 'choose', { index: '0' }), 'INVALID_CHOICE');
  rejects(() => act('b', 'guess', { text: 'x' }), 'WRONG_PHASE');
  rejects(() => act('a', 'stroke', { stroke: stroke('s1') }), 'WRONG_PHASE');
  rejects(() => act('zz', 'choose', { index: 0 }), 'NOT_IN_GAME');
  act('a', 'choose', { index: 0 });
  rejects(() => act('a', 'choose', { index: 0 }), 'WRONG_PHASE'); // duplicate choose
  rejects(() => act('a', 'guess', { text: state.word }), 'DRAWER_CANNOT_GUESS');
  rejects(() => act('b', 'guess', { text: '   ' }), 'INVALID_GUESS');
  rejects(() => act('b', 'guess', { text: 42 }), 'INVALID_GUESS');
  rejects(() => act('b', 'stroke', { stroke: stroke('s1') }), 'NOT_YOUR_TURN');
  rejects(() => act('zz', 'guess', { text: 'hi' }), 'NOT_IN_GAME');
  act('b', 'guess', { text: state.word });
  rejects(() => act('b', 'guess', { text: state.word }), 'ALREADY_GUESSED');
  assert.equal(state.scores.b, 5);
  assert.equal(state.scores.a, 2);
});

test('stroke validation, relay, undo, clear and the points cap', () => {
  const { state, act } = setup();
  act('a', 'choose', { index: 0 });
  const r = act('a', 'stroke', { stroke: stroke('s1', 3, { points: [[0.12345, 0.5], [1, 0]] }) });
  assert.equal(r.silent, true);
  assert.equal(r.relay.event, 'draw:stroke');
  assert.deepEqual(r.relay.data.stroke.points, [[0.123, 0.5], [1, 0]]);
  // A second segment with the same id is appended to the same stroke.
  act('a', 'stroke', { stroke: stroke('s1', 2) });
  assert.equal(state.drawing.strokes.length, 1);
  assert.equal(state.drawing.strokes[0].points.length, 4);
  act('a', 'stroke', { stroke: stroke('s2', 5, { tool: 'eraser', color: PALETTE[3] }) });
  assert.equal(state.drawing.points, 9);

  for (const bad of [
    null, 'x', stroke(''), stroke('a'.repeat(25)), stroke('ok', 3, { color: '#123456' }), stroke('ok', 3, { size: 1 }),
    stroke('ok', 3, { size: 41 }), stroke('ok', 3, { size: '6' }), stroke('ok', 3, { tool: 'spray' }), stroke('ok', 0),
    stroke('ok', 201), stroke('ok', 1, { points: [[1.2, 0]] }), stroke('ok', 1, { points: [[NaN, 0]] }), stroke('ok', 1, { points: [[0.1]] }),
    stroke('ok', 1, { points: 'nope' }), stroke('o k'),
  ]) {
    rejects(() => act('a', 'stroke', { stroke: bad }), 'INVALID_STROKE');
  }
  assert.equal(state.drawing.points, 9);

  assert.deepEqual(act('a', 'undo').relay, { event: 'draw:undo', data: { id: 's2' } });
  assert.equal(state.drawing.points, 4);
  assert.deepEqual(act('a', 'clear').relay, { event: 'draw:clear', data: {} });
  assert.equal(state.drawing.strokes.length, 0);
  assert.equal(act('a', 'undo').relay, undefined); // nothing to undo

  for (let i = 0; i < 150; i += 1) act('a', 'stroke', { stroke: stroke(`k${i}`, 200) });
  rejects(() => act('a', 'stroke', { stroke: stroke('one-more', 1) }), 'DRAWING_FULL');
  assert.equal(state.drawing.points, 30000);
});

test('validateDrawing checks whole drawings', () => {
  assert.equal(validateDrawing([stroke('a'), stroke('b')], { maxTotalPoints: 10 }).length, 2);
  rejects(() => validateDrawing([stroke('a', 6), stroke('b', 6)], { maxTotalPoints: 10 }), 'DRAWING_FULL');
  rejects(() => validateDrawing([stroke('a'), stroke('a')], { maxTotalPoints: 10 }), 'INVALID_STROKE');
  rejects(() => validateDrawing('x', { maxTotalPoints: 10 }), 'INVALID_STROKE');
});

test('privacy: the word never reaches guessers before roundEnd', () => {
  const { state, act, ctx, timeout } = setup();
  const seen = (id) => JSON.stringify(game.view(state, id, ctx));
  const options = state.options;
  assert.deepEqual(game.view(state, 'a', ctx).options, options);
  for (const id of ['b', 'c', 'd']) {
    for (const w of options) assert.ok(!seen(id).includes(w), `${id} must not see option ${w}`);
  }
  act('a', 'choose', { index: 2 });
  const word = state.word;
  assert.equal(game.view(state, 'a', ctx).word, word);
  const v = game.view(state, 'b', ctx);
  assert.equal(v.word, null);
  assert.equal(v.hint, word.replace(/[^ ]/g, '_'));

  // Close guesses and sentences containing the word stay private.
  const close = word.length > 4 ? `${word}x` : null;
  if (close) {
    act('b', 'guess', { text: close });
    assert.equal(game.view(state, 'b', ctx).myNote.text, 'So close!');
    assert.equal(game.view(state, 'c', ctx).myNote, null);
  }
  act('c', 'guess', { text: `is it ${word}?` });
  act('d', 'guess', { text: 'definitely a potato' });
  assert.deepEqual(state.feed.map((f) => f.text), ['definitely a potato']);
  act('d', 'guess', { text: word });
  assert.equal(state.feed.at(-1).text, 'D guessed it!');
  for (const id of ['b', 'c', 'd']) assert.ok(!seen(id).includes(word), `${id} must not see the word`);

  // Half time reveals exactly one letter.
  timeout();
  assert.equal(state.phase, 'drawing');
  const hint = game.view(state, 'b', ctx).hint;
  assert.equal([...hint].filter((ch) => ch !== '_' && ch !== ' ').length, 1);
  assert.equal(state.deadline, state.endsAt);

  timeout();
  assert.equal(state.phase, 'roundEnd');
  assert.equal(game.view(state, 'b', ctx).word, word);
});

test('close guess needs a word longer than 4 letters; feed is capped at 30', () => {
  const { state, act } = setup();
  act('a', 'choose', { index: 0 });
  state.word = 'kite';
  act('b', 'guess', { text: 'kito' });
  assert.equal(state.notes.b, null);
  assert.equal(state.feed.length, 1);
  for (let i = 0; i < 40; i += 1) act('c', 'guess', { text: `guess ${i}` });
  assert.equal(state.feed.length, 30);
  assert.equal(state.feed.at(-1).text, 'guess 39');
  state.word = 'samosa';
  act('b', 'guess', { text: 'samosas' });
  assert.equal(state.notes.b.text, 'So close!');
  act('b', 'guess', { text: 'sa mo sa' });
  assert.equal(state.scores.b, 5);
});

test('points go down to 1 and the drawer bonus is capped', () => {
  const list = Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, name: `P${i}` }));
  const { state, act } = setup({}, list);
  act('p0', 'choose', { index: 0 });
  for (let i = 1; i < 8; i += 1) act(`p${i}`, 'guess', { text: state.word });
  assert.deepEqual(state.lastRound.guessers.map((g) => g.points), [5, 4, 3, 2, 1, 1, 1]);
  assert.equal(state.scores.p0, 10);
});

test('timeouts: random word, offline drawer skipped', () => {
  const { state, ctx, timeout } = setup();
  timeout();
  assert.equal(state.phase, 'drawing');
  assert.ok(state.word);
  timeout();
  timeout();
  timeout(); // roundEnd -> b's turn
  assert.equal(state.drawerId, 'b');
  ctx.connected.delete('b');
  timeout(); // b is offline when choosing times out: skip to c
  assert.equal(state.drawerId, 'c');
  assert.equal(state.phase, 'choosing');
  // When a turn starts, offline players are skipped too.
  ctx.connected.delete('d');
  timeout(); timeout(); timeout(); timeout();
  assert.equal(state.finished, true);
});

test('players leaving: drawer leaves, last guesser leaves', () => {
  const { state, act, ctx } = setup();
  act('a', 'choose', { index: 0 });
  game.onPlayerLeft(state, { ...ctx, playerId: 'a' });
  assert.equal(state.phase, 'roundEnd');
  assert.equal(state.lastRound.reason, 'drawerLeft');
  game.onTimeout(state, { ...ctx, now: state.deadline });
  assert.equal(state.drawerId, 'b');
  game.actions.choose(state, { ...ctx, playerId: 'b', payload: { index: 0 } });
  act('c', 'guess', { text: state.word });
  game.onPlayerLeft(state, { ...ctx, playerId: 'd' });
  assert.equal(state.phase, 'roundEnd');
  assert.equal(state.lastRound.reason, 'allGuessed');
  // Drawer leaving while choosing just moves on.
  game.onTimeout(state, { ...ctx, now: state.deadline });
  assert.equal(state.drawerId, 'c');
  game.onPlayerLeft(state, { ...ctx, playerId: 'c' });
  assert.equal(state.finished, true); // nobody left in the queue (a and d left)
  assert.ok(game.summarize(state, ctx).headline);
});
