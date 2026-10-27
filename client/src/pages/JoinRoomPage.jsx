import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../services/apiClient.js';
import { sessionService } from '../services/sessionService.js';
import { catalogEntry } from '../features/games/catalog.js';
import { Sparkle } from '../components/common/Decor.jsx';
import './FormPage.css';

const CODE_PATTERN = /^[A-HJ-NP-TV-Z2-9]{5}$/;
const cleanCode = (raw) => raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);

export default function JoinRoomPage() {
  const { code: codeParam } = useParams();
  const navigate = useNavigate();
  const [code, setCode] = useState(cleanCode(codeParam || ''));
  const [name, setName] = useState(sessionService.lastName);
  const [preview, setPreview] = useState({ status: 'idle' });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const existing = CODE_PATTERN.test(code) ? sessionService.get(code) : null;

  // Look the room up as soon as a full code is typed, so problems
  // (wrong code, full room, game running) show before the name step.
  useEffect(() => {
    if (!CODE_PATTERN.test(code)) {
      setPreview({ status: 'idle' });
      return undefined;
    }
    let cancelled = false;
    setPreview({ status: 'loading' });
    api.getRoom(code).then(
      (data) => !cancelled && setPreview({ status: 'found', ...data }),
      (err) => !cancelled && setPreview({ status: 'error', message: err.message }),
    );
    return () => {
      cancelled = true;
    };
  }, [code]);

  async function handleSubmit(event) {
    event.preventDefault();
    const nextErrors = {};
    if (!CODE_PATTERN.test(code)) nextErrors.code = 'Room codes are 5 characters, like K7Q2M.';
    if (name.trim().length < 2) nextErrors.name = 'Pick a name with at least 2 characters.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setSubmitting(true);
    try {
      const { session } = await api.joinRoom(code, { name: name.trim() });
      sessionService.save(session);
      sessionService.rememberName(name.trim());
      navigate(`/room/${session.roomCode}`);
    } catch (err) {
      setErrors({ submit: err.message });
      setSubmitting(false);
    }
  }

  const game = preview.status === 'found' ? catalogEntry(preview.room.gameId) : null;
  const blocked = preview.status === 'error' || (preview.status === 'found' && !preview.joinable.ok);

  return (
    <div className="container page form-page">
      <header className="form-head">
        <Sparkle size={44} color="var(--peacock)" className="form-flower" />
        <p className="eyebrow">Join a room</p>
        <h1 className="form-title">Got a code? Jump in.</h1>
        <p className="muted">Ask your host for the 5-character room code, or open their invite link.</p>
      </header>

      <form className="form-card card card-sticker stack" style={{ '--gap': '24px' }} onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label className="field-label" htmlFor="room-code">Room code</label>
          <input
            id="room-code"
            className="input input-code"
            value={code}
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck="false"
            placeholder="K7Q2M"
            aria-invalid={Boolean(errors.code)}
            aria-describedby="room-code-status"
            onChange={(e) => setCode(cleanCode(e.target.value))}
          />
          <div id="room-code-status" aria-live="polite">
            {errors.code && <p className="field-error">{errors.code}</p>}
            {preview.status === 'loading' && <p className="field-hint">Looking for that room…</p>}
            {preview.status === 'error' && <p className="field-error">{preview.message}</p>}
            {preview.status === 'found' && !preview.joinable.ok && <p className="field-error">{preview.joinable.message}</p>}
          </div>
        </div>

        {preview.status === 'found' && (
          <div className={`join-preview join-preview-${game.accent} anim-pop`}>
            <span className="join-preview-glyph" aria-hidden="true">{game.glyph}</span>
            <div>
              <p className="join-preview-title">{preview.room.hostName ? `${preview.room.hostName}'s room` : 'Room found'}</p>
              <p className="muted">{game.name} · {preview.room.playerCount}/{preview.room.capacity} players</p>
            </div>
          </div>
        )}

        {existing && (
          <div className="join-rejoin">
            <p>You already have a seat in this room.</p>
            <Link className="btn btn-peacock btn-sm" to={`/room/${code}`}>Rejoin the room</Link>
          </div>
        )}

        <div className="field">
          <label className="field-label" htmlFor="player-name">Your display name</label>
          <input
            id="player-name"
            className="input"
            value={name}
            maxLength={20}
            autoComplete="nickname"
            placeholder="e.g. Samosa Supreme"
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? 'player-name-error' : undefined}
            onChange={(e) => setName(e.target.value)}
          />
          {errors.name && <p id="player-name-error" className="field-error">{errors.name}</p>}
        </div>

        {errors.submit && <p className="field-error" role="alert">{errors.submit}</p>}
        <button className="btn btn-primary btn-lg btn-block" disabled={submitting || blocked}>
          {submitting ? 'Finding you a seat…' : 'Join room'}
        </button>
        <p className="muted center">No code? <Link to="/create">Start your own room</Link>.</p>
      </form>
    </div>
  );
}
