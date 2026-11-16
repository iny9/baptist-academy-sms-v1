'use client';
import { useState } from 'react';
import Notice from '@/components/Notice';
export default function SendButton({ payload, label, confirmText, endpoint = '/api/send' }) {
  const [msg, setMsg] = useState(null); const [busy, setBusy] = useState(false);
  async function go() {
    if (!confirm(confirmText)) return; setBusy(true); setMsg(null);
    try {
      const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const j = await res.json().catch(() => null);
      if (!j) setMsg({ ok: false, m: res.status === 504 || res.status === 502 ? 'The server took too long. Some emails may have gone out, so check before sending again.' : 'The server gave an unexpected answer. Please try again.' });
      else setMsg(res.ok ? { ok: true, m: j.note ?? `${j.sent} email(s) sent.` } : { ok: false, m: j.error ?? 'The message could not be sent.' });
    } catch (e) { setMsg({ ok: false, m: e?.message ?? 'network_offline' }); }
    finally { setBusy(false); }
  }
  return <><button className="btn" disabled={busy} onClick={go}>{busy ? 'Sending' : label}</button>{msg && <Notice msg={msg} onClose={() => setMsg(null)} />}</>;
}
