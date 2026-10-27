import { Link } from 'react-router-dom';
import { Marigold } from '../common/Decor.jsx';
import './States.css';

export function LoadingState({ label = 'Warming up the room…' }) {
  return (
    <div className="state-block" role="status">
      <Marigold size={72} className="state-spin" />
      <p className="state-title">{label}</p>
    </div>
  );
}

export function ErrorState({ title = 'Uh-oh.', message, action }) {
  return (
    <div className="state-block card card-sticker" role="alert">
      <p className="badge badge-gulal badge-tilt">Oops</p>
      <h2 className="state-title">{title}</h2>
      {message && <p className="muted">{message}</p>}
      <div className="row" style={{ justifyContent: 'center' }}>
        {action ?? (
          <Link className="btn btn-marigold" to="/">
            Back home
          </Link>
        )}
      </div>
    </div>
  );
}
