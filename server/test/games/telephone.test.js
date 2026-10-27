import { test } from 'node:test';
import assert from 'node:assert/strict';
import game from '../../src/games/telephone/index.js';
import { PALETTE } from '../../src/games/pictionary/strokes.js';
import { validateSettings } from '../../src/games/baseGame.js';
import { AppError } from '../../src/utils/errors.js';
import { seededRng } from '../../src/utils/random.js';

const NOW = 1_700_000_000_000;
const players = ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id.toUpperCase() }));
const ids = players.map((p) => p.id);

function setup(settings = {}, list = players) {
  const ctx = {
    players: list,
    connected: new Set(list.map((p) => p.id)),
    hostId: list[0].id,
    settings: validateSettings(game.settings, settings),
    rng: seededRng(3),
    now: NOW,
  };
  const state = game.create(ctx);
  const act = (playerId, type, payload = {}) => game.actions[type](state, { ...ctx, playerId, payload });
  const view = (id) => game.view(state, id, ctx);
  return { ctx, state, act, view };
}

const rejects = (fn, code) => assert.throws(fn, (err) => err instanceof AppError && (!code || err.code === code));
const drawing = (tag) => [{ id: tag, color: PALETTE[2], size: 8, tool: 'pen', points: [[0.1, 0.1], [0.2, 0.3]] }];

test('draw mode: full game, rotation, privacy of chains, reveal and results', () => {
  const { state, act, view, ctx } = setup({ mode: 'draw' });
  assert.equal(state.phase, 'writing');
  assert.equal(state.totalSteps, 4);
  assert.equal(view('a').kind, 'text');
  assert.equal(view('a').prompt, null);
  for (const id of ids) act(id, 'submit', { text: `start-${id}` });

  // Step 1: draw. Player i works on chain (i + 1) mod n and only sees its last entry.
  assert.equal(state.phase, 'step');
  assert.equal(view('a').kind, 'drawing');
  assert.deepEqual(view('a').prompt, { kind: 'text', text: 'start-b' });
  assert.deepEqual(view('d').prompt, { kind: 'text', text: 'start-a' });
  rejects(() => act('a', 'submit', { text: 'words' }), 'WRONG_STEP');
  for (const id of ids) act(id, 'submitDrawing', { strokes: drawing(`d${id}`) });

  // Step 2: describe. a now works on chain c and sees only b's drawing of it.
  assert.equal(view('a').kind, 'text');
  assert.equal(view('a').prompt.kind, 'drawing');
  assert.equal(view('a').prompt.strokes[0].id, 'db');
  assert.ok(!JSON.stringify(view('a')).includes('start-c'), 'only the previous entry is visible');
  for (const id of ids) act(id, 'submit', { text: `guess-${id}` });

  // Step 3: draw again; then the reveal.
  for (const id of ids) {
    // Nobody ever works on their own chain.
    assert.notEqual(state.chains[(ids.indexOf(id) + state.step) % 4].ownerId, id);
    act(id, 'submitDrawing', { strokes: drawing(`e${id}`) });
  }
  assert.equal(state.phase, 'reveal');
  const r = view('b').reveal;
  assert.equal(r.index, 0);
  assert.equal(r.chain.ownerId, 'a');
  assert.deepEqual(r.chain.entries.map((e) => e.kind), ['text', 'drawing', 'text', 'drawing']);
  assert.deepEqual(r.chain.entries.map((e) => e.authorId), ['a', 'd', 'c', 'b']);

  rejects(() => act('b', 'nextReveal'), 'HOST_ONLY');
  for (let i = 0; i < 4; i += 1) act('a', 'nextReveal');
  assert.equal(state.finished, true);
  assert.equal(state.results.reveal.chains.length, 4);
  assert.equal(state.results.reveal.chains[0].entries[1].strokes[0].id, 'dd');
  assert.ok(state.results.ranking.every((x) => x.score === 0));
  assert.equal(state.results.ranking.find((x) => x.playerId === 'a').note, 'Started: "start-a"');
  assert.ok(state.results.headline);
  void ctx;
});

test('text mode: phrase shown until showUntil, then hidden', () => {
  const { state, act, view, ctx } = setup({ mode: 'text', maxSteps: 4 }, [...players, { id: 'e', name: 'E' }]);
  assert.equal(state.totalSteps, 4);
  for (const id of [...ids, 'e']) act(id, 'submit', { text: `the phrase of ${id}` });
  assert.equal(view('a').kind, 'text');
  assert.ok(state.showUntil > ctx.now);
  assert.deepEqual(view('a').prompt, { kind: 'text', text: 'the phrase of b' });
  ctx.now = state.showUntil;
  assert.equal(view('a').prompt, null);
  assert.equal(view('a').showUntil, state.showUntil);
  rejects(() => act('a', 'submitDrawing', { strokes: [] }), 'WRONG_STEP');
  act('a', 'submit', { text: 'the phrase of bee' });
  assert.equal(state.chains[1].entries[1].text, 'the phrase of bee');
});

test('invalid moves and duplicates', () => {
  const { state, act, ctx } = setup();
  rejects(() => act('zz', 'submit', { text: 'hi' }), 'NOT_IN_GAME');
  rejects(() => act('a', 'submit', { text: '   ' }), 'INVALID_TEXT');
  rejects(() => act('a', 'submit', { text: 7 }), 'INVALID_TEXT');
  rejects(() => act('a', 'submitDrawing', { strokes: [] }), 'WRONG_STEP');
  rejects(() => act('a', 'nextReveal'), 'WRONG_PHASE');
  act('a', 'submit', { text: 'first' });
  act('a', 'submit', { text: 'second' }); // ignored
  assert.equal(state.chains[0].entries[0].text, 'first');
  act('a', 'useSuggestion'); // already submitted: no-op
  assert.equal(state.suggestions.a, undefined);
  act('b', 'useSuggestion');
  assert.ok(state.suggestions.b);
  for (const id of ['b', 'c', 'd']) act(id, 'submit', { text: `p${id}` });
  assert.equal(state.step, 1);
  rejects(() => act('a', 'useSuggestion'), 'WRONG_STEP');
  rejects(() => act('a', 'submitDrawing', { strokes: 'nope' }), 'INVALID_STROKE');
  rejects(() => act('a', 'submitDrawing', { strokes: [{ id: 'x', color: 'red', size: 5, tool: 'pen', points: [[0, 0]] }] }), 'INVALID_STROKE');
  const huge = Array.from({ length: 9 }, (_, i) => ({ id: `s${i}`, color: PALETTE[0], size: 5, tool: 'pen', points: Array.from({ length: 1000 }, () => [0.5, 0.5]) }));
  rejects(() => act('a', 'submitDrawing', { strokes: huge }), 'DRAWING_FULL');
  // Late submissions (after the deadline, before the timer fires) are refused.
  rejects(() => game.actions.submitDrawing(state, { ...ctx, now: state.deadline + 1, playerId: 'a', payload: { strokes: [] } }), 'TOO_LATE');
  act('a', 'submitDrawing', { strokes: [] });
  act('a', 'submitDrawing', { strokes: drawing('again') });
  assert.deepEqual(state.chains[1].entries[1].strokes, []);
});

test('timeouts fill gaps; suggestions are used for step 0', () => {
  const { state, act, ctx } = setup();
  act('a', 'submit', { text: 'mine' });
  act('b', 'useSuggestion');
  const suggestion = state.suggestions.b;
  game.onTimeout(state, { ...ctx, now: state.deadline });
  assert.equal(state.step, 1);
  assert.equal(state.chains[1].entries[0].text, suggestion);
  assert.ok(state.chains[2].entries[0].text.length > 0);
  assert.equal(state.chains[2].entries[0].missing, true);
  game.onTimeout(state, { ...ctx, now: state.deadline });
  assert.deepEqual(state.chains[1].entries[1].strokes, []);
  game.onTimeout(state, { ...ctx, now: state.deadline });
  assert.equal(state.chains[0].entries[2].text, '(they ran out of time)');
  game.onTimeout(state, { ...ctx, now: state.deadline });
  assert.equal(state.phase, 'reveal');
  for (let i = 0; i < 4; i += 1) game.onTimeout(state, { ...ctx, now: state.deadline });
  assert.equal(state.finished, true);
});

test('a player leaving is filled in now and in later steps', () => {
  const { state, act, ctx } = setup();
  for (const id of ['a', 'b', 'c']) act(id, 'submit', { text: `p${id}` });
  game.onPlayerLeft(state, { ...ctx, playerId: 'd' });
  assert.equal(state.step, 1, 'the step closes once the leaver is filled in');
  assert.equal(state.submitted.d, true);
  for (const id of ['a', 'b', 'c']) act(id, 'submitDrawing', { strokes: drawing(id) });
  assert.equal(state.step, 2);
  assert.equal(state.chains[(3 + 1) % 4].entries[1].missing, true);
  assert.equal(state.chains[(3 + 2) % 4].entries[2].text, '(they left the game)');
  assert.ok(game.summarize(state, ctx).ranking.length === 4);
});
