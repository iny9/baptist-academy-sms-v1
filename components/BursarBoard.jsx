'use client';
import { Fragment, useMemo, useState } from 'react';
import Notice from '@/components/Notice';
import { useRouter } from 'next/navigation';
import Icon from './Icon';
import RecordFrame from './RecordFrame';

const naira = (n) => '₦' + Number(n).toLocaleString('en-NG', { minimumFractionDigits: 2 });
const sum = (a) => a.reduce((x, l) => x + Number(l.amount_ngn), 0);

export default function BursarBoard({ rows, term, canConfirm }) {
  const router = useRouter(); const [picked, setPicked] = useState(new Set()); const [note, setNote] = useState(''); const [msg, setMsg] = useState(null); const [busy, setBusy] = useState(false); const [q, setQ] = useState('');
  const claimed = rows.filter((r) => r.status === 'claimed'), pending = rows.filter((r) => r.status === 'pending'), done = rows.filter((r) => r.status === 'confirmed');
  const match = (r) => !q || r.student_name.toLowerCase().includes(q.toLowerCase()) || (r.admission_no ?? '').toLowerCase().includes(q.toLowerCase());
  const group = (list) => { const m = new Map(); for (const r of list.filter(match)) (m.get(r.student_id) ?? m.set(r.student_id, { r, list: [] }).get(r.student_id)).list.push(r); return [...m.values()]; };
  const awaiting = useMemo(() => group(claimed), [rows, q]); const owing = useMemo(() => group(pending), [rows, q]);   // eslint-disable-line
  const toggle = (id) => { const n = new Set(picked); n.has(id) ? n.delete(id) : n.add(id); setPicked(n); };
  const toggleAll = (list) => { const n = new Set(picked); const ids = list.flatMap((g) => g.list.map((l) => l.line_id)); const all = ids.every((i) => n.has(i)); ids.forEach((i) => (all ? n.delete(i) : n.add(i))); setPicked(n); };
  async function act(accept) {
    if (picked.size === 0) return; if (!accept && !note.trim()) return setMsg({ ok: false, m: 'Write a short reason before rejecting, so the parent knows why.' });
    setBusy(true); setMsg(null);
    const res = await fetch('/api/finance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'confirm', line_ids: [...picked], accept, note: note || undefined }) });
    const j = await res.json(); setBusy(false);
    setMsg(res.ok ? { ok: true, m: j.note } : { ok: false, m: j.error }); if (res.ok) { setPicked(new Set()); setNote(''); router.refresh(); }
  }
  const block = (title, groups, list, hint) => (<>
    <h2 style={{ marginTop: 28 }}>{title} <span className="badge">{list.length}</span></h2><p className="auth-hint">{hint}</p>
    {groups.length === 0 ? <div className="empty">Nothing here.</div> : <>{canConfirm && <button className="btn ghost small" onClick={() => toggleAll(groups)}>Select all shown</button>}
      <RecordFrame style={{ marginTop: 8 }} noun="students">{groups.map(({ r, list }) => (<Fragment key={r.student_id}>
        <tr><td colSpan="5" style={{ background: 'var(--surface-2)', fontWeight: 700 }}>{r.student_name} <span className="badge">{r.class_name}</span> {r.admission_no && <span className="auth-hint">{r.admission_no}</span>}<span style={{ float: 'right' }}>{naira(sum(list))}</span></td></tr>
        {list.map((l) => (<tr key={l.line_id}><td style={{ width: 36 }}>{canConfirm && <input type="checkbox" checked={picked.has(l.line_id)} onChange={() => toggle(l.line_id)} aria-label={`Select ${l.title}`} />}</td>
          <td>{l.title}</td><td>{naira(l.amount_ngn)}</td><td>{l.claim_reference ? `Ref: ${l.claim_reference}` : ''}</td><td className="auth-hint">{l.claimed_at ? new Date(l.claimed_at).toLocaleDateString('en-GB') : ''}</td></tr>))}</Fragment>))}</RecordFrame></>}</>);
  return (<>
    <div className="stats" style={{ marginTop: 20 }}>
      <div className="stat"><div className="ico"><Icon name="wallet" size={22} /></div><div><div className="n">{naira(sum(rows))}</div><div className="l">Total expected</div></div></div>
      <div className="stat"><div className="ico"><Icon name="award" size={22} /></div><div><div className="n">{naira(sum(done))}</div><div className="l">Confirmed paid</div></div></div>
      <div className="stat"><div className="ico"><Icon name="mail" size={22} /></div><div><div className="n">{naira(sum(claimed))}</div><div className="l">Awaiting confirmation</div></div></div>
      <div className="stat"><div className="ico"><Icon name="trending" size={22} /></div><div><div className="n">{naira(sum(pending))}</div><div className="l">Unpaid</div></div></div>
    </div>
    {msg && <Notice msg={msg} onClose={() => setMsg(null)} />}
    <div className="row"><div><label htmlFor="q">Find a student</label><input id="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or admission number" /></div>
      <a className="btn ghost" href={`/api/pdf?kind=debtors&term=${term}`}><Icon name="download" size={16} />Debtors PDF for this term</a></div>
    {block('Unpaid', owing, pending, 'Tick items you received at the office (cash or teller) and confirm them to record the payment.')}
    {canConfirm && <div className="panel" style={{ marginTop: 20, position: 'sticky', bottom: 12 }}>
      <label htmlFor="n">Note to parent (required when rejecting)</label><input id="n" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
      <p style={{ marginBottom: 0 }}><button className="btn" disabled={busy || picked.size === 0} onClick={() => act(true)}>Confirm {picked.size} selected as paid</button>{' '}
        <button className="btn danger" disabled={busy || picked.size === 0} onClick={() => act(false)}>Reject selected claims</button></p></div>}
  </>);
}
