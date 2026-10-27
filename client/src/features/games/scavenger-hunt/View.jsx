import { useState } from 'react';
import { useRoom } from '../../../hooks/useRoom.js';
import { GameHud, StageCard } from '../shared/components.jsx';
import { usePlayers } from '../shared/usePlayers.js';
import './View.css';

const REVIEW_SECONDS = 300;
const PROOF_MIN = 3;
const PROOF_MAX = 200;
const STATUS = {
  none: { icon: '○', text: 'Not found yet', cls: 'none' },
  pending: { icon: '⏳', text: 'Submitted', cls: 'pending' },
  approved: { icon: '✓', text: 'Approved', cls: 'approved' },
  rejected: { icon: '✕', text: 'Rejected', cls: 'rejected' },
};

function StatusChip({ submission }) {
  const s = STATUS[submission?.status ?? 'none'];
  return <span className={`sh-status sh-status-${s.cls}`}><span aria-hidden="true">{s.icon}</span> {s.text}</span>;
}

export default function ScavengerHuntView({ game }) {
  const { state } = useRoom();
  const { nameOf } = usePlayers();
  const v = game.view;
  const hunting = game.phase === 'hunting';
  const refName = nameOf(v.refereeId);
  const title = hunting
    ? v.isReferee ? 'You are the referee.' : 'Go go go!'
    : v.isReferee ? 'Judgement time.' : `${refName} is judging…`;

  return (
    <div className="sh stack" style={{ '--gap': '20px' }}>
      <GameHud
        kicker={`${hunting ? 'The hunt' : 'Review'} · ${v.mode === 'same' ? 'Same list for all' : 'Everyone has their own list'}`}
        title={title}
        deadline={hunting ? v.endsAt : game.deadline}
        total={hunting ? state.room.settings.minutes * 60 : REVIEW_SECONDS}
      />
      {v.refereeLeft && <p className="sh-banner" role="status">The referee left, so every submission will count automatically.</p>}

      {v.isReferee ? <RefereeDesk game={game} /> : (
        <>
          {v.myTasks ? <HunterList game={game} /> : (
            <StageCard tone="dark" kicker="Watching"><p>The hunters are out there somewhere. You can follow their progress below.</p></StageCard>
          )}
          {!hunting && v.sheets && (
            <section className="stack" style={{ '--gap': '12px' }} aria-label="Everyone's finds">
              <h3>Everyone's finds</h3>
              <Sheets sheets={v.sheets} />
            </section>
          )}
          {hunting && <Leaderboard counts={v.counts} total={v.myTasks?.length} />}
        </>
      )}
    </div>
  );
}

function HunterList({ game }) {
  const v = game.view;
  const hunting = game.phase === 'hunting';
  const done = v.myTasks.filter((t) => t.submission).length;
  return (
    <section className="stack" style={{ '--gap': '14px' }} aria-label="Your tasks">
      <p className="sh-progress" aria-live="polite">
        <strong className="numeric">{done}/{v.myTasks.length}</strong> submitted
        {hunting ? '. Describe what you found; the referee decides if it counts.' : '. No more changes now.'}
      </p>
      <ol className="sh-tasks">
        {v.myTasks.map((t, i) => <TaskCard key={t.id} task={t} index={i} hunting={hunting} />)}
      </ol>
    </section>
  );
}

function TaskCard({ task, index, hunting }) {
  const { act } = useRoom();
  const sub = task.submission;
  const [draft, setDraft] = useState(sub?.text ?? '');
  const [busy, setBusy] = useState(false);
  const clean = draft.trim().replace(/\s+/g, ' ');
  const valid = clean.length >= PROOF_MIN;
  const unchanged = sub && clean === sub.text;
  const id = `sh-proof-${task.id}`;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    await act('submit', { taskId: task.id, text: clean });
    setBusy(false);
  };

  return (
    <li className={`sh-task sh-task-${sub?.status ?? 'none'}`} style={{ '--tilt': `${index % 2 ? 0.6 : -0.6}deg` }}>
      <div className="sh-task-head">
        <span className="sh-task-num numeric" aria-hidden="true">{index + 1}</span>
        <h4 className="sh-task-text">{task.text}</h4>
        <StatusChip submission={sub} />
      </div>
      {hunting ? (
        <form className="stack" style={{ '--gap': '8px' }} onSubmit={submit}>
          <label className="sr-only" htmlFor={id}>Proof for: {task.text}</label>
          <textarea id={id} className="textarea sh-textarea" value={draft} maxLength={PROOF_MAX} placeholder="What did you find? Be specific so the referee believes you." onChange={(e) => setDraft(e.target.value)} />
          <div className="row spread">
            <span className="field-hint">{draft.length}/{PROOF_MAX}</span>
            <button className="btn btn-parrot btn-sm sh-submit" type="submit" disabled={!valid || unchanged || busy}>
              {sub ? (unchanged ? 'Saved ✓' : 'Update') : 'Submit'}
            </button>
          </div>
        </form>
      ) : (
        <p className="sh-proof">{sub ? `“${sub.text}”` : 'Nothing submitted.'}</p>
      )}
    </li>
  );
}

function Leaderboard({ counts, total }) {
  const { nameOf, meId, byId } = usePlayers();
  const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return (
    <section className="card sh-board" aria-label="Hunt progress">
      <p className="eyebrow">Hunt progress</p>
      <ul>
        {rows.map(([id, n]) => (
          <li key={id}>
            <span>{nameOf(id)}{id === meId ? ' (you)' : ''}{byId(id).left ? ' (left)' : !byId(id).connected ? ' (offline)' : ''}</span>
            <span className="numeric">{n}{total ? `/${total}` : ''} found</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Sheets({ sheets, judge }) {
  const { nameOf, byId } = usePlayers();
  return (
    <div className="sh-sheets">
      {sheets.map((sheet) => {
        const found = sheet.tasks.filter((t) => t.submission).length;
        return (
          <section key={sheet.hunterId} className="sh-sheet" aria-label={`${nameOf(sheet.hunterId)}'s sheet`}>
            <header className="row spread">
              <h4>{nameOf(sheet.hunterId)}{byId(sheet.hunterId).left ? ' (left)' : ''}</h4>
              <span className="badge badge-cream numeric">{found}/{sheet.tasks.length}</span>
            </header>
            <ul>
              {sheet.tasks.map((t) => (
                <li key={t.id} className="sh-row">
                  <div className="sh-row-text">
                    <span className="sh-row-task">{t.text}</span>
                    <span className={t.submission ? 'sh-row-proof' : 'muted'}>{t.submission ? `“${t.submission.text}”` : '—'}</span>
                  </div>
                  {judge && t.submission ? <Verdict hunterId={sheet.hunterId} task={t} judge={judge} /> : <StatusChip submission={t.submission} />}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function Verdict({ hunterId, task, judge }) {
  const status = task.submission.status;
  return (
    <div className="sh-verdict" role="group" aria-label={`Verdict for ${task.text}`}>
      <button type="button" className="sh-vbtn sh-vbtn-yes" aria-pressed={status === 'approved'} onClick={() => judge(hunterId, task.id, 'approve')}>
        <span aria-hidden="true">✓</span> Approve
      </button>
      <button type="button" className="sh-vbtn sh-vbtn-no" aria-pressed={status === 'rejected'} onClick={() => judge(hunterId, task.id, 'reject')}>
        <span aria-hidden="true">✕</span> Reject
      </button>
    </div>
  );
}

function RefereeDesk({ game }) {
  const { act } = useRoom();
  const v = game.view;
  const hunting = game.phase === 'hunting';
  const sheets = v.sheets ?? [];
  const pending = sheets.reduce((n, s) => n + s.tasks.filter((t) => t.submission?.status === 'pending').length, 0);
  const judge = (hunterId, taskId, verdict) => act('judge', { hunterId, taskId, verdict });

  return (
    <div className="stack" style={{ '--gap': '16px' }}>
      <StageCard tone="peacock" kicker={hunting ? 'Referee desk' : 'Courtroom'}>
        <p className="sh-ref-copy">
          {hunting
            ? 'Hunters are submitting proof live. You do not hunt; you judge. End the hunt early once everyone is back.'
            : pending ? `${pending} submission${pending === 1 ? '' : 's'} still waiting for a verdict. Anything you skip counts as approved.` : 'Everything is judged. Tap Finish review to reveal the scores.'}
        </p>
        {hunting
          ? <button className="btn btn-primary btn-lg" onClick={() => act('endHunt')}>End hunt now</button>
          : <button className="btn btn-marigold btn-lg" onClick={() => act('finishReview')}>Finish review</button>}
      </StageCard>
      <p className="muted" aria-live="polite">{hunting ? 'Live view of every hunter\'s sheet:' : 'Approve or reject each proof. You can change your mind until you finish.'}</p>
      <Sheets sheets={sheets} judge={hunting ? null : judge} />
    </div>
  );
}
