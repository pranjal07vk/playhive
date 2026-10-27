import { test } from 'node:test';
import assert from 'node:assert/strict';
import game from '../../src/games/scavengerHunt/index.js';
import { TASKS } from '../../src/games/scavengerHunt/content.js';
import { validateSettings } from '../../src/games/baseGame.js';
import { AppError } from '../../src/utils/errors.js';
import { seededRng } from '../../src/utils/random.js';

const NOW = 1_700_000_000_000;
const players = ['host', 'b', 'c', 'd'].map((id) => ({ id, name: id.toUpperCase() }));

function setup(settings = {}, list = players) {
  const ctx = {
    players: list,
    connected: new Set(list.map((p) => p.id)),
    hostId: list[0].id,
    settings: validateSettings(game.settings, settings),
    rng: seededRng(11),
    now: NOW,
  };
  const state = game.create(ctx);
  const act = (playerId, type, payload = {}, extra = {}) => game.actions[type](state, { ...ctx, ...extra, playerId, payload });
  const view = (id) => game.view(state, id, ctx);
  return { ctx, state, act, view };
}

const rejects = (fn, code) => assert.throws(fn, (err) => err instanceof AppError && (!code || err.code === code));
const scoreOf = (state, id) => state.results.ranking.find((r) => r.playerId === id).score;

test('content has 20+ tasks per category', () => {
  for (const list of Object.values(TASKS)) assert.ok(list.length >= 20);
});

test('same mode: full game with judging, auto-approval and first-finder bonus', () => {
  const { state, act, view } = setup({ taskCount: 3, mode: 'same' });
  assert.equal(state.refereeId, 'host');
  assert.deepEqual(state.hunters, ['b', 'c', 'd']);
  const [t1, t2, t3] = state.tasksByHunter.b;
  assert.deepEqual(state.tasksByHunter.c, state.tasksByHunter.b);
  assert.equal(view('host').myTasks, null);

  act('c', 'submit', { taskId: t1, text: 'found it first' }, { now: NOW + 1000 });
  act('b', 'submit', { taskId: t1, text: 'found it second' }, { now: NOW + 2000 });
  act('b', 'submit', { taskId: t2, text: 'an old clock' }, { now: NOW + 3000 });
  act('d', 'submit', { taskId: t2, text: 'a very old clock' }, { now: NOW + 4000 });
  act('d', 'submit', { taskId: t3, text: 'something nice' }, { now: NOW + 5000 });
  // Resubmitting changes the text and the timestamp.
  act('b', 'submit', { taskId: t2, text: 'an older clock' }, { now: NOW + 6000 });
  assert.equal(state.submissions.b[t2].at, NOW + 6000);

  act('host', 'endHunt');
  assert.equal(state.phase, 'review');
  act('host', 'judge', { hunterId: 'c', taskId: t1, verdict: 'approve' });
  act('host', 'judge', { hunterId: 'b', taskId: t1, verdict: 'approve' });
  act('host', 'judge', { hunterId: 'd', taskId: t2, verdict: 'reject' });
  act('host', 'judge', { hunterId: 'd', taskId: t3, verdict: 'reject' });
  act('host', 'judge', { hunterId: 'd', taskId: t3, verdict: 'approve' }); // changed mind
  // b's t2 is left unreviewed and counts as approved.
  act('host', 'finishReview');
  assert.equal(state.finished, true);
  assert.equal(state.submissions.b[t2].auto, true);
  // c: t1 (1 + bonus) = 2; b: t1 (1) + t2 (1 + bonus, d was rejected) = 3; d: t3 (1 + bonus) = 2.
  assert.equal(scoreOf(state, 'b'), 3);
  assert.equal(scoreOf(state, 'c'), 2);
  assert.equal(scoreOf(state, 'd'), 2);
  assert.ok(!state.results.ranking.some((r) => r.playerId === 'host'), 'the referee is not ranked');
  assert.equal(state.results.headline, 'B is the master tracker!');
});

test('different mode: own lists, no bonus', () => {
  const { state, act } = setup({ taskCount: 5, mode: 'different' });
  assert.equal(state.tasksByHunter.b.length, 5);
  assert.notDeepEqual(state.tasksByHunter.b, state.tasksByHunter.c);
  rejects(() => act('b', 'submit', { taskId: state.tasksByHunter.c.find((t) => !state.tasksByHunter.b.includes(t)), text: 'not mine' }), 'INVALID_CHOICE');
  act('b', 'submit', { taskId: state.tasksByHunter.b[0], text: 'yes found' });
  game.onTimeout(state, { players, connected: new Set(), hostId: 'host', now: state.deadline });
  assert.equal(state.phase, 'review');
  game.onTimeout(state, { players, connected: new Set(), hostId: 'host', now: state.deadline });
  assert.equal(state.finished, true);
  assert.equal(scoreOf(state, 'b'), 1);
});

test('invalid moves, late submissions, duplicates', () => {
  const { state, act } = setup();
  const t = state.tasksByHunter.b[0];
  rejects(() => act('host', 'submit', { taskId: t, text: 'referee tries' }), 'REFEREE_CANNOT_HUNT');
  rejects(() => act('zz', 'submit', { taskId: t, text: 'stranger' }), 'NOT_IN_GAME');
  rejects(() => act('b', 'submit', { taskId: t, text: 'ab' }), 'INVALID_PROOF');
  rejects(() => act('b', 'submit', { taskId: t, text: 123 }), 'INVALID_PROOF');
  rejects(() => act('b', 'submit', { taskId: 'nope', text: 'found it' }), 'INVALID_CHOICE');
  rejects(() => act('b', 'endHunt'), 'REFEREE_ONLY');
  rejects(() => act('host', 'judge', { hunterId: 'b', taskId: t, verdict: 'approve' }), 'WRONG_PHASE');
  rejects(() => act('host', 'finishReview'), 'WRONG_PHASE');
  act('b', 'submit', { taskId: t, text: 'found it' }, { now: NOW + 10 });
  act('b', 'submit', { taskId: t, text: 'found it' }, { now: NOW + 99 });
  assert.equal(state.submissions.b[t].at, NOW + 10, 'an identical resubmission keeps the original time');
  assert.equal(state.submissions.b[t].text.length, 8);
  act('b', 'submit', { taskId: t, text: 'x'.repeat(500) });
  assert.equal(state.submissions.b[t].text.length, 200);
  // After the deadline (before the timer fires) and after the hunt: too late.
  rejects(() => act('c', 'submit', { taskId: t, text: 'just in time?' }, { now: state.endsAt + 1 }), 'TOO_LATE');
  act('host', 'endHunt');
  rejects(() => act('host', 'endHunt'), 'WRONG_PHASE');
  rejects(() => act('c', 'submit', { taskId: t, text: 'please count it' }), 'TOO_LATE');
  rejects(() => act('b', 'judge', { hunterId: 'b', taskId: t, verdict: 'approve' }), 'REFEREE_ONLY');
  rejects(() => act('host', 'judge', { hunterId: 'host', taskId: t, verdict: 'approve' }), 'INVALID_CHOICE');
  rejects(() => act('host', 'judge', { hunterId: 'c', taskId: t, verdict: 'approve' }), 'NO_SUBMISSION');
  rejects(() => act('host', 'judge', { hunterId: 'b', taskId: '__proto__', verdict: 'approve' }), 'NO_SUBMISSION');
  rejects(() => act('host', 'judge', { hunterId: 'b', taskId: t, verdict: 'maybe' }), 'INVALID_CHOICE');
  act('host', 'finishReview');
  rejects(() => act('host', 'finishReview'), 'WRONG_PHASE');
});

test('nothing submitted skips review', () => {
  const { state, act } = setup();
  act('host', 'endHunt');
  assert.equal(state.finished, true);
  assert.equal(state.results.headline, 'Nobody found anything. The hunt continues another day.');
});

test('privacy: hunters see their own proofs, only counts of others; all in review', () => {
  const { state, act, view } = setup({ mode: 'same' });
  const t = state.tasksByHunter.b[0];
  act('b', 'submit', { taskId: t, text: 'my secret proof' });
  assert.equal(view('b').myTasks[0].submission.text, 'my secret proof');
  assert.equal(view('b').myTasks[0].submission.status, 'pending');
  const other = view('c');
  assert.equal(other.counts.b, 1);
  assert.equal(other.sheets, null);
  assert.ok(!JSON.stringify(other).includes('my secret proof'));
  assert.ok(JSON.stringify(view('host')).includes('my secret proof'));
  act('host', 'endHunt');
  assert.ok(JSON.stringify(view('c')).includes('my secret proof'));
  act('host', 'judge', { hunterId: 'b', taskId: t, verdict: 'reject' });
  assert.equal(view('b').myTasks[0].submission.status, 'rejected');
});

test('players leaving: a hunter, then the referee', () => {
  const { state, act, ctx } = setup();
  const t = state.tasksByHunter.b[0];
  act('b', 'submit', { taskId: t, text: 'found it' });
  act('c', 'submit', { taskId: t, text: 'me too' });
  game.onPlayerLeft(state, { ...ctx, playerId: 'd' });
  assert.equal(state.phase, 'hunting');
  act('host', 'endHunt');
  act('host', 'judge', { hunterId: 'c', taskId: t, verdict: 'reject' });
  game.onPlayerLeft(state, { ...ctx, playerId: 'host' });
  assert.equal(state.finished, true);
  assert.equal(scoreOf(state, 'b'), 2);
  assert.equal(scoreOf(state, 'c'), 0);
});

test('referee leaving during the hunt: runs to the deadline, then auto-approves', () => {
  const { state, act, ctx } = setup();
  game.onPlayerLeft(state, { ...ctx, playerId: 'host' });
  act('b', 'submit', { taskId: state.tasksByHunter.b[0], text: 'found it' });
  game.onTimeout(state, { ...ctx, now: state.deadline });
  assert.equal(state.finished, true);
  assert.equal(scoreOf(state, 'b'), 2);
  assert.ok(game.summarize(state, ctx).highlights[0].includes('HOST'));
});
