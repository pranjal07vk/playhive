import { useEffect, useRef, useState } from 'react';
import { useRoom } from '../../hooks/useRoom.js';
import { useGames } from '../../features/games/useGames.js';
import { catalogEntry } from '../../features/games/catalog.js';
import { RoomCodeTicket } from './RoomCodeTicket.jsx';
import { PlayerList } from './PlayerList.jsx';
import { SettingsForm } from './SettingsForm.jsx';
import { GamePicker } from './GamePicker.jsx';
import { useToast } from '../feedback/Toast.jsx';
import { plural } from '../../utils/format.js';
import './LobbyView.css';

const MOODS = ['Gather your gang.', 'The room is getting louder.', 'Waiting for the usual latecomers…', 'Ready, set, chaos.'];

export function LobbyView({ onLeave }) {
  const room = useRoom();
  const { state, me, isHost } = room;
  const { games } = useGames();
  const toast = useToast();
  const info = state.room;
  const game = games?.find((g) => g.id === info.gameId);
  const visual = catalogEntry(info.gameId);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draft, setDraft] = useState(info.settings);
  const pending = useRef(null);

  // Keep the host's sliders smooth: show changes immediately, send them
  // to the server a moment after the host stops dragging.
  useEffect(() => setDraft(info.settings), [info.settings]);
  function changeSetting(key, value) {
    setDraft((d) => ({ ...d, [key]: value }));
    clearTimeout(pending.current);
    pending.current = setTimeout(() => room.updateSettings({ [key]: value }), 250);
  }
  useEffect(() => () => clearTimeout(pending.current), []);

  const count = info.players.length;
  const missing = Math.max(0, info.minPlayers - count);
  const tooMany = game && count > game.maxPlayers;
  const others = info.players.filter((p) => !p.isHost);
  const readyCount = others.filter((p) => p.ready).length;
  const mood = MOODS[Math.min(MOODS.length - 1, Math.floor(count / 2))];

  async function chooseGame(id) {
    const res = await room.selectGame(id);
    if (res.ok) {
      setPickerOpen(false);
      toast(`Switched to ${catalogEntry(id).name}`, 'success');
    }
  }

  return (
    <div className="container lobby">
      <header className="lobby-head">
        <p className="eyebrow">Lobby · {plural(count, 'player')}</p>
        <h1 className="lobby-title">{mood}</h1>
      </header>

      <div className="lobby-grid">
        <div className="stack lobby-side" style={{ '--gap': '20px' }}>
          <RoomCodeTicket code={info.code} />

          <section className={`card lobby-game lobby-game-${visual.accent}`} aria-labelledby="lobby-game-name">
            <div className="row spread">
              <span className="lobby-game-glyph" aria-hidden="true">{visual.glyph}</span>
              <span className="badge badge-outline numeric">{info.minPlayers}–{game?.maxPlayers ?? info.capacity} players</span>
            </div>
            <h2 id="lobby-game-name">{game?.name ?? visual.name}</h2>
            <p className="muted">{game?.tagline}</p>
            {game?.howToPlay && (
              <ol className="lobby-rules">
                {game.howToPlay.map((rule) => <li key={rule}>{rule}</li>)}
              </ol>
            )}
            {isHost && games && (
              <button className="btn btn-ghost btn-sm" aria-expanded={pickerOpen} onClick={() => setPickerOpen((o) => !o)}>
                {pickerOpen ? 'Keep this game' : 'Change game'}
              </button>
            )}
          </section>
        </div>

        <div className="stack" style={{ '--gap': '20px' }}>
          {pickerOpen && isHost && (
            <section className="card anim-rise">
              <GamePicker games={games} value={info.gameId} onChange={chooseGame} playerCount={count} name="lobby-game" />
            </section>
          )}

          <section className="card" aria-labelledby="players-heading">
            <div className="row spread" style={{ marginBottom: 14 }}>
              <h2 id="players-heading" className="lobby-h">The gang</h2>
              <span className="numeric muted">{count}/{info.capacity}</span>
            </div>
            <PlayerList players={info.players} meId={me?.id} isHost={isHost} onKick={(p) => room.kick(p.id)} />
            {count < 2 && <p className="lobby-empty muted">It is quiet in here… share the code above to fill the room.</p>}
          </section>

          <section className="card" aria-labelledby="settings-heading">
            <div className="row spread" style={{ marginBottom: 14 }}>
              <h2 id="settings-heading" className="lobby-h">House rules</h2>
              {!isHost && <span className="badge badge-outline">Host decides</span>}
            </div>
            <SettingsForm definitions={game?.settings} values={isHost ? draft : info.settings} onChange={changeSetting} disabled={!isHost} idPrefix="lobby" />
          </section>

          <section className="lobby-actions card card-sticker" aria-live="polite">
            {isHost ? (
              <>
                <div>
                  <p className="lobby-h">
                    {missing > 0 ? `Need ${plural(missing, 'more player')}` : tooMany ? 'Too many players for this game' : 'Everyone in? Let’s go.'}
                  </p>
                  <p className="muted">
                    {missing > 0
                      ? `${game?.name ?? 'This game'} needs at least ${info.minPlayers} players.`
                      : tooMany
                        ? `Pick another game or ask ${count - game.maxPlayers} to sit out.`
                        : `${readyCount}/${others.length} marked ready. You can start any time.`}
                  </p>
                </div>
                <button className="btn btn-primary btn-lg" disabled={missing > 0 || tooMany} onClick={room.startGame}>
                  Start game
                </button>
              </>
            ) : (
              <>
                <div>
                  <p className="lobby-h">Waiting for the host to start…</p>
                  <p className="muted">Tap ready so the host knows you are here.</p>
                </div>
                <button className={`btn btn-lg ${me?.ready ? 'btn-parrot' : 'btn-cream'}`} aria-pressed={Boolean(me?.ready)} onClick={() => room.setReady(!me?.ready)}>
                  {me?.ready ? 'Ready ✓' : 'I’m ready'}
                </button>
              </>
            )}
          </section>

          <button className="btn btn-ghost lobby-leave" onClick={onLeave}>Leave room</button>
        </div>
      </div>
    </div>
  );
}
