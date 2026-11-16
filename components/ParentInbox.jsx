'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Notice from '@/components/Notice';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { naira } from '@/lib/schedule-logic';
import RecordFrame from './RecordFrame';

const FOLDERS = [['inbox', 'Inbox'], ['drafts', 'Drafts'], ['sent', 'Sent'], ['confirmed', 'Confirmed'], ['rejected', 'Rejected']];
const when = (d) => new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// A parent's inbox: reminders and replies from the bursar, newsletters, drafts, and every payment they sent (sent, confirmed, rejected).
export default function ParentInbox() {
  const sb = useMemo(() => supabaseBrowser(), []);
  const [folder, setFolder] = useState('inbox'); const [d, setD] = useState(null); const [err, setErr] = useState(null); const [msg, setMsg] = useState(null);
  const [openId, setOpenId] = useState(''); const [compose, setCompose] = useState(null); const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data: u } = await sb.auth.getUser(); const me = u.user.id;
    const [inb, mine, news, subs] = await Promise.all([
      sb.from('inbox_messages').select('id,kind,subject,body,created_at,read_at').eq('recipient_id', me).eq('status', 'sent').order('created_at', { ascending: false }).limit(200),
      sb.from('inbox_messages').select('id,subject,body,status,created_at').eq('sender_id', me).order('created_at', { ascending: false }).limit(200),
      sb.from('newsletters').select('id,title,created_at').order('created_at', { ascending: false }).limit(50),
      sb.from('payment_submissions').select('id,reference,amount_ngn,status,review_note,receipt_no,created_at,students(first_name,last_name)').order('created_at', { ascending: false }).limit(200),
    ]);
    const e = inb.error || mine.error || news.error || subs.error; if (e) return setErr(e);
    setD({ inbox: inb.data, mine: mine.data, news: news.data, subs: subs.data });
  }, [sb]);
  useEffect(() => { load(); }, [load]);

  const items = useMemo(() => {
    if (!d) return [];
    const inbox = [...d.inbox.map((m) => ({ ...m, type: 'msg' })), ...d.news.map((n) => ({ id: 'n' + n.id, nid: n.id, kind: 'newsletter', subject: n.title, created_at: n.created_at, type: 'news', read_at: 1 }))].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    return { inbox, drafts: d.mine.filter((m) => m.status === 'draft'), sent: [...d.mine.filter((m) => m.status === 'sent').map((m) => ({ ...m, type: 'out' })), ...d.subs.filter((s) => s.status === 'pending').map((s) => ({ ...s, type: 'sub' }))].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
      confirmed: d.subs.filter((s) => s.status === 'confirmed'), rejected: d.subs.filter((s) => s.status === 'rejected') };
  }, [d]);
  const unread = d ? d.inbox.filter((m) => !m.read_at).length : 0;

  async function openMsg(m) { setOpenId(openId === m.id ? '' : m.id); if (m.type === 'msg' && !m.read_at) { await sb.rpc('inbox_mark_read', { p_ids: [m.id] }); load(); } }
  async function saveDraft(send) {
    setBusy(true); setMsg(null);
    const r = send ? await sb.rpc('inbox_send', { p_id: compose.id ?? null, p_subject: compose.subject, p_body: compose.body }) : await sb.rpc('inbox_save_draft', { p_id: compose.id ?? null, p_subject: compose.subject, p_body: compose.body });
    setBusy(false); if (r.error) return setMsg({ ok: false, m: r.error.message });
    setMsg({ ok: true, m: send ? 'Message sent to the bursar.' : 'Draft saved.' }); setCompose(null); setFolder(send ? 'sent' : 'drafts'); load();
  }
  async function delDraft(id) { if (!confirm('Delete this draft?')) return; await sb.rpc('inbox_delete_draft', { p_id: id }); load(); }

  const payRow = (s, extra) => (<tr key={s.id}><td>{when(s.created_at)}</td><td>{s.students?.last_name} {s.students?.first_name}</td><td>Teller {s.reference}</td><td>{s.amount_ngn ? naira(s.amount_ngn) : ''}</td><td>{extra}</td></tr>);
  return (<>
    {err && <Notice error={err} onClose={() => setErr(null)} />}{msg && <Notice msg={msg} onClose={() => setMsg(null)} />}
    <p><button className="btn" onClick={() => setCompose({ subject: '', body: '' })}>Write to the bursar</button></p>
    {compose && <div className="panel" style={{ marginBottom: 14 }}><h3>{compose.id ? 'Edit draft' : 'New message to the bursar'}</h3>
      <label htmlFor="ib-s">Subject</label><input id="ib-s" value={compose.subject} maxLength={120} onChange={(e) => setCompose({ ...compose, subject: e.target.value })} />
      <label htmlFor="ib-b" style={{ marginTop: 8 }}>Message</label><textarea id="ib-b" rows={5} value={compose.body} maxLength={4000} onChange={(e) => setCompose({ ...compose, body: e.target.value })} />
      <p><button className="btn" disabled={busy || compose.body.trim().length < 2} onClick={() => saveDraft(true)}>Send</button> <button className="btn ghost" disabled={busy} onClick={() => saveDraft(false)}>Save as draft</button> <button className="btn ghost" onClick={() => setCompose(null)}>Cancel</button></p></div>}
    <div className="tabs" role="tablist">{FOLDERS.map(([k, l]) => <a key={k} href="#" className={folder === k ? 'on' : ''} onClick={(e) => { e.preventDefault(); setFolder(k); }}>{l}{k === 'inbox' && unread ? ` (${unread})` : ''}{d && k !== 'inbox' ? ` (${items[k].length})` : ''}</a>)}</div>
    {!d ? <p className="auth-hint">Loading…</p> : <>
      {folder === 'inbox' && (items.inbox.length === 0 ? <div className="empty">Nothing in your inbox.</div> : items.inbox.map((m) => (
        <div className="panel" key={m.id} style={{ marginBottom: 8, borderLeft: !m.read_at ? '4px solid var(--teal, #2f95a3)' : undefined }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, cursor: 'pointer' }} onClick={() => m.type === 'msg' && openMsg(m)}>
            <strong>{m.subject}</strong><span className="auth-hint">{m.kind === 'newsletter' ? 'Newsletter' : m.kind === 'reminder' ? 'Fee reminder' : m.kind === 'payment' ? 'Payment' : 'Message'} · {when(m.created_at)}</span></div>
          {m.type === 'news' && <p style={{ marginBottom: 0 }}><Link className="btn ghost small" href={`/admin/newsletters/${m.nid}`}>Read newsletter</Link></p>}
          {openId === m.id && <p style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>{m.body}</p>}
          {m.kind === 'reminder' && openId === m.id && <p style={{ marginBottom: 0 }}><Link className="btn small" href="/admin/payments">Open Payment schedule</Link></p>}</div>)))}
      {folder === 'drafts' && (items.drafts.length === 0 ? <div className="empty">No drafts.</div> : items.drafts.map((m) => (<div className="panel" key={m.id} style={{ marginBottom: 8 }}><strong>{m.subject}</strong> <span className="auth-hint">saved {when(m.created_at)}</span><p style={{ whiteSpace: 'pre-wrap' }}>{m.body}</p>
        <button className="btn small" onClick={() => setCompose({ id: m.id, subject: m.subject, body: m.body })}>Edit and send</button> <button className="btn ghost small" onClick={() => delDraft(m.id)}>Delete</button></div>)))}
      {folder === 'sent' && (items.sent.length === 0 ? <div className="empty">Nothing sent yet.</div> : <RecordFrame noun="messages">{items.sent.map((m) => m.type === 'sub' ? payRow(m, <span className="badge gold">Payment awaiting the bursar</span>) : (<tr key={m.id}><td>{when(m.created_at)}</td><td colSpan={3}><strong>{m.subject}</strong><div className="auth-hint">{m.body.slice(0, 140)}</div></td><td><span className="badge">Message to the bursar</span></td></tr>))}</RecordFrame>)}
      {folder === 'confirmed' && (items.confirmed.length === 0 ? <div className="empty">No confirmed payments yet.</div> : <RecordFrame noun="messages">{items.confirmed.map((s) => payRow(s, <><span className="badge green">Cleared</span> <Link className="btn ghost small" href={`/admin/receipts/payment/${s.id}`}>Receipt {s.receipt_no}</Link></>))}</RecordFrame>)}
      {folder === 'rejected' && (items.rejected.length === 0 ? <div className="empty">No rejected payments.</div> : <RecordFrame noun="messages">{items.rejected.map((s) => payRow(s, <><span className="badge red">Rejected</span><div className="auth-hint">Reason: {s.review_note}</div><Link className="btn small" href="/admin/payments">Upload again</Link></>))}</RecordFrame>)}
    </>}
  </>);
}
