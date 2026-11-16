'use client';
import { useMemo, useState } from 'react';
import SendButton from './SendButton';
import RecordFrame from './RecordFrame';

export default function MessageComposer({ rows }) {
  const [f, setF] = useState({ q: '', cls: '', section: '', gender: '' }); const [sel, setSel] = useState(new Set());
  const [channel, setChannel] = useState('email'); const [subject, setSubject] = useState(''); const [body, setBody] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const shown = useMemo(() => rows.filter((r) => (!f.q || (r.parent_name ?? r.email).toLowerCase().includes(f.q.toLowerCase())) && (!f.cls || r.class_name === f.cls)
    && (!f.section || r.section === f.section) && (!f.gender || r.child_gender === f.gender)), [rows, f]);
  const parents = [...new Map(shown.map((r) => [r.parent_id, r])).values()];
  const toggle = (id) => { const n = new Set(sel); n.has(id) ? n.delete(id) : n.add(id); setSel(n); };
  const classes = [...new Set(rows.map((r) => r.class_name))].sort();
  return (<>
    <div className="row">
      <div><label htmlFor="q">Parent name</label><input id="q" value={f.q} onChange={set('q')} /></div>
      <div><label htmlFor="c">Child's class</label><select id="c" value={f.cls} onChange={set('cls')}><option value="">All</option>{classes.map((c) => <option key={c}>{c}</option>)}</select></div>
      <div><label htmlFor="s">Section</label><select id="s" value={f.section} onChange={set('section')}><option value="">All</option><option value="basic">Basic</option><option value="secondary">Secondary</option></select></div>
      <div><label htmlFor="g">Child's gender</label><select id="g" value={f.gender} onChange={set('gender')}><option value="">All</option><option>Male</option><option>Female</option></select></div>
    </div>
    <p><button type="button" className="btn ghost small" onClick={() => setSel(new Set(parents.map((p) => p.parent_id)))}>Select all shown ({parents.length})</button>{' '}
      <button type="button" className="btn ghost small" onClick={() => setSel(new Set())}>Clear</button></p>
    <div><RecordFrame noun="parents">{parents.map((p) => (<tr key={p.parent_id}>
      <td><input type="checkbox" style={{ width: 'auto' }} checked={sel.has(p.parent_id)} onChange={() => toggle(p.parent_id)} aria-label={`Select ${p.parent_name ?? p.email}`} /></td>
      <td>{p.parent_name ?? p.email}<div style={{ color: 'var(--muted)', fontSize: '.8rem' }}>{p.phone}</div></td>
      <td>{rows.filter((r) => r.parent_id === p.parent_id).map((r) => `${r.child_name} (${r.class_name})`).join(', ')}</td></tr>))}</RecordFrame></div>
    <label htmlFor="sj">Subject</label><input id="sj" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={150} />
    <label htmlFor="bd">Message</label><textarea id="bd" value={body} onChange={(e) => setBody(e.target.value)} maxLength={5000} />
    <label htmlFor="ch">Send by</label><select id="ch" value={channel} onChange={(e) => setChannel(e.target.value)} style={{ maxWidth: 240 }}><option value="email">Email</option><option value="sms">SMS (max 459 characters)</option><option value="both">Email and SMS</option></select>
    {channel !== 'email' && body.length > 459 && <div className="msg err">SMS text is too long ({body.length}/459).</div>}
    {sel.size > 0 && subject.length >= 3 && body && <SendButton label={`Send to ${sel.size} parent(s)`} confirmText={`Send this message to ${sel.size} parent(s)?`} payload={{ kind: 'message', parent_ids: [...sel], subject, body, channel }} />}
  </>);
}
