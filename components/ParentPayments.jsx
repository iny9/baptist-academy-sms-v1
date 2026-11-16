'use client';
import { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Notice from '@/components/Notice';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { shrinkPhoto } from '@/lib/image';
import RecordFrame from './RecordFrame';

const naira = (n) => '₦' + Number(n).toLocaleString('en-NG', { minimumFractionDigits: 2 });
const BADGE = { pending: ['Unpaid', 'red'], claimed: ['Awaiting bursar', 'gold'], confirmed: ['Paid', 'green'] };
// a line is settled when it is cleared (paid or ignored) or was brought forward to a later term whose line is settled
const settledIn = (byId) => { const f = (l, n = 0) => !!l && (l.status === 'confirmed' || (!!l.carried_to && n < 20 && f(byId.get(l.carried_to), n + 1))); return f; };
const badgeOf = (l) => (l.ignored ? ['Cleared (ignored)', 'green'] : l.status === 'confirmed' ? BADGE.confirmed : l.carried_to ? ['Brought forward', 'gold'] : BADGE[l.status]);
const SUB = { pending: ['Awaiting the bursar', 'gold'], confirmed: ['Confirmed', 'green'], rejected: ['Rejected', 'red'] };

// Parents upload the teller picture and its reference number for what they paid; several payments can be sent in one go.
export default function ParentPayments({ lines, submissions = [] }) {
  const router = useRouter();
  // a payment the bursar has just confirmed or rejected shows here without a manual reload: refresh when the page is shown again and every 30 seconds while it is open
  useEffect(() => {
    const again = () => { if (document.visibilityState === 'visible') router.refresh(); };
    document.addEventListener('visibilitychange', again); window.addEventListener('focus', again);
    const t = setInterval(again, 30000);
    return () => { document.removeEventListener('visibilitychange', again); window.removeEventListener('focus', again); clearInterval(t); };
  }, [router]);
  const [queue, setQueue] = useState([]);                 // payments prepared but not yet sent
  const [draft, setDraft] = useState({});                 // per child: { ids:Set, file, reference, amount }
  const [msg, setMsg] = useState(null); const [busy, setBusy] = useState(false); const [results, setResults] = useState([]);
  const settled = useMemo(() => settledIn(new Map(lines.map((l) => [l.id, l]))), [lines]);
  const queued = useMemo(() => new Set(queue.flatMap((q) => q.lineIds)), [queue]);
  const byStudent = useMemo(() => { const m = new Map(); for (const l of lines) (m.get(l.student_id) ?? m.set(l.student_id, { s: l.students, list: [] }).get(l.student_id)).list.push(l); return [...m.values()]; }, [lines]);
  const subsOf = (sid) => submissions.filter((x) => x.student_id === sid);
  const d = (sid) => draft[sid] ?? { ids: new Set(), file: null, reference: '', amount: '' };
  const set = (sid, patch) => setDraft((o) => ({ ...o, [sid]: { ...d(sid), ...patch } }));
  const toggle = (sid, id) => { const n = new Set(d(sid).ids); n.has(id) ? n.delete(id) : n.add(id); set(sid, { ids: n }); };

  function addToQueue(sid, label, list) {
    const x = d(sid);
    if (x.ids.size === 0) return setMsg({ ok: false, m: 'Tick the items this payment is for.' });
    if (!x.file) return setMsg({ ok: false, m: 'Take or choose a picture of the teller.' });
    if (x.reference.trim().length < 3) return setMsg({ ok: false, m: 'Enter the teller reference number.' });
    const ids = [...x.ids]; const total = list.filter((l) => x.ids.has(l.id)).reduce((a, l) => a + Number(l.amount_ngn), 0);
    setQueue((q) => [...q, { key: crypto.randomUUID(), sid, label, lineIds: ids, file: x.file, reference: x.reference.trim(), amount: x.amount ? Number(x.amount) : null, total }]);
    setDraft((o) => ({ ...o, [sid]: undefined })); setMsg(null);
  }

  async function sendAll() {
    setBusy(true); setMsg(null); const sb = supabaseBrowser(); const out = []; const sent = []; const { data: u } = await sb.auth.getUser();
    for (const q of queue) {
      try {
        const blob = await shrinkPhoto(q.file);
        const path = `${u.user.id}/${crypto.randomUUID()}.jpg`;
        const up = await sb.storage.from('tellers').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
        if (up.error) throw new Error('The picture could not be uploaded: ' + up.error.message);
        const r = await sb.rpc('submit_payment', { p_student: q.sid, p_lines: q.lineIds, p_path: path, p_reference: q.reference, p_amount: q.amount });
        if (r.error) { await sb.storage.from('tellers').remove([path]).catch(() => {}); throw new Error(r.error.message); }
        sent.push(r.data); out.push({ ...q, ok: true });
      } catch (e) { out.push({ ...q, ok: false, error: e.message }); }
    }
    if (sent.length) fetch('/api/finance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'submitted', ids: sent }) }).catch(() => {});
    setResults(out); setQueue(out.filter((o) => !o.ok)); setBusy(false);
    setMsg({ ok: out.every((o) => o.ok), m: `${out.filter((o) => o.ok).length} payment(s) sent to the bursar.${out.some((o) => !o.ok) ? ' The rest could not be sent; they are still in your list below.' : ''}` });
    router.refresh();
  }

  if (lines.length === 0) return <div className="empty">No fee schedule has been issued to you for this term yet.</div>;
  return (<>
    {msg && <Notice msg={msg} onClose={() => setMsg(null)} />}
    {byStudent.map(({ s, list }) => {
      const sid = list[0].student_id; const owing = list.filter((l) => l.status !== 'confirmed' && !l.carried_to); const total = owing.reduce((a, l) => a + Number(l.amount_ngn), 0);
      const terms = [...new Map(list.map((l) => [l.term_id, l.terms])).entries()];
      const x = d(sid); const pendingLeft = list.filter((l) => l.status === 'pending' && !l.carried_to && !queued.has(l.id));
      return (<div className="panel" key={sid} style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}><h3>{s.last_name} {s.first_name} <span className="badge">{s.classes?.name}</span></h3>
          {owing.length === 0 ? <span className="badge green">No outstanding fee</span> : <span className="badge red">Outstanding {naira(total)}</span>}</div>
        {terms.map(([tid, t]) => { const tl = list.filter((l) => l.term_id === tid); const cleared = tl.every((l) => settled(l));
          return (<div key={tid} style={{ marginTop: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}><strong>{t?.academic_years?.name}, Term {t?.number}</strong>
              {cleared ? <Link className="btn ghost small" href={`/admin/receipts/term/${sid}?term=${tid}`}>Term receipt</Link> : <span className="auth-hint">Term receipt and results open when every item is paid.</span>}</div>
            <RecordFrame noun="items">{tl.map((l) => (<tr key={l.id}>
              <td style={{ width: 36 }}>{l.status === 'pending' && !l.carried_to && !queued.has(l.id) && <input type="checkbox" checked={x.ids.has(l.id)} onChange={() => toggle(sid, l.id)} aria-label={`This payment is for ${l.title}`} />}</td>
              <td>{l.title}{l.kind === 'brought_forward' && <span className="auth-hint"> (brought forward)</span>}{l.review_note && l.status === 'pending' && <div className="auth-hint">Note: {l.review_note}</div>}</td><td>{naira(l.amount_ngn)}</td>
              <td><span className={'badge ' + (queued.has(l.id) ? 'gold' : badgeOf(l)[1])}>{queued.has(l.id) ? 'In your upload list' : badgeOf(l)[0]}</span></td>
              <td>{l.status === 'confirmed' && !l.ignored && <Link className="auth-hint" href={`/admin/receipts/item/${l.id}`}>Receipt</Link>}</td></tr>))}</RecordFrame></div>); })}

        {pendingLeft.length > 0 && <div style={{ marginTop: 14, borderTop: '1px solid var(--line, #ddd)', paddingTop: 12 }}>
          <strong>Paid something? Upload the teller</strong>
          <p className="auth-hint">Tick what this payment covers, add a picture of the teller and its reference number. You can prepare several payments (for any of your children) and send them together.</p>
          <div className="row">
            <div><label>Picture of the teller</label><input type="file" accept="image/*" capture="environment" onChange={(e) => set(sid, { file: e.target.files?.[0] ?? null })} /></div>
            <div><label>Teller reference number</label><input value={x.reference} onChange={(e) => set(sid, { reference: e.target.value })} maxLength={80} /></div>
            <div><label>Amount paid (optional)</label><input inputMode="decimal" value={x.amount} onChange={(e) => set(sid, { amount: e.target.value.replace(/[^\d.]/g, '') })} maxLength={12} /></div>
            <button type="button" className="btn small" onClick={() => addToQueue(sid, `${s.last_name} ${s.first_name}`, list)}>Add to my upload list</button></div></div>}

        {subsOf(sid).length > 0 && <div style={{ marginTop: 14 }}><strong>Payments you have sent</strong>
          <RecordFrame noun="items">{subsOf(sid).map((p) => (<tr key={p.id}><td>{new Date(p.created_at).toLocaleDateString('en-GB')}</td><td>Ref: {p.reference}</td><td>{p.amount_ngn ? naira(p.amount_ngn) : ''}</td>
            <td><span className={'badge ' + SUB[p.status][1]}>{SUB[p.status][0]}</span>{p.status === 'rejected' && p.review_note && <div className="auth-hint">Reason: {p.review_note}</div>}</td>
            <td>{p.status === 'confirmed' && <Link className="btn ghost small" href={`/admin/receipts/payment/${p.id}`}>Receipt {p.receipt_no}</Link>}</td></tr>))}</RecordFrame></div>}
      </div>); })}

    {queue.length > 0 && <div className="panel"><h3>Ready to send ({queue.length})</h3>
      <RecordFrame noun="items">{queue.map((q) => (<tr key={q.key}><td>{q.label}</td><td>{q.lineIds.length} item(s), {naira(q.total)}</td><td>Ref: {q.reference}</td><td className="auth-hint">{q.file?.name}{q.error && <span style={{ color: 'var(--red,#b3261e)' }}> — {q.error}</span>}</td>
        <td><button type="button" className="btn ghost small" disabled={busy} onClick={() => setQueue((a) => a.filter((z) => z.key !== q.key))}>Remove</button></td></tr>))}</RecordFrame>
      <p><button className="btn" disabled={busy} onClick={sendAll}>{busy ? 'Sending…' : `Send ${queue.length} payment(s) to the bursar`}</button></p>
      <p className="auth-hint">Each item shows “Paid” only after the bursar confirms the teller. You will see the result here, and get a receipt.</p></div>}
  </>);
}
