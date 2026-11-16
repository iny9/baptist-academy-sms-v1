'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Notice from '@/components/Notice';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { naira } from '@/lib/schedule-logic';

const TABS = [['pending', 'Awaiting confirmation'], ['confirmed', 'Confirmed'], ['rejected', 'Rejected'], ['messages', 'Messages from parents']];
const norm = (s) => String(s ?? '').toLowerCase();

// The bursar's dashboard queue. Parents' evidence lands in "Awaiting confirmation"; confirm or reject one, several or all at once.
// A rejection needs a reason, which the parent reads in the inbox and under Payment schedule, and the parent can send the evidence again.
export default function BursarQueue({ terms, years, canConfirm, current = null }) {
  const sb = useMemo(() => supabaseBrowser(), []);
  const [tab, setTab] = useState('pending'); const [year, setYear] = useState(current?.year_id ?? ''); const [term, setTerm] = useState(current?.id ?? ''); const [q, setQ] = useState('');
  const [rows, setRows] = useState(null); const [msgs, setMsgs] = useState([]); const [sel, setSel] = useState(new Set()); const [note, setNote] = useState('');
  const [img, setImg] = useState({}); const [open, setOpen] = useState({}); const [err, setErr] = useState(null); const [msg, setMsg] = useState(null); const [busy, setBusy] = useState(false);
  const [counts, setCounts] = useState({});

  const load = useCallback(async () => {
    setRows(null); setSel(new Set());
    if (tab === 'messages') { const { data, error } = await sb.rpc('bursar_messages'); if (error) setErr(error); setMsgs(data ?? []); setRows([]); return; }
    const { data, error } = await sb.rpc('bursar_queue', { p_status: tab, p_term: term || null, p_year: year || null });
    if (error) return setErr(error); setRows(data ?? []);
  }, [sb, tab, term, year]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { sb.rpc('bursar_queue', { p_status: 'pending', p_term: null, p_year: null }).then(({ data }) => setCounts((c) => ({ ...c, pending: (data ?? []).length }))); }, [sb, rows]);

  const shown = useMemo(() => (rows ?? []).filter((r) => { const s = norm(q).trim(); return !s || norm(r.student_name).includes(s) || norm(r.parent_name).includes(s) || norm(r.class_name).includes(s) || norm(r.reference).includes(s) || norm(r.admission_no).includes(s); }), [rows, q]);
  const toggle = (id) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  async function view(r) { const { data, error } = await sb.storage.from('tellers').createSignedUrl(r.teller_path, 300); error ? setMsg({ ok: false, m: 'Could not open the picture.' }) : setImg((o) => ({ ...o, [r.id]: data.signedUrl })); }
  async function act(ids, accept) {
    if (!ids.length) return setMsg({ ok: false, m: 'Tick at least one payment.' });
    if (!accept && note.trim().length < 3) return setMsg({ ok: false, m: 'Write a short reason before rejecting, so the parent knows why.' });
    if (!confirm(`${accept ? 'Confirm' : 'Reject'} ${ids.length} payment(s)?`)) return;
    setBusy(true); setMsg(null); const { data, error } = await sb.rpc('review_submissions', { p_ids: ids, p_accept: accept, p_note: note.trim() || null }); setBusy(false);
    if (error) return setMsg({ ok: false, m: error.message });
    setMsg({ ok: true, m: `${data.done} payment(s) ${accept ? 'confirmed. Their items are now Cleared' : 'rejected. The parents can see your reason and upload again'}.${data.skipped ? ` ${data.skipped} skipped (already decided).` : ''}` }); setNote(''); load();
  }

  return (<section style={{ marginTop: 24 }}>
    {err && <Notice error={err} onClose={() => setErr(null)} />}{msg && <Notice msg={msg} onClose={() => setMsg(null)} />}
    <div className="tabs" role="tablist">{TABS.map(([k, l]) => <a key={k} href="#" className={tab === k ? 'on' : ''} onClick={(e) => { e.preventDefault(); setTab(k); }}>{l}{k === 'pending' && counts.pending ? ` (${counts.pending})` : ''}</a>)}</div>
    {tab !== 'messages' && <div className="row">
      <div><label htmlFor="bq-y">Session</label><select id="bq-y" value={year} onChange={(e) => { setYear(e.target.value); setTerm(''); }}><option value="">All</option>{years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}</select></div>
      <div><label htmlFor="bq-t">Term</label><select id="bq-t" value={term} onChange={(e) => setTerm(e.target.value)}><option value="">All</option>{terms.filter((t) => !year || t.year_id === year).map((t) => <option key={t.id} value={t.id}>{t.academic_years?.name}, Term {t.number}</option>)}</select></div>
      <div style={{ flex: 1 }}><label htmlFor="bq-q">Student, parent, class or reference</label><input id="bq-q" value={q} onChange={(e) => setQ(e.target.value)} /></div></div>}

    {tab === 'messages' ? (rows == null ? <p className="auth-hint">Loading…</p> : msgs.length === 0 ? <div className="empty">No messages from parents.</div> : msgs.map((m) => (
      <div className="panel" key={m.id} style={{ marginBottom: 10 }}><strong>{m.subject}</strong> <span className="auth-hint">{m.sender_name}{m.children ? ` · ${m.children}` : ''} · {new Date(m.created_at).toLocaleString('en-GB')}</span><p style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>{m.body}</p></div>)))
    : rows == null ? <p className="auth-hint">Loading…</p> : <>
      {tab === 'pending' && canConfirm && shown.length > 0 && <div className="panel" style={{ marginBottom: 12 }}>
        <div className="row"><label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={sel.size === shown.length} onChange={(e) => setSel(e.target.checked ? new Set(shown.map((r) => r.id)) : new Set())} /> Tick all {shown.length}</label>
          <div style={{ flex: 1 }}><label htmlFor="bq-n">Note to parents (required when rejecting)</label><input id="bq-n" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} /></div>
          <button className="btn" disabled={busy || sel.size === 0} onClick={() => act([...sel], true)}>Confirm {sel.size} selected</button>
          <button className="btn danger" disabled={busy || sel.size === 0} onClick={() => act([...sel], false)}>Reject {sel.size} selected</button></div></div>}
      {shown.length === 0 ? <div className="empty">{tab === 'pending' ? 'No payment is waiting for you.' : 'Nothing here for this selection.'}</div> : shown.map((r) => (
        <div className="panel" key={r.id} style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div>{tab === 'pending' && canConfirm && <input type="checkbox" checked={sel.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Select ${r.student_name}`} style={{ marginRight: 8 }} />}
              <strong>{r.student_name}</strong> <span className="badge">{r.class_name}</span> <span className="auth-hint">{r.admission_no}</span>
              <div className="auth-hint">Sent by {r.parent_name} on {new Date(r.created_at).toLocaleString('en-GB')} · teller {r.reference}</div></div>
            <div style={{ textAlign: 'right' }}><strong>{naira(r.items_total)}</strong>{r.amount_ngn && Number(r.amount_ngn) !== Number(r.items_total) && <div className="auth-hint">Parent says ₦{Number(r.amount_ngn).toLocaleString()}</div>}</div></div>
          <ul style={{ margin: '6px 0 6px 18px' }}>{r.items.map((i, k) => <li key={k}>{i.title} <span className="auth-hint">({i.year}, Term {i.term})</span>: {naira(i.amount)}</li>)}</ul>
          {img[r.id] ? <a href={img[r.id]} target="_blank" rel="noopener noreferrer"><img src={img[r.id]} alt={`Teller for ${r.student_name}`} style={{ maxWidth: '100%', maxHeight: 380, borderRadius: 8, border: '1px solid #ccc' }} /></a> : <button type="button" className="btn ghost small" onClick={() => view(r)}>View teller picture</button>}
          {tab === 'pending' && (canConfirm
            ? <div className="btn-row" style={{ marginTop: 10 }}>
                <button type="button" className="btn" disabled={busy} onClick={() => act([r.id], true)}>Confirm payment {naira(r.items_total)}</button>
                <button type="button" className="btn danger" disabled={busy} onClick={() => act([r.id], false)}>Reject</button>
                <span className="auth-hint">To reject, write the reason in the note box above first.</span></div>
            : <p className="auth-hint" style={{ marginBottom: 0 }}>Only a user acting as the Bursar can confirm this payment.</p>)}
          {tab === 'confirmed' && <p style={{ marginBottom: 0 }}><Link className="btn ghost small" href={`/admin/receipts/payment/${r.id}`}>Receipt {r.receipt_no}</Link></p>}
          {tab === 'rejected' && r.review_note && <p className="auth-hint" style={{ marginBottom: 0 }}>Reason given: {r.review_note}</p>}
        </div>))}
    </>}
  </section>);
}
