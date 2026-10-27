import { test } from 'node:test';
import assert from 'node:assert/strict';
import game, { mafiaCountFor } from '../../src/games/mafia/index.js';
import { validateSettings } from '../../src/games/baseGame.js';
import { seededRng } from '../../src/utils/random.js';
import { AppError } from '../../src/utils/errors.js';

const NOW = 1_000_000;

function setup(count = 6, seed = 7, raw = {}) {
  const players = Array.from({ length: count }, (_, i) => ({ id: `p${i + 1}`, name: `Player ${i + 1}` }));
  const ctx = {
    players,
    connected: new Set(players.map((p) => p.id)),
    hostId: 'p1',
    settings: validateSettings(game.settings, raw),
    rng: seededRng(seed),
    now: NOW,
  };
  const state = game.create(ctx);
  const act = (playerId, type, payload = {}) => game.actions[type](state, { ...ctx, playerId, payload });
  const byRole = (role) => state.order.filter((id) => state.roles[id] === role);
  const view = (id) => game.view(state, id, ctx);
  const allReady = () => state.order.forEach((id) => act(id, 'ready'));
  return { ctx, state, act, byRole, view, allReady };
}

const throwsApp = (fn, code) => assert.throws(fn, (err) => err instanceof AppError && (!code || err.code === code));

test('role counts follow the player count', () => {
  assert.equal(mafiaCountFor(6), 1);
  assert.equal(mafiaCountFor(7), 1);
  assert.equal(mafiaCountFor(8), 2);
  assert.equal(mafiaCountFor(10), 2);
  assert.equal(mafiaCountFor(11), 3);
  assert.equal(mafiaCountFor(12), 3);
  for (const n of [6, 8, 11, 12]) {
    const { byRole } = setup(n);
    assert.equal(byRole('mafia').length, mafiaCountFor(n));
    assert.equal(byRole('doctor').length, 1);
    assert.equal(byRole('detective').length, 1);
    assert.equal(byRole('villager').length, n - mafiaCountFor(n) - 2);
  }
});

test('roles phase: ready moves to night once everyone is ready, repeat ready is harmless', () => {
  const { state, act, ctx } = setup();
  assert.equal(state.phase, 'roles');
  assert.equal(state.deadline, NOW + 15000);
  act('p1', 'ready');
  act('p1', 'ready');
  assert.deepEqual(state.ready, ['p1']);
  for (const id of state.order.slice(1)) act(id, 'ready');
  assert.equal(state.phase, 'night');
  assert.equal(state.night, 1);
  assert.equal(state.deadline, NOW + ctx.settings.nightSeconds * 1000);
});

test('roles phase times out into the night, and disconnected players are not waited for', () => {
  const a = setup();
  game.onTimeout(a.state, a.ctx);
  assert.equal(a.state.phase, 'night');

  const b = setup();
  b.ctx.connected.delete('p6');
  for (const id of ['p1', 'p2', 'p3', 'p4', 'p5']) b.act(id, 'ready');
  assert.equal(b.state.phase, 'night');
});

test('a full town win: mafia kill, doctor save, detective finds, town votes the mafia out', () => {
  const { state, act, byRole, view, allReady, ctx } = setup(6, 3);
  const [mafia] = byRole('mafia');
  const [doctor] = byRole('doctor');
  const [detective] = byRole('detective');
  const villagers = byRole('villager');
  allReady();

  // Night 1: mafia go for villager 0, doctor saves them, detective checks the mafia.
  act(mafia, 'nightTarget', { targetId: villagers[0] });
  act(doctor, 'protect', { targetId: villagers[0] });
  assert.equal(state.phase, 'night');
  act(detective, 'investigate', { targetId: mafia });
  assert.equal(state.phase, 'day');
  assert.equal(state.announcement.victimId, null);
  assert.match(state.announcement.text, /Nobody died/);
  assert.deepEqual(view(detective).investigations, [{ night: 1, targetId: mafia, result: 'mafia' }]);

  // Day 1: host skips, vote is split so nobody goes.
  act('p1', 'skipDiscussion');
  assert.equal(state.phase, 'voting');
  const living = [...state.alive];
  // Two votes for mafia, two for villagers[1], two skips: no strict plurality.
  const voters = living.filter((id) => id !== mafia && id !== villagers[1]);
  act(voters[0], 'vote', { targetId: mafia });
  act(voters[1], 'vote', { targetId: mafia });
  act(voters[2], 'vote', { targetId: villagers[1] });
  act(mafia, 'vote', { targetId: villagers[1] });
  act(voters[3], 'vote', { targetId: null });
  act(villagers[1], 'vote', { targetId: null });
  assert.equal(state.phase, 'night');
  assert.equal(state.lastVote.eliminatedId, null);
  assert.equal(state.alive.length, 6);

  // Night 2: mafia kill villager 1; the doctor cannot repeat villager 0 and protects themselves.
  throwsApp(() => act(doctor, 'protect', { targetId: villagers[0] }), 'INVALID_TARGET');
  act(doctor, 'protect', { targetId: doctor });
  act(detective, 'investigate', { targetId: villagers[0] });
  act(mafia, 'nightTarget', { targetId: villagers[1] });
  assert.equal(state.phase, 'day');
  assert.equal(state.announcement.victimId, villagers[1]);
  assert.equal(state.announcement.role, 'villager');
  assert.equal(view('p1').players.find((p) => p.id === villagers[1]).revealedRole, 'villager');
  assert.equal(view(detective).investigations.length, 2);
  assert.equal(view(detective).investigations[1].result, 'not mafia');

  // Day 2: discussion times out, then everyone votes the mafia out.
  game.onTimeout(state, ctx);
  assert.equal(state.phase, 'voting');
  for (const id of state.alive.filter((p) => p !== mafia)) act(id, 'vote', { targetId: mafia });
  act(mafia, 'vote', { targetId: null });
  assert.equal(state.finished, true);
  assert.equal(state.winner, 'town');
  const scores = Object.fromEntries(state.results.ranking.map((r) => [r.playerId, r.score]));
  assert.equal(scores[mafia], 0); // losing team, eliminated
  assert.equal(scores[villagers[1]], 1); // winning team, dead
  assert.equal(scores[doctor], 2);
  assert.equal(scores[detective], 2);
  assert.equal(state.results.reveal.winner, 'town');
  assert.equal(state.results.reveal.roles.length, 6);
  assert.equal(state.results.reveal.roles.find((r) => r.playerId === mafia).role, 'mafia');
  assert.match(state.results.headline, /town/i);
});

test('mafia win once they equal the town', () => {
  const { state, act, byRole, allReady, ctx } = setup(6, 11);
  const [mafia] = byRole('mafia');
  const others = state.order.filter((id) => id !== mafia);
  allReady();
  // Each round: mafia kill one, town votes a non-mafia out. 6 -> 5 -> 4 -> 3 -> 2 => mafia 1 vs town 1.
  let round = 0;
  while (!state.finished && round < 5) {
    round += 1;
    const victim = state.alive.find((id) => id !== mafia);
    act(mafia, 'nightTarget', { targetId: victim });
    game.onTimeout(state, ctx); // doctor and detective sleep in
    if (state.finished) break;
    act('p1', 'skipDiscussion');
    const scapegoat = state.alive.find((id) => id !== mafia);
    for (const id of state.alive) if (id !== scapegoat) act(id, 'vote', { targetId: scapegoat });
    if (state.phase === 'voting') act(scapegoat, 'vote', { targetId: null });
  }
  assert.equal(state.finished, true);
  assert.equal(state.winner, 'mafia');
  const scores = Object.fromEntries(state.results.ranking.map((r) => [r.playerId, r.score]));
  assert.equal(scores[mafia], 2);
  for (const id of others) assert.ok(scores[id] <= 1);
  assert.equal(state.results.ranking[0].playerId, mafia);
});

test('mafia votes: plurality wins, ties break by rng, no votes means no kill', () => {
  // 8 players => 2 mafia
  const { state, act, byRole, allReady, ctx } = setup(8, 5);
  const mafia = byRole('mafia');
  const villagers = byRole('villager');
  allReady();
  game.onTimeout(state, ctx); // nobody acted
  assert.equal(state.phase, 'day');
  assert.equal(state.announcement.victimId, null);

  act('p1', 'skipDiscussion');
  game.onTimeout(state, ctx); // nobody voted
  assert.equal(state.phase, 'night');
  assert.equal(state.lastVote.eliminatedId, null);

  // Split mafia vote: one of the two targets dies.
  act(mafia[0], 'nightTarget', { targetId: villagers[0] });
  act(mafia[1], 'nightTarget', { targetId: villagers[1] });
  game.onTimeout(state, ctx);
  assert.ok([villagers[0], villagers[1]].includes(state.announcement.victimId));
  assert.equal(state.alive.length, 7);
});

test('mafia can change their pick; the latest pick counts', () => {
  const { state, act, byRole, allReady, ctx } = setup(8, 5);
  const mafia = byRole('mafia');
  const villagers = byRole('villager');
  allReady();
  act(mafia[0], 'nightTarget', { targetId: villagers[0] });
  act(mafia[0], 'nightTarget', { targetId: villagers[2] });
  act(mafia[1], 'nightTarget', { targetId: villagers[2] });
  game.onTimeout(state, ctx);
  assert.equal(state.announcement.victimId, villagers[2]);
});

test('invalid night moves are rejected', () => {
  const { state, act, byRole, allReady } = setup(8, 5);
  const mafia = byRole('mafia');
  const [doctor] = byRole('doctor');
  const [detective] = byRole('detective');
  const [villager] = byRole('villager');
  throwsApp(() => act(mafia[0], 'nightTarget', { targetId: villager }), 'WRONG_PHASE');
  allReady();
  throwsApp(() => act(villager, 'nightTarget', { targetId: doctor }), 'NOT_YOUR_ROLE');
  throwsApp(() => act(villager, 'protect', { targetId: doctor }), 'NOT_YOUR_ROLE');
  throwsApp(() => act(villager, 'investigate', { targetId: doctor }), 'NOT_YOUR_ROLE');
  throwsApp(() => act(mafia[0], 'nightTarget', { targetId: mafia[1] }), 'INVALID_TARGET');
  throwsApp(() => act(mafia[0], 'nightTarget', { targetId: 'nobody' }), 'INVALID_TARGET');
  throwsApp(() => act(mafia[0], 'nightTarget', { targetId: 42 }), 'INVALID_TARGET');
  throwsApp(() => act(mafia[0], 'nightTarget', {}), 'INVALID_TARGET');
  throwsApp(() => act(detective, 'investigate', { targetId: detective }), 'INVALID_TARGET');
  throwsApp(() => act('stranger', 'ready'), 'WRONG_PHASE');
  throwsApp(() => act('stranger', 'nightTarget', { targetId: villager }), 'NOT_IN_GAME');
  throwsApp(() => act(villager, 'vote', { targetId: doctor }), 'WRONG_PHASE');
  throwsApp(() => act('p1', 'skipDiscussion'), 'WRONG_PHASE');

  // Detective acts once; same target again is a no-op, a different one is rejected.
  act(detective, 'investigate', { targetId: mafia[0] });
  act(detective, 'investigate', { targetId: mafia[0] });
  throwsApp(() => act(detective, 'investigate', { targetId: villager }), 'ALREADY_ACTED');
  assert.equal(state.investigations.length, 1);
  act(doctor, 'protect', { targetId: villager });
  throwsApp(() => act(doctor, 'protect', { targetId: doctor }), 'ALREADY_ACTED');
});

test('dead players cannot act or vote', () => {
  const { state, act, byRole, allReady } = setup(6, 3);
  const [mafia] = byRole('mafia');
  const [doctor] = byRole('doctor');
  const [detective] = byRole('detective');
  allReady();
  act(mafia, 'nightTarget', { targetId: detective });
  act(doctor, 'protect', { targetId: doctor });
  act(detective, 'investigate', { targetId: doctor });
  assert.equal(state.phase, 'day');
  assert.ok(!state.alive.includes(detective));
  act('p1', 'skipDiscussion');
  throwsApp(() => act(detective, 'vote', { targetId: mafia }), 'NOT_ALIVE');
  throwsApp(() => act(doctor, 'vote', { targetId: detective }), 'INVALID_TARGET');
  throwsApp(() => act(doctor, 'vote', { targetId: doctor }), 'INVALID_TARGET');
  // Skip the vote and check the dead detective cannot investigate at night.
  for (const id of state.alive) act(id, 'vote', { targetId: null });
  assert.equal(state.phase, 'night');
  throwsApp(() => act(detective, 'investigate', { targetId: mafia }), 'NOT_ALIVE');
  // Night now ends without waiting for the dead detective.
  act(mafia, 'nightTarget', { targetId: doctor });
  act(doctor, 'protect', { targetId: mafia });
  assert.equal(state.phase, 'day');
});

test('only the host can skip discussion', () => {
  const { state, act, allReady, ctx } = setup();
  allReady();
  game.onTimeout(state, ctx);
  assert.equal(state.phase, 'day');
  throwsApp(() => act('p2', 'skipDiscussion'), 'HOST_ONLY');
  assert.equal(game.view(state, 'p1', ctx).canSkipDiscussion, true);
  assert.equal(game.view(state, 'p2', ctx).canSkipDiscussion, false);
});

test('voting: votes can change, strict plurality required, skip plurality saves everyone', () => {
  const { state, act, allReady, ctx, byRole } = setup(6, 3);
  const [mafia] = byRole('mafia');
  const villagers = byRole('villager');
  allReady();
  game.onTimeout(state, ctx);
  act('p1', 'skipDiscussion');
  // 3 skips vs 2 votes: skip wins.
  const ids = state.order;
  act(ids[0], 'vote', { targetId: ids[1] });
  act(ids[0], 'vote', { targetId: null }); // changed mind
  assert.equal(state.votes[ids[0]], null);
  assert.equal(game.view(state, ids[0], ctx).hasVoted, true);
  act(ids[1], 'vote', { targetId: null });
  act(ids[2], 'vote', { targetId: null });
  act(ids[3], 'vote', { targetId: ids[4] });
  act(ids[4], 'vote', { targetId: ids[3] });
  game.onTimeout(state, ctx); // ids[5] never voted
  assert.equal(state.lastVote.eliminatedId, null);
  assert.equal(state.lastVote.skips, 3);
  assert.equal(state.phase, 'night');

  // Next day: 3 votes vs 2 skips eliminates.
  game.onTimeout(state, ctx);
  act('p1', 'skipDiscussion');
  const target = villagers[0];
  const others = state.alive.filter((id) => id !== target && id !== mafia);
  act(others[0], 'vote', { targetId: target });
  act(others[1], 'vote', { targetId: target });
  act(mafia, 'vote', { targetId: target });
  act(others[2], 'vote', { targetId: target });
  act(others[3], 'vote', { targetId: null });
  act(target, 'vote', { targetId: null });
  assert.equal(state.lastVote.eliminatedId, target);
  assert.deepEqual(state.lastVote.tally, { [target]: 4 });
  assert.equal(state.lastVote.role, 'villager');
  assert.equal(state.revealed[target], 'villager');
});

test('voting ends without waiting for disconnected players', () => {
  const { state, act, allReady, ctx } = setup(6, 3);
  allReady();
  game.onTimeout(state, ctx);
  act('p1', 'skipDiscussion');
  ctx.connected.delete('p6');
  for (const id of ['p1', 'p2', 'p3', 'p4', 'p5']) act(id, 'vote', { targetId: null });
  assert.equal(state.phase, 'night');
});

test('night ends early without disconnected actors', () => {
  const { state, act, byRole, allReady, ctx } = setup(6, 3);
  const [mafia] = byRole('mafia');
  const [doctor] = byRole('doctor');
  const [detective] = byRole('detective');
  allReady();
  ctx.connected.delete(detective);
  act(doctor, 'protect', { targetId: doctor });
  act(mafia, 'nightTarget', { targetId: doctor });
  assert.equal(state.phase, 'day');
  assert.equal(state.announcement.victimId, null);
});

test('a player leaving: removed without a reveal, votes on them cleared, win checked', () => {
  const { state, act, byRole, allReady, ctx } = setup(7, 9);
  const [mafia] = byRole('mafia');
  const villagers = byRole('villager');
  allReady();
  game.onTimeout(state, ctx);
  act('p1', 'skipDiscussion');
  act(villagers[0], 'vote', { targetId: villagers[1] });
  game.onPlayerLeft(state, { ...ctx, playerId: villagers[1] });
  assert.ok(!state.alive.includes(villagers[1]));
  assert.equal(state.revealed[villagers[1]], undefined);
  assert.ok(!(villagers[0] in state.votes));
  assert.equal(game.view(state, 'p1', ctx).players.find((p) => p.id === villagers[1]).left, true);
  assert.equal(state.phase, 'voting');

  // The only mafia leaving ends the game with a town win.
  game.onPlayerLeft(state, { ...ctx, playerId: mafia });
  assert.equal(state.finished, true);
  assert.equal(state.winner, 'town');
});

test('a leaving player can complete the night or vote', () => {
  const { state, act, byRole, allReady, ctx } = setup(6, 3);
  const [mafia] = byRole('mafia');
  const [doctor] = byRole('doctor');
  const [detective] = byRole('detective');
  allReady();
  act(mafia, 'nightTarget', { targetId: detective });
  act(doctor, 'protect', { targetId: detective });
  // The pending detective leaves. They were also the mafia's pick, so the mafia must re-pick.
  game.onPlayerLeft(state, { ...ctx, playerId: detective });
  assert.equal(state.phase, 'night');
  assert.equal(game.view(state, mafia, ctx).myMove.done, false);
  const [v1] = byRole('villager');
  act(mafia, 'nightTarget', { targetId: v1 });
  assert.equal(state.phase, 'day');
  assert.equal(state.announcement.victimId, v1);

  act('p1', 'skipDiscussion');
  const lastVoter = state.alive.find((id) => id !== mafia && id !== doctor);
  for (const id of state.alive.filter((p) => p !== lastVoter)) act(id, 'vote', { targetId: null });
  assert.equal(state.phase, 'voting');
  game.onPlayerLeft(state, { ...ctx, playerId: lastVoter }); // now everyone remaining has voted
  assert.equal(state.phase, 'night');
});

test('summarize mid-game gives survival points and reveals roles', () => {
  const { state, ctx } = setup();
  const s = game.summarize(state, ctx);
  assert.equal(s.ranking.length, 6);
  assert.ok(s.ranking.every((r) => r.score === 1));
  assert.equal(s.reveal.roles.length, 6);
});

// ---------- PRIVACY ----------

const ROLE_VALUES = ['"mafia"', '"doctor"', '"detective"', '"villager"'];

test('privacy: villagers see only their own role', () => {
  const { state, byRole, view, act, allReady } = setup(8, 5);
  const villagers = byRole('villager');
  const check = () => {
    for (const v of villagers) {
      const json = JSON.stringify(view(v));
      for (const role of ROLE_VALUES) if (role !== '"villager"') assert.ok(!json.includes(role), `${role} leaked to villager in ${state.phase}`);
      // "villager" appears once: their own role.
      assert.equal(json.split('"villager"').length - 1, 1);
      const vw = view(v);
      assert.equal(vw.teammates, null);
      assert.equal(vw.teamPicks, null);
      assert.equal(vw.investigations, null);
      assert.equal(vw.lastProtectedId, null);
      assert.equal(vw.myMove, null);
      assert.ok(!('roles' in vw));
    }
  };
  check();
  allReady();
  const mafia = byRole('mafia');
  act(mafia[0], 'nightTarget', { targetId: villagers[0] });
  act(byRole('detective')[0], 'investigate', { targetId: mafia[0] });
  act(byRole('doctor')[0], 'protect', { targetId: villagers[0] });
  assert.equal(state.phase, 'night');
  check();
  // Night picks never appear for town, not even as ids in a pick map.
  assert.ok(!JSON.stringify(view(villagers[1])).includes('mafiaVotes'));
});

test('privacy: mafia see their teammates and their picks, nobody else does', () => {
  const { state, byRole, view, act, allReady } = setup(11, 4);
  const mafia = byRole('mafia');
  assert.equal(mafia.length, 3);
  const mv = view(mafia[0]);
  assert.deepEqual(mv.teammates.map((t) => t.id).sort(), mafia.slice(1).sort());
  allReady();
  const [victim] = byRole('villager');
  act(mafia[0], 'nightTarget', { targetId: victim });
  assert.deepEqual(view(mafia[1]).teamPicks, { [mafia[0]]: victim });
  for (const id of state.order.filter((p) => !mafia.includes(p))) {
    const v = view(id);
    assert.equal(v.teamPicks, null);
    assert.equal(v.teammates, null);
  }
  // The doctor and detective don't learn the mafia either.
  const json = JSON.stringify(view(byRole('doctor')[0]));
  assert.ok(!json.includes('"mafia"'));
});

test('privacy: the detective sees only their own results; nobody sees night moves', () => {
  const { state, byRole, view, act, allReady, ctx } = setup(6, 3);
  const [mafia] = byRole('mafia');
  const [doctor] = byRole('doctor');
  const [detective] = byRole('detective');
  allReady();
  act(detective, 'investigate', { targetId: mafia });
  act(doctor, 'protect', { targetId: detective });
  act(mafia, 'nightTarget', { targetId: detective });
  assert.equal(state.phase, 'day');
  for (const id of state.order) {
    const v = view(id);
    if (id === detective) assert.deepEqual(v.investigations, [{ night: 1, targetId: mafia, result: 'mafia' }]);
    else assert.equal(v.investigations, null);
    if (id !== doctor) assert.equal(v.lastProtectedId, null);
    // The public announcement says nothing about who was targeted or saved.
    assert.equal(v.announcement.victimId, null);
    assert.ok(!JSON.stringify(v.announcement).includes(detective));
  }
  assert.equal(view(doctor).lastProtectedId, detective);
  // Results persist for the detective across rounds.
  act('p1', 'skipDiscussion');
  game.onTimeout(state, ctx);
  assert.equal(view(detective).investigations.length, 1);
});

test('privacy: dead players do not see living players\' roles', () => {
  const { state, byRole, view, act, allReady } = setup(8, 5);
  const mafia = byRole('mafia');
  const [villager] = byRole('villager');
  allReady();
  act(mafia[0], 'nightTarget', { targetId: villager });
  act(mafia[1], 'nightTarget', { targetId: villager });
  act(byRole('doctor')[0], 'protect', { targetId: byRole('doctor')[0] });
  act(byRole('detective')[0], 'investigate', { targetId: mafia[0] });
  assert.equal(state.phase, 'day');
  const v = view(villager);
  assert.equal(v.amAlive, false);
  const json = JSON.stringify(v);
  for (const role of ['"mafia"', '"doctor"', '"detective"']) assert.ok(!json.includes(role));
  // Only the dead villager's own (now public) role shows up.
  assert.equal(v.players.filter((p) => p.revealedRole).length, 1);
});
