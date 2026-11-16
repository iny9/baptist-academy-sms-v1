'use client';
import { useEffect, useMemo, useState } from 'react';
import Notice from '@/components/Notice';
import { supabaseBrowser } from '@/lib/supabase-browser';
import Icon from './Icon';
import RecordFrame from './RecordFrame';

const SEC = { basic: 'Basic', secondary: 'Secondary' };

export default function GuardianMatcher({ parents, students, classes, isAdmin }) {
  const sb = supabaseBrowser();
  const [pq, setPq] = useState(''); const [parent, setParent] = useState(null); const [kids, setKids] = useState([]); const [msg, setMsg] = useState(null); const [busy, setBusy] = useState(false);
  const [sq, setSq] = useState(''); const [section, setSection] = useState(''); const [cls, setCls] = useState(''); const [onlyUnmatched, setOnlyUnmatched] = useState(false);
  const clsOf = (id) => classes.find((c) => c.id === id);
  const shownParents = useMemo(() => parents
    .filter((p) => !pq || `${p.parent_name ?? ''} ${p.email} ${p.phone ?? ''}`.toLowerCase().includes(pq.toLowerCase()))
    .filter((p) => !onlyUnmatched || p.children === 0), [parents, pq, onlyUnmatched]);
  async function load(p) {
    setParent(p); setMsg(null); setKids([]);
    const { data, error } = await sb.rpc('parent_children', { p_parent: p.parent_id }); error ? setMsg({ ok: false, m: error.message }) : setKids(data ?? []);
  }
  const kidIds = new Set(kids.map((k) => k.student_id));
  const candidates = useMemo(() => students.filter((s) => (!section || clsOf(s.class_id)?.section === section) && (!cls || s.class_id === cls)
    && (!sq || `${s.last_name} ${s.first_name} ${s.admission_no ?? ''}`.toLowerCase().includes(sq.toLowerCase()))).slice(0, 60), [students, section, cls, sq]);   // eslint-disable-line
  async function link(s) {
    setBusy(true); const { error } = await sb.rpc('link_guardian_id', { p_student: s.id, p_parent: parent.parent_id }); setBusy(false);
    if (error) return setMsg({ ok: false, m: error.message });
    setMsg({ ok: true, m: `${s.last_name} ${s.first_name} linked.` }); load(parent); parent.children += 1;
  }
  async function unlink(k) {
    if (!confirm(`Remove the link between ${parent.parent_name ?? parent.email} and ${k.student_name}?`)) return;
    const { error } = await sb.rpc('unlink_guardian', { p_student: k.student_id, p_parent: parent.parent_id });
    if (error) return setMsg({ ok: false, m: error.message }); setMsg({ ok: true, m: 'Link removed.' }); load(parent); parent.children = Math.max(0, parent.children - 1);
  }
  return (
    <div className="sections-grid" style={{ alignItems: 'start' }}>
      <div>
        <h3>1. Choose the parent or guardian</h3>
        <label htmlFor="pq">Search parents</label><input id="pq" value={pq} onChange={(e) => setPq(e.target.value)} placeholder="Name, email or phone" />
        <div className="checks" style={{ margin: '8px 0' }}><label><input type="checkbox" checked={onlyUnmatched} onChange={(e) => setOnlyUnmatched(e.target.checked)} />Only parents with no children linked yet</label></div>
        <div>
          {shownParents.length === 0 ? <div className="empty">No parents found. {isAdmin ? 'Invite parents from Users and invites.' : 'Ask the admin to invite the parent first.'}</div> :
            <RecordFrame noun="records">{shownParents.map((p) => (
              <tr key={p.parent_id} onClick={() => load(p)} style={{ cursor: 'pointer', outline: parent?.parent_id === p.parent_id ? '2px solid var(--teal)' : 'none', outlineOffset: -2 }}>
                <td><strong>{p.parent_name ?? p.email}</strong>{p.also_staff && <span className="badge gold" style={{ marginLeft: 6 }}>Also staff</span>}<div className="auth-hint">{p.email}{p.phone ? ` · ${p.phone}` : ''}</div></td>
                <td style={{ textAlign: 'right' }}><span className={'badge ' + (p.children ? '' : 'gold')}>{p.children} child{p.children === 1 ? '' : 'ren'}</span></td></tr>))}</RecordFrame>}
        </div>
      </div>
      <div>
        <h3>2. Their children</h3>
        {msg && <Notice msg={msg} onClose={() => setMsg(null)} />}
        {!parent ? <div className="empty">Choose a parent on the left.</div> : <>
          <div className="panel" style={{ marginBottom: 16 }}>
            <strong>{parent.parent_name ?? parent.email}</strong>{parent.also_staff && <span className="badge gold" style={{ marginLeft: 6 }}>Also staff</span>}
            {kids.length === 0 ? <p className="auth-hint">No children linked yet (in the sections you manage).</p> :
              <RecordFrame noun="records" style={{ marginTop: 8 }}>{kids.map((k) => (<tr key={k.student_id}><td>{k.student_name}<div className="auth-hint">{k.admission_no}</div></td><td><span className="badge">{k.class_name}</span> <span className="badge gold">{SEC[k.section]}</span></td>
                <td style={{ textAlign: 'right' }}><button className="btn danger small" onClick={() => unlink(k)}>Unlink</button></td></tr>))}</RecordFrame>}
          </div>
          <h3>3. Add a child</h3>
          <div className="row">
            <div><label htmlFor="sec">Section</label><select id="sec" value={section} onChange={(e) => { setSection(e.target.value); setCls(''); }}><option value="">All</option>{[...new Set(classes.map((c) => c.section))].map((s) => <option key={s} value={s}>{SEC[s]}</option>)}</select></div>
            <div><label htmlFor="cl">Class</label><select id="cl" value={cls} onChange={(e) => setCls(e.target.value)}><option value="">All</option>{classes.filter((c) => !section || c.section === section).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div style={{ flex: 1 }}><label htmlFor="sq">Search students</label><input id="sq" value={sq} onChange={(e) => setSq(e.target.value)} placeholder="Name or admission number" /></div></div>
          <div style={{ marginTop: 10 }}><RecordFrame noun="records">{candidates.map((s) => (<tr key={s.id}>
            <td>{s.last_name} {s.first_name}<div className="auth-hint">{s.admission_no}</div></td><td><span className="badge">{clsOf(s.class_id)?.name}</span></td>
            <td style={{ textAlign: 'right' }}>{kidIds.has(s.id) ? <span className="badge green">Linked</span> : <button className="btn small" disabled={busy} onClick={() => link(s)}><Icon name="users" size={14} />Link</button>}</td></tr>))}</RecordFrame>
            {candidates.length === 0 && <div className="empty">No students match.</div>}</div></>}
      </div>
    </div>
  );
}
