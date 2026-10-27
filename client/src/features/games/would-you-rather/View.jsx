import { useRoom } from '../../../hooks/useRoom.js';
import { ChoiceButtons, GameHud, HostButton, PlayerChips, StageCard } from '../shared/components.jsx';
import { usePlayers } from '../shared/usePlayers.js';

export default function WouldYouRatherView({ game }) {
  const { act, state } = useRoom();
  const { nameOf } = usePlayers();
  const v = game.view;
  const revealed = game.phase === 'reveal';
  const options = v.question.map((label, i) => ({ value: i, label }));
  const voteSeconds = state.room.settings.voteSeconds;

  return (
    <div className="stack" style={{ '--gap': '24px' }}>
      <GameHud kicker={`Question ${v.round} of ${v.totalRounds}`} title={revealed ? 'The verdict is in!' : 'Would you rather…'} deadline={game.deadline} total={revealed ? 7 : voteSeconds} />

      <StageCard tone="dark" kicker={revealed ? 'Results' : v.myVote === null ? 'Pick one' : 'Locked in'}>
        <ChoiceButtons options={options} value={v.myVote} disabled={revealed || v.myVote !== null} tally={v.tally} onChoose={(choice) => act('vote', { choice })} />
      </StageCard>

      {revealed && v.votes && (
        <div className="stack" style={{ '--gap': '10px' }}>
          {options.map((o) => {
            const ids = Object.keys(v.votes).filter((id) => v.votes[id] === o.value);
            return (
              <p key={o.value} className="muted">
                <strong className="text-marigold">{o.label}:</strong> {ids.length ? ids.map(nameOf).join(', ') : 'nobody'}
              </p>
            );
          })}
        </div>
      )}

      {!revealed && (
        <div className="stack" style={{ '--gap': '10px' }}>
          <p className="muted center">{v.votedIds.length} of {v.votedIds.length + v.waitingOn.length} have voted</p>
          <PlayerChips ids={[...v.votedIds, ...v.waitingOn]} marked={v.votedIds} label="Voting progress" />
        </div>
      )}

      {revealed && <HostButton onClick={() => act('next')}>{v.round >= v.totalRounds ? 'See final results' : 'Next question'}</HostButton>}
    </div>
  );
}
