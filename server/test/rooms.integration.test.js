import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers.js';

let t;
before(async () => {
  t = await startTestServer();
});
after(() => t.close());

async function roomWith(names, gameId = 'would-you-rather', settings = {}) {
  const created = await t.api('/api/rooms', { name: names[0], gameId, settings });
  assert.equal(created.status, 201);
  const sessions = [created.body.session];
  for (const name of names.slice(1)) {
    const joined = await t.api(`/api/rooms/${created.body.session.roomCode}/join`, { name });
    assert.equal(joined.status, 201, JSON.stringify(joined.body));
    sessions.push(joined.body.session);
  }
  const clients = [];
  for (const s of sessions) clients.push(await t.join(s));
  return { code: created.body.session.roomCode, clients };
}

test('rejects bad room codes, names and unknown rooms', async () => {
  assert.equal((await t.api('/api/rooms/abc')).body.error.code, 'INVALID_CODE');
  assert.equal((await t.api('/api/rooms/ZZZZZ')).status, 404);
  assert.equal((await t.api('/api/rooms', { name: 'x', gameId: 'would-you-rather' })).body.error.code, 'INVALID_NAME');
  assert.equal((await t.api('/api/rooms', { name: 'Asha', gameId: 'nope' })).body.error.code, 'UNKNOWN_GAME');
  assert.equal((await t.api('/api/rooms', { name: 'Asha', gameId: 'would-you-rather', admin: true })).body.error.code, 'INVALID_BODY');
});

test('rejects duplicate names and invalid sessions', async () => {
  const { code } = await roomWith(['Asha']);
  assert.equal((await t.api(`/api/rooms/${code}/join`, { name: 'asha' })).body.error.code, 'NAME_TAKEN');
  await assert.rejects(t.join({ roomCode: code, playerId: 'fake', token: 'fake' }));
});

test('lobby updates live, only the host can start, and full game plays out', async () => {
  const { clients: [host, guest] } = await roomWith(['Asha', 'Bilal'], 'would-you-rather', { rounds: 3 });
  await t.until(host, (s) => s.room.players.length === 2 && s.room.players.every((p) => p.connected));

  const denied = await t.emit(guest, 'room:start-game');
  assert.equal(denied.error.code, 'HOST_ONLY');

  assert.equal((await t.emit(host, 'room:start-game')).ok, true);
  const playing = await t.until(guest, (s) => s.game?.phase === 'voting');
  assert.equal(playing.room.status, 'playing');

  // The second vote from the same player is ignored.
  await t.act(host, 'vote', { choice: 0 });
  await t.act(host, 'vote', { choice: 1 });
  const mid = await t.until(guest, (s) => s.game.view.votedIds.length === 1);
  assert.equal(mid.game.view.votes, null, 'votes stay hidden until the reveal');
  assert.equal((await t.act(guest, 'vote', { choice: 7 })).error.code, 'INVALID_CHOICE');

  for (let round = 1; round <= 3; round += 1) {
    await t.until(host, (s) => s.game?.phase === 'voting' && s.game.view.round === round);
    await t.act(host, 'vote', { choice: 0 });
    await t.act(guest, 'vote', { choice: 0 });
    await t.until(host, (s) => s.game?.phase === 'reveal');
    await t.act(host, 'next');
  }
  const done = await t.until(guest, (s) => s.room.status === 'results');
  assert.equal(done.room.lastResults.ranking.length, 2);
  assert.ok(done.room.lastResults.ranking.every((r) => r.score === 3));

  // A rematch starts a clean game.
  await t.emit(host, 'room:start-game');
  const again = await t.until(guest, (s) => s.game?.phase === 'voting');
  assert.equal(again.game.view.round, 1);
  assert.deepEqual(again.game.view.votedIds, []);
});

test('cannot start with too few players; host leaving transfers host', async () => {
  const { code, clients: [host, guest] } = await roomWith(['Asha', 'Bilal'], 'would-you-rather');
  await t.until(host, (s) => s.room.players.length === 2);
  await t.emit(host, 'room:leave');
  const after = await t.until(guest, (s) => s.room.players.length === 1);
  assert.equal(after.room.hostId, guest.state.you);
  assert.equal((await t.emit(guest, 'room:start-game')).error.code, 'NOT_ENOUGH_PLAYERS');
  assert.equal((await t.api(`/api/rooms/${code}`)).body.joinable.ok, true);
});

test('joining is blocked while a game is running', async () => {
  const { code, clients: [host] } = await roomWith(['Asha', 'Bilal']);
  await t.emit(host, 'room:start-game');
  const res = await t.api(`/api/rooms/${code}/join`, { name: 'Chen' });
  assert.equal(res.body.error.code, 'GAME_IN_PROGRESS');
});
