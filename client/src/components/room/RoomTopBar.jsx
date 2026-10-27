import { LogoMark } from '../common/Logo.jsx';
import './RoomTopBar.css';

export function RoomTopBar({ code, title, onLeave, children }) {
  return (
    <header className="room-bar">
      <div className="container room-bar-inner">
        <div className="row" style={{ '--gap': '10px' }}>
          <LogoMark size={32} />
          <div className="room-bar-text">
            <span className="room-bar-title">{title}</span>
            <span className="room-bar-code numeric">Room {code}</span>
          </div>
        </div>
        <div className="row" style={{ '--gap': '8px' }}>
          {children}
          <button className="btn btn-ghost btn-sm" onClick={onLeave}>Leave</button>
        </div>
      </div>
    </header>
  );
}
