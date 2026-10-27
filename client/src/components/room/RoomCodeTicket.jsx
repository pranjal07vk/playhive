import { useState } from 'react';
import { copyText, inviteUrl } from '../../utils/format.js';
import { useToast } from '../feedback/Toast.jsx';
import './RoomCodeTicket.css';

export function RoomCodeTicket({ code }) {
  const toast = useToast();
  const [copied, setCopied] = useState(null);
  const url = inviteUrl(code);

  async function copy(what) {
    const ok = await copyText(what === 'code' ? code : url);
    if (ok) {
      setCopied(what);
      setTimeout(() => setCopied(null), 1800);
    } else {
      toast('Copy failed. Select the text and copy it manually.', 'error');
    }
  }

  async function share() {
    try {
      await navigator.share({ title: 'Join my PlayHive room', text: `Join my PlayHive room with code ${code}`, url });
    } catch {
      // Closing the share sheet is not an error worth reporting.
    }
  }

  return (
    <section className="ticket" aria-label="Room code and invite link">
      <p className="eyebrow">Room code</p>
      <p className="ticket-code numeric" aria-label={`Room code ${code.split('').join(' ')}`}>{code}</p>
      <div className="ticket-actions">
        <button className="btn btn-cream btn-sm" onClick={() => copy('code')}>{copied === 'code' ? 'Copied!' : 'Copy code'}</button>
        <button className="btn btn-primary btn-sm" onClick={() => copy('link')}>{copied === 'link' ? 'Link copied!' : 'Copy invite link'}</button>
        {typeof navigator.share === 'function' && <button className="btn btn-ghost btn-sm ticket-ghost" onClick={share}>Share…</button>}
      </div>
      <p className="ticket-url">{url}</p>
    </section>
  );
}
