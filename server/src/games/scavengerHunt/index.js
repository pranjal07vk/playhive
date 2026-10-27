import { fail, requirePhase } from '../baseGame.js';
import { initScores, markLeft, nameOf, ranking, requireChoice, requireParticipant, secondsFromNow } from '../shared/helpers.js';
import { cleanText } from '../../utils/text.js';
import { shuffle } from '../../utils/random.js';
import { CATEGORY_OPTIONS, taskList } from './content.js';

/*
 * Scavenger Hunt
 * Phases: hunting -> review -> finished
 * The host at game start is the referee and does not hunt. Hunters get a task
 * list (the same for everyone, or each their own random subset) and submit a
 * short text description as proof for each task. They may resubmit until the
 * deadline; the server timestamps every submission and refuses late ones.
 * The referee can end the hunt early. In review the referee approves or
 * rejects each submission; anything still unreviewed when the referee
 * finishes (or after 5 minutes) counts as approved.
 * Scoring: 1 point per approved task, plus 1 bonus in 'same' mode for the
 * earliest approved submission of each task. The app cannot check proof
 * itself; the referee is the judge. Photo upload is not implemented.
 */
const REVIEW_SECONDS = 300;
const PROOF_MIN = 3;
const PROOF_MAX = 200;
const VERDICTS = ['approve', 'reject'];

const isReferee = (state, playerId) => playerId === state.refereeId;
const statusOf = (sub) => (sub.verdict === 'approve' ? 'approved' : sub.verdict === 'reject' ? 'rejected' : 'pending');
const countOf = (state, hunterId) => Object.keys(state.submissions[hunterId] || {}).length;

function requireReferee(state, ctx) {
  requireParticipant(state, ctx.playerId);
  if (!isReferee(state, ctx.playerId)) fail('REFEREE_ONLY', 'Only the referee can do that.');
}

function startReview(state, ctx) {
  state.endsAt = null;
  // Without a referee (they left) or with nothing to judge, skip straight to the results.
  const anything = state.hunters.some((id) => countOf(state, id) > 0);
  if (state.refereeLeft || !anything) return finish(state, ctx);
  state.phase = 'review';
  state.deadline = secondsFromNow(ctx, REVIEW_SECONDS);
}

function score(state) {
  const scores = initScores(state.hunters);
  const earliest = {}; // taskId -> { at, hunters }
  for (const hunterId of state.hunters) {
    for (const [taskId, sub] of Object.entries(state.submissions[hunterId])) {
      if (sub.verdict !== 'approve') continue;
      scores[hunterId] += 1;
      const best = earliest[taskId];
      if (!best || sub.at < best.at) earliest[taskId] = { at: sub.at, hunters: [hunterId] };
      else if (sub.at === best.at) best.hunters.push(hunterId);
    }
  }
  const bonuses = initScores(state.hunters);
  if (state.mode === 'same') {
    for (const { hunters } of Object.values(earliest)) for (const id of hunters) bonuses[id] += 1;
    for (const id of state.hunters) scores[id] += bonuses[id];
  }
  return { scores, bonuses };
}

function summarize(state, ctx) {
  const { scores, bonuses } = score(state);
  const notes = Object.fromEntries(state.hunters.map((id) => {
    const approved = Object.values(state.submissions[id]).filter((s) => s.verdict === 'approve').length;
    return [id, `${approved}/${state.tasksByHunter[id].length} found${bonuses[id] ? `, ${bonuses[id]} first-finder bonus` : ''}`];
  }));
  const top = Math.max(0, ...Object.values(scores));
  const winners = state.hunters.filter((id) => scores[id] === top);
  const headline = top === 0
    ? 'Nobody found anything. The hunt continues another day.'
    : winners.length === 1 ? `${nameOf(ctx, winners[0])} is the master tracker!` : `It's a tie between ${winners.map((id) => nameOf(ctx, id)).join(' & ')}!`;
  const highlights = [`Refereed by ${nameOf(ctx, state.refereeId)}`];
  const rejected = state.hunters.reduce((n, id) => n + Object.values(state.submissions[id]).filter((s) => s.verdict === 'reject').length, 0);
  if (rejected) highlights.push(`${rejected} submission${rejected === 1 ? '' : 's'} did not convince the referee`);
  return { headline, ranking: ranking(scores, notes), highlights };
}

function finish(state, ctx) {
  // Anything the referee did not get to counts as approved.
  for (const id of state.hunters) {
    for (const sub of Object.values(state.submissions[id])) if (!sub.verdict) Object.assign(sub, { verdict: 'approve', auto: true });
  }
  state.phase = 'finished';
  state.deadline = null;
  state.finished = true;
  state.results = summarize(state, ctx);
}

function hunterSheet(state, hunterId) {
  return {
    hunterId,
    tasks: state.tasksByHunter[hunterId].map((taskId) => {
      const sub = state.submissions[hunterId][taskId];
      return { id: taskId, text: state.tasks[taskId], submission: sub ? { text: sub.text, at: sub.at, status: statusOf(sub) } : null };
    }),
  };
}

export default {
  meta: {
    id: 'scavenger-hunt',
    order: 10,
    name: 'Scavenger Hunt',
    tagline: 'Find it, describe it, convince the referee.',
    minPlayers: 2,
    maxPlayers: 12,
    duration: '5–20 min',
    vibe: 'Active',
    howToPlay: [
      'The host is the referee and does not hunt. Everyone else gets a list of things to find.',
      'For each task, type a short description of what you found as proof. Photos are not supported yet, so describe well!',
      'You can update a proof until time runs out. Late submissions do not count.',
      'The referee approves or rejects each proof. Every approved task is a point.',
      'With the same list for everyone, the first approved find of each task earns a bonus point.',
    ],
  },
  settings: [
    { key: 'taskCount', label: 'Tasks', type: 'number', min: 3, max: 10, default: 6 },
    { key: 'minutes', label: 'Minutes to hunt', type: 'number', min: 2, max: 15, default: 5 },
    { key: 'category', label: 'Where', type: 'select', options: CATEGORY_OPTIONS, default: 'home' },
    { key: 'mode', label: 'Task lists', type: 'select', options: [{ value: 'same', label: 'Same list for everyone' }, { value: 'different', label: 'Different list each' }], default: 'same' },
  ],

  create(ctx) {
    const order = ctx.players.map((p) => p.id);
    const refereeId = ctx.hostId && order.includes(ctx.hostId) ? ctx.hostId : order[0];
    const hunters = order.filter((id) => id !== refereeId);
    const bank = taskList(ctx.settings.category);
    const deal = () => shuffle(bank, ctx.rng).slice(0, ctx.settings.taskCount);
    const shared = deal();
    const tasks = {};
    const tasksByHunter = {};
    for (const id of hunters) {
      const mine = ctx.settings.mode === 'same' ? shared : deal();
      for (const t of mine) tasks[t.id] = t.text;
      tasksByHunter[id] = mine.map((t) => t.id);
    }
    return {
      order,
      left: [],
      refereeId,
      refereeLeft: false,
      hunters,
      mode: ctx.settings.mode,
      tasks,
      tasksByHunter,
      submissions: Object.fromEntries(hunters.map((id) => [id, {}])),
      phase: 'hunting',
      endsAt: secondsFromNow(ctx, ctx.settings.minutes * 60),
      deadline: secondsFromNow(ctx, ctx.settings.minutes * 60),
    };
  },

  actions: {
    submit(state, ctx) {
      requireParticipant(state, ctx.playerId);
      if (isReferee(state, ctx.playerId)) fail('REFEREE_CANNOT_HUNT', 'You are the referee this time, no hunting!');
      if (state.phase !== 'hunting' || ctx.now > state.endsAt) fail('TOO_LATE', 'Too late! The hunt is over, so this one does not count.');
      requireChoice(ctx.payload.taskId, state.tasksByHunter[ctx.playerId], 'That task is not on your list.');
      const text = cleanText(ctx.payload.text, PROOF_MAX);
      if (text.length < PROOF_MIN) fail('INVALID_PROOF', `Describe what you found (${PROOF_MIN}–${PROOF_MAX} characters).`);
      const existing = state.submissions[ctx.playerId][ctx.payload.taskId];
      if (existing?.text === text) return; // same proof again: keep the original time
      state.submissions[ctx.playerId][ctx.payload.taskId] = { text, at: ctx.now, verdict: null };
    },

    endHunt(state, ctx) {
      requirePhase(state, 'hunting');
      requireReferee(state, ctx);
      startReview(state, ctx);
    },

    judge(state, ctx) {
      requirePhase(state, 'review');
      requireReferee(state, ctx);
      const { hunterId, taskId, verdict } = ctx.payload;
      requireChoice(hunterId, state.hunters, 'That player is not hunting.');
      if (typeof taskId !== 'string' || !Object.hasOwn(state.submissions[hunterId], taskId)) fail('NO_SUBMISSION', 'There is nothing to judge for that task.');
      requireChoice(verdict, VERDICTS);
      state.submissions[hunterId][taskId].verdict = verdict; // the referee may change their mind until finishReview
    },

    finishReview(state, ctx) {
      requirePhase(state, 'review');
      requireReferee(state, ctx);
      finish(state, ctx);
    },
  },

  onTimeout(state, ctx) {
    if (state.phase === 'hunting') startReview(state, ctx);
    else if (state.phase === 'review') finish(state, ctx);
  },

  onPlayerLeft(state, ctx) {
    markLeft(state, ctx.playerId);
    if (!isReferee(state, ctx.playerId)) return; // a hunter's finds still count
    // No referee means nobody can judge: the hunt runs to its deadline and everything counts.
    state.refereeLeft = true;
    if (state.phase === 'review') finish(state, ctx);
  },

  summarize,

  /*
   * View fields:
   *   refereeId, isReferee   who judges; true for the referee
   *   mode, refereeLeft      'same' | 'different'; true if the referee left (everything is auto-approved)
   *   endsAt                 hunting: ms epoch when submissions close
   *   myTasks                hunters: [{ id, text, submission: { text, at, status: 'pending' | 'approved' | 'rejected' } | null }]
   *   counts                 { hunterId: number of tasks submitted } for every hunter
   *   sheets                 referee always, everyone during review: [{ hunterId, tasks: [same shape as myTasks] }]
   *   leftIds                players who left
   */
  view(state, playerId) {
    const referee = isReferee(state, playerId);
    const showAll = referee || state.phase === 'review';
    return {
      refereeId: state.refereeId,
      isReferee: referee,
      mode: state.mode,
      refereeLeft: state.refereeLeft,
      endsAt: state.phase === 'hunting' ? state.endsAt : null,
      myTasks: state.hunters.includes(playerId) ? hunterSheet(state, playerId).tasks : null,
      counts: Object.fromEntries(state.hunters.map((id) => [id, countOf(state, id)])),
      sheets: showAll ? state.hunters.map((id) => hunterSheet(state, id)) : null,
      leftIds: state.left,
    };
  },
};
