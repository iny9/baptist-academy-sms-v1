'use client';
import { useState } from 'react';

// Administrators are the only accounts that sign in with an email (they reset a forgotten password by email).
export default function InviteForm() {
  const [out, setOut] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    const emails = String(new FormData(e.target).get('emails')).split(/[\s,;]+/).filter(Boolean);
    setBusy(true);
    try {
      const res = await fetch('/api/invite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ emails, roles: [{ role: 'admin', section: null }] }) });
      setOut(await res.json());
    } catch { setOut({ error: 'Could not reach the server. Check your connection.' }); }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="panel">
      <h2 style={{ marginTop: 0 }}>Administrators (sign in with email)</h2>
      <p className="auth-hint">Only administrators are added by email. They receive an invitation, set a password, and can reset it by email if they forget it.</p>
      <label htmlFor="emails">Email address(es), separated by commas, spaces or new lines</label>
      <textarea id="emails" name="emails" required rows={2} />
      <p><button className="btn" disabled={busy}>{busy ? 'Sending…' : 'Send administrator invitation'}</button></p>
      {out?.error && <div className="msg err" role="alert">{out.error}</div>}
      {out?.results?.map((r) => <div key={r.email} className={'msg ' + (r.ok ? 'ok' : 'err')}>{r.email}: {r.ok ? 'invited' : r.error}</div>)}
    </form>
  );
}
