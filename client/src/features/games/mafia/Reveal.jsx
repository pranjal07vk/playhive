import { useRoom } from '../../../hooks/useRoom.js';
import { Avatar } from '../../../components/common/Avatar.jsx';
import { roleOf } from './roles.js';
import './View.css';

// Results screen: who was who, and which side won.
export default function MafiaReveal({ reveal }) {
  const { state } = useRoom();
  const results = state.room.lastResults;
  const live = new Map(state.room.players.map((p) => [p.id, p]));
  const nameOf = (id) => results?.ranking.find((r) => r.playerId === id)?.name ?? live.get(id)?.name ?? 'Someone';
  const winner = reveal.winner;
  const sides = [
    { key: 'mafia', title: '🗡️ The Mafia', roles: reveal.roles.filter((r) => r.role === 'mafia') },
    { key: 'town', title: '🏡 The Town', roles: reveal.roles.filter((r) => r.role !== 'mafia') },
  ];

  return (
    <div className="card card-sticker stack maf-reveal" style={{ '--gap': '16px' }}>
      <h2 className="maf-reveal-title">
        {winner === 'mafia' ? 'The Mafia win! 🗡️' : winner === 'town' ? 'The Town wins! 🏡' : 'No winner this time'}
      </h2>
      {sides.map((side) => (
        <section key={side.key} aria-label={side.title} className={`maf-reveal-side ${winner === side.key ? 'maf-reveal-won' : ''}`}>
          <p className="eyebrow">{side.title}{winner === side.key ? ' · Winners' : ''}</p>
          <ul className="maf-reveal-grid">
            {side.roles.map((r) => {
              const role = roleOf(r.role);
              return (
                <li key={r.playerId} className={`maf-reveal-card maf-tone-${role.tone}`}>
                  <Avatar player={live.get(r.playerId) ?? { avatar: 0, connected: false }} size={40} />
                  <strong>{nameOf(r.playerId)}</strong>
                  <span>{role.icon} {role.label}</span>
                  <span className="maf-reveal-status">{r.alive ? 'Survived' : '💀 Out'}</span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
