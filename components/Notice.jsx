'use client';
import { useState } from 'react';
import Link from 'next/link';
import { classify } from '@/lib/errors';

const ICONS = {
  ok: <path d="M5 13l4 4L19 7" />,
  offline: <><path d="M2 8.8a15 15 0 0 1 20 0" /><path d="M5 12.5a10 10 0 0 1 14 0" /><path d="M8.5 16a5 5 0 0 1 7 0" /><path d="M12 20h.01" /><path d="M3 3l18 18" /></>,
  warn: <><path d="M12 3l10 18H2z" /><path d="M12 10v5" /><path d="M12 18h.01" /></>,
  err: <><circle cx="12" cy="12" r="9" /><path d="M12 7v6" /><path d="M12 16.5h.01" /></>,
  lock: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
};
const pick = (n) => (n.tone === 'ok' ? 'ok' : n.kind === 'offline' ? 'offline' : n.kind === 'perm' || n.kind === 'session' || n.kind === 'auth' ? 'lock' : n.kind === 'timeout' ? 'clock' : n.tone === 'err' ? 'err' : 'warn');

// A friendly, colourful message card. Pass either { ok, m } (the shape the screens already use), a ready-made `error`, or `notice`.
export default function Notice({ msg, error, notice, onClose, compact }) {
  const [hidden, setHidden] = useState(false);
  let n = notice;
  if (!n && error) n = classify(error);
  if (!n && msg) n = msg.ok ? { tone: 'ok', kind: 'ok', title: msg.title ?? 'Done', body: msg.m, hint: '' } : msg.info ? { tone: 'info', kind: 'info', title: 'Good to know', body: msg.m, hint: '' } : classify(msg.m);
  if (!n || hidden) return null;
  const close = () => { setHidden(true); onClose?.(); };
  return (
    <div className={`notice ${n.tone}${compact ? ' compact' : ''}`} role={n.tone === 'ok' ? 'status' : 'alert'} aria-live={n.tone === 'ok' ? 'polite' : 'assertive'}>
      <span className="n-ico" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{ICONS[pick(n)]}</svg></span>
      <div className="n-body">
        <strong>{n.title}</strong>
        {n.body && <p>{n.body}</p>}
        {n.hint && <small>{n.hint}</small>}
        {n.action && <p><Link className="btn small" href={n.action.href}>{n.action.label}</Link></p>}
      </div>
      <button type="button" className="n-x" onClick={close} aria-label="Dismiss message">×</button>
    </div>
  );
}
