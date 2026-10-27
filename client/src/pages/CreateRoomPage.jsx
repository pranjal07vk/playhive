import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../services/apiClient.js';
import { sessionService } from '../services/sessionService.js';
import { useGames } from '../features/games/useGames.js';
import { GamePicker } from '../components/room/GamePicker.jsx';
import { SettingsForm } from '../components/room/SettingsForm.jsx';
import { ErrorState, LoadingState } from '../components/feedback/States.jsx';
import { Marigold } from '../components/common/Decor.jsx';
import './FormPage.css';

const defaultsFor = (game) => Object.fromEntries((game?.settings || []).map((s) => [s.key, s.default]));

export default function CreateRoomPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { games, error, reload } = useGames();
  const [name, setName] = useState(sessionService.lastName);
  const [gameId, setGameId] = useState(params.get('game') || 'would-you-rather');
  const [settings, setSettings] = useState({});
  const [nameError, setNameError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const game = games?.find((g) => g.id === gameId) ?? games?.[0];

  useEffect(() => {
    if (game) setSettings(defaultsFor(game));
  }, [game]);

  if (error) {
    return (
      <div className="container page">
        <ErrorState
          title="The server is not answering."
          message={`${error.message} If the app was asleep it can take up to a minute to wake up.`}
          action={<button className="btn btn-marigold" onClick={reload}>Try again</button>}
        />
      </div>
    );
  }
  if (!games) return <div className="container page"><LoadingState label="Fetching the game shelf…" /></div>;

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitError('');
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setNameError('Pick a name with at least 2 characters.');
      return;
    }
    setNameError('');
    setSubmitting(true);
    try {
      const { session } = await api.createRoom({ name: trimmed, gameId: game.id, settings });
      sessionService.save(session);
      sessionService.rememberName(trimmed);
      navigate(`/room/${session.roomCode}`);
    } catch (err) {
      setSubmitError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <div className="container page form-page">
      <header className="form-head">
        <Marigold size={60} className="form-flower" />
        <p className="eyebrow">New room</p>
        <h1 className="form-title">Gather your gang.</h1>
        <p className="muted">You will be the host: you pick the game, tweak the rules and press start.</p>
      </header>

      <form className="form-card card card-sticker stack" style={{ '--gap': '28px' }} onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label className="field-label" htmlFor="host-name">Your display name</label>
          <input
            id="host-name"
            className="input"
            value={name}
            maxLength={20}
            autoComplete="nickname"
            placeholder="e.g. Chai Champion"
            aria-invalid={Boolean(nameError)}
            aria-describedby={nameError ? 'host-name-error' : 'host-name-hint'}
            onChange={(e) => setName(e.target.value)}
          />
          {nameError ? <p id="host-name-error" className="field-error">{nameError}</p> : <p id="host-name-hint" className="field-hint">2–20 characters. This is what your friends will see.</p>}
        </div>

        <GamePicker games={games} value={game.id} onChange={setGameId} />

        <section className="form-settings stack" aria-labelledby="settings-heading">
          <div className="row spread">
            <h2 id="settings-heading" className="form-subtitle">{game.name} settings</h2>
            <span className="badge badge-outline numeric">{game.minPlayers}–{game.maxPlayers} players</span>
          </div>
          <SettingsForm definitions={game.settings} values={settings} onChange={(k, v) => setSettings((s) => ({ ...s, [k]: v }))} idPrefix="create" />
        </section>

        {submitError && <p className="field-error" role="alert">{submitError}</p>}
        <button className="btn btn-primary btn-lg btn-block" disabled={submitting}>
          {submitting ? 'Opening the room…' : 'Create room'}
        </button>
      </form>
    </div>
  );
}
