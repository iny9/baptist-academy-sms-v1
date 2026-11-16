'use client';
import { useMemo, useState } from 'react';
import Notice from '@/components/Notice';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase-browser';
import Icon from './Icon';
import RecordFrame from './RecordFrame';

export default function TermActivityManager({ term, isAdmin, classes, students, excluded }) {
  const sb = supabaseBrowser(); const router = useRouter();
  const [msg, setMsg] = useState(null); const [reason, setReason] = useState(''); const [picked, setPicked] = useState(new Set()); const [cls, setCls] = useState(''); const [q, setQ] = useState('');
  const out = useMemo(() => new Map(excluded.map((e) => [e.student_id, e.reason])), [excluded]);
  const clsName = (id) => classes.find((c) => c.id === id)?.name ?? '';
  const shown = students.filter((s) => (!cls || s.class_id === cls) && (!q || `${s.last_name} ${s.first_name} ${s.admission_no ?? ''}`.toLowerCase().includes(q.toLowerCase())));
  const done = (m) => { setMsg({ ok: true, m }); setPicked(new Set()); router.refresh(); };
  const fail = (e) => setMsg({ ok: false, m: e.message });
  const toggle = (id) => { const n = new Set(picked); n.has(id) ? n.delete(id) : n.add(id); setPicked(n); };

  async function setTerm(active) {
    if (!confirm(active ? 'Make this term active for all students again?' : 'Make this term INACTIVE for ALL students? No entries can be made for it, and it is left out of third-term cumulative averages.')) return;
    const { error } = await sb.rpc('set_term_active', { p_term: term.id, p_active: active, p_reason: reason || null });
    error ? fail(error) : done(active ? 'Term is active for all students.' : 'Term is now inactive for all students.');
  }
  async function setStudents(inactive) {
    if (picked.size === 0) return;
    const { data, error } = await sb.rpc('set_student_term_activity', { p_term: term.id, p_students: [...picked], p_inactive: inactive, p_reason: reason || null });
    error ? fail(error) : done(`${data} student(s) marked ${inactive ? 'inactive' : 'active'} for this term.`);
  }
  return (<>
    {msg && <Notice msg={msg} onClose={() => setMsg(null)} />}
    <div className="panel" style={{ marginTop: 16, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
      <div><h3 style={{ marginBottom: 4 }}>{term.academic_years.name}, Term {term.number} {term.is_active ? <span className="badge green">Active for all students</span> : <span className="badge red">Inactive for all students</span>}</h3>
        <span className="auth-hint">{term.is_active ? 'Entries are open.' : `No entries can be made.${term.inactive_reason ? ' Reason: ' + term.inactive_reason : ''}`}</span></div>
      {isAdmin ? <div className="row"><div><label htmlFor="r">Reason (optional)</label><input id="r" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} style={{ minWidth: 260 }} /></div>
        {term.is_active ? <button className="btn danger" onClick={() => setTerm(false)}>Make inactive for all students</button> : <button className="btn" onClick={() => setTerm(true)}>Make active for all students</button>}</div>
        : <span className="auth-hint">Only the admin can change a term for all students.</span>}
    </div>

    <h2 style={{ marginTop: 28 }}>Chosen students</h2>
    <p className="auth-hint">Tick the students, then mark the term inactive or active for them. Scores already entered for an inactive student are ignored in results and cumulative averages.</p>
    <div className="row"><div><label htmlFor="c">Class</label><select id="c" value={cls} onChange={(e) => setCls(e.target.value)}><option value="">All classes</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
      <div style={{ flex: 1 }}><label htmlFor="q">Search</label><input id="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or admission number" /></div></div>
    <p><button className="btn ghost small" onClick={() => setPicked(new Set(shown.map((s) => s.id)))}>Tick all shown ({shown.length})</button> <button className="btn ghost small" onClick={() => setPicked(new Set())}>Clear</button></p>
    <RecordFrame noun="students">{shown.map((s) => (<tr key={s.id}>
      <td style={{ width: 36 }}><input type="checkbox" checked={picked.has(s.id)} onChange={() => toggle(s.id)} aria-label={`Select ${s.last_name}`} /></td>
      <td>{s.last_name} {s.first_name}<div className="auth-hint">{s.admission_no}</div></td><td><span className="badge">{clsName(s.class_id)}</span></td>
      <td>{out.has(s.id) ? <><span className="badge red">Inactive this term</span>{out.get(s.id) && <span className="auth-hint"> {out.get(s.id)}</span>}</> : <span className="badge green">Active</span>}</td></tr>))}</RecordFrame>
    <div className="panel" style={{ marginTop: 14, position: 'sticky', bottom: 12 }}>
      <div className="row"><div style={{ flex: 1 }}><label htmlFor="r2">Reason for the selected students (optional)</label><input id="r2" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="e.g. Joined in Term 2" /></div>
        <button className="btn danger" disabled={picked.size === 0} onClick={() => setStudents(true)}><Icon name="lock" size={15} />Mark {picked.size} inactive</button>
        <button className="btn" disabled={picked.size === 0} onClick={() => setStudents(false)}>Mark {picked.size} active</button></div></div>
  </>);
}
