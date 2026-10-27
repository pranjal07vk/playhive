import './ConnectionBanner.css';

export function ConnectionBanner({ status }) {
  if (status === 'connected') return null;
  return (
    <div className="conn-banner" role="status">
      <span className="conn-dot" aria-hidden="true" />
      {status === 'connecting' ? 'Connecting to the room…' : 'Connection lost. Reconnecting you to the same seat…'}
    </div>
  );
}
