import { fail } from '../baseGame.js';

export const nameOf = (ctx, playerId) =>
  ctx.players.find((p) => p.id === playerId)?.name ?? 'Someone';

export const isParticipant = (state, playerId) => state.order.includes(playerId);

export function requireParticipant(state, playerId) {
  if (!isParticipant(state, playerId)) fail('NOT_IN_GAME', 'You are not part of this game. Wait for the next one!');
}

export function requireTurn(playerId, expected, message = 'Hold on, it is not your turn.') {
  if (playerId !== expected) fail('NOT_YOUR_TURN', message);
}

export function requireChoice(value, allowed, message = 'That is not a valid choice.') {
  if (!allowed.includes(value)) fail('INVALID_CHOICE', message);
}

export const initScores = (ids) => Object.fromEntries(ids.map((id) => [id, 0]));

export function addScore(state, playerId, points) {
  if (playerId in state.scores) state.scores[playerId] += points;
}

// Highest score first; equal scores share a rank.
export function ranking(scores, notes = {}) {
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  let rank = 0;
  return sorted.map(([playerId, score], i) => {
    if (i === 0 || score !== sorted[i - 1][1]) rank = i + 1;
    return { playerId, score, rank, note: notes[playerId] };
  });
}

export function winnersOf(scores) {
  const top = Math.max(...Object.values(scores));
  return Object.keys(scores).filter((id) => scores[id] === top);
}

export function headlineFor(ctx, scores, verb = 'wins') {
  const winners = winnersOf(scores);
  if (Object.values(scores).every((s) => s === 0)) return 'Game over. Friendships intact?';
  if (winners.length === 1) return `${nameOf(ctx, winners[0])} ${verb}!`;
  return `It's a tie between ${winners.map((id) => nameOf(ctx, id)).join(' & ')}!`;
}

// Players still in the game, in turn order. Used to skip people who left.
export const activeOrder = (state) => state.order.filter((id) => !state.left?.includes(id));

export function markLeft(state, playerId) {
  state.left = state.left || [];
  if (!state.left.includes(playerId)) state.left.push(playerId);
}

export const secondsFromNow = (ctx, seconds) => ctx.now + seconds * 1000;

// Draw prompts without repeats until the bank runs out, then reshuffle.
export function drawFrom(state, key, bank, rng) {
  state.used = state.used || {};
  const used = state.used[key] || [];
  let available = bank.map((_, i) => i).filter((i) => !used.includes(i));
  if (available.length === 0) {
    state.used[key] = [];
    available = bank.map((_, i) => i);
  }
  const index = available[rng.int(available.length)];
  state.used[key] = [...(state.used[key] || []), index];
  return bank[index];
}
