'use client';
import { useEffect, useState } from 'react';
import Notice from '@/components/Notice';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { limitedTo } from '@/lib/subject-scope';
import RecordFrame from './RecordFrame';

const SUBS = { basic: ['nursery', 'primary'], secondary: ['junior', 'senior'] };
const ALL = ['nursery', 'primary', 'junior', 'senior'];
const LABEL = { nursery: 'Nursery', primary: 'Primary', junior: 'Junior secondary', senior: 'Senior secondary' };

function Chips({ allowed, picked, setPicked }) {
  const toggle = (u) => { const n = new Set(picked); n.has(u) ? n.delete(u) : n.add(u); setPicked(n); };
  const pickAll = (list) => setPicked(new Set(list.filter((u) => allowed.includes(u))));
  return (<>
    <div className="checks">{ALL.filter((u) => allowed.includes(u)).map((u) => (
      <label key={u}><input type="checkbox" checked={picked.has(u)} onChange={() => toggle(u)} />{LABEL[u]}</label>))}</div>
    <div style={{ margin: '8px 0' }}>
      {allowed.length === 4 && <button type="button" className="btn ghost small" onClick={() => pickAll(ALL)}>All sections</button>}{' '}
      {SUBS.basic.every((u) => allowed.includes(u)) && <button type="button" className="btn ghost small" onClick={() => pickAll(SUBS.basic)}>Basic only</button>}{' '}
      {SUBS.secondary.every((u) => allowed.includes(u)) && <button type="button" className="btn ghost small" onClick={() => pickAll(SUBS.secondary)}>Secondary only</button>}{' '}
      <button type="button" className="btn ghost small" onClick={() => setPicked(new Set())}>Clear</button>
    </div></>);
}

export default function SubjectsManager({ isAdmin, sections, sec, subjects, classes = [] }) {
  const sb = supabaseBrowser(); const router = useRouter();
  const allowed = sections.flatMap((s) => SUBS[s]);
  const [msg, setMsg] = useState(null);
  const [picked, setPicked] = useState(new Set(SUBS[sec].filter((u) => allowed.includes(u))));
  const [editing, setEditing] = useState(null); const [editPicked, setEditPicked] = useState(new Set());
  const [scoping, setScoping] = useState(null); const [classPicked, setClassPicked] = useState(new Set());   // class-level scope editor
  const clsName = (id) => classes.find((c) => c.id === id)?.name ?? '';
  useEffect(() => { setPicked(new Set(SUBS[sec].filter((u) => allowed.includes(u)))); }, [sec]);   // eslint-disable-line
  const ok = (m) => { setMsg({ ok: true, m }); router.refresh(); };
  const bad = (e) => setMsg({ ok: false, m: /duplicate key/.test(e.message ?? '') ? 'A subject with that name already exists. Use "Edit sections" on it to add more sub-sections.' : (e.message ?? String(e)) });
  const canEdit = (s) => isAdmin || s.sub_sections.every((u) => allowed.includes(u));
  const shown = subjects.filter((s) => s.sub_sections.some((u) => SUBS[sec].includes(u)));

  async function add(e) {
    e.preventDefault();
    if (picked.size === 0) return bad({ message: 'Tick at least one sub-section where the subject is taught.' });
    const names = [...new Set(String(new FormData(e.target).get('names')).split(/[\n,]/).map((x) => x.trim()).filter(Boolean))];
    const { error } = await sb.from('subjects').insert(names.map((name) => ({ name, sub_sections: [...picked] })));
    error ? bad(error) : (e.target.reset(), ok(`${names.length} subject(s) added to: ${[...picked].map((u) => LABEL[u]).join(', ')}.`));
  }
  async function saveSections(s) {
    if (editPicked.size === 0) return bad({ message: 'A subject must be offered in at least one sub-section.' });
    const { error } = await sb.from('subjects').update({ sub_sections: ALL.filter((u) => editPicked.has(u)) }).eq('id', s.id);
    error ? bad(error) : (setEditing(null), ok('Sub-sections updated.'));
  }
  // Offer a subject in chosen classes only (empty = every class of its sub-sections). Runs as you, so row-level security decides.
  async function saveClasses(s) {
    const { error } = await sb.rpc('set_subject_classes', { p_subject: s.id, p_classes: [...classPicked] });
    error ? bad(error) : (setScoping(null), ok(classPicked.size ? 'Subject now offered only in the chosen classes.' : 'Subject now offered in every class of its sub-sections.'));
  }
  async function rename(s) {
    const v = prompt('New name', s.name); if (!v?.trim()) return;
    const { error } = await sb.from('subjects').update({ name: v.trim() }).eq('id', s.id); error ? bad(error) : ok('Renamed.');
  }
  async function del(s) {
    if (!confirm(`Delete ${s.name}? Its scores and teacher assignments are deleted too.`)) return;
    const { error } = await sb.from('subjects').delete().eq('id', s.id); error ? bad(error) : ok('Deleted.');
  }

  return (<>
    {msg && <Notice msg={msg} onClose={() => setMsg(null)} />}
    <form className="panel" onSubmit={add}>
      <h3>Add subjects</h3>
      <label htmlFor="sn">One per line or comma separated</label><textarea id="sn" name="names" required />
      <label>Taught in (tick every sub-section that offers it)</label>
      <Chips allowed={allowed} picked={picked} setPicked={setPicked} />
      <p><button className="btn">Add subjects</button></p>
    </form>
    <h3 style={{ marginTop: 20 }}>Subjects offered in the {sec === 'basic' ? 'Basic' : 'Secondary'} section</h3>
    {shown.length === 0 ? <div className="empty">No subjects yet for this section.</div> :
      <RecordFrame noun="subjects">{shown.map((s) => (
        <tr key={s.id}><td style={{ minWidth: 150 }}>{s.name}</td>
          <td>{scoping === s.id ? <>
            <div className="checks">{classes.filter((c) => s.sub_sections.includes(c.sub_section) && sections.includes(c.section)).map((c) => (
              <label key={c.id}><input type="checkbox" checked={classPicked.has(c.id)} onChange={() => { const n = new Set(classPicked); n.has(c.id) ? n.delete(c.id) : n.add(c.id); setClassPicked(n); }} />{c.name}</label>))}</div>
            <p className="auth-hint">Tick the classes that take this subject. Tick none to offer it in every class of its sub-sections.</p></> : editing === s.id ? <Chips allowed={allowed} picked={editPicked} setPicked={setEditPicked} /> :
            (s.sub_sections.length === 4 ? <span className="badge gold">All sections</span> : ALL.filter((u) => s.sub_sections.includes(u)).map((u) => <span key={u} className="badge" style={{ marginRight: 4 }}>{LABEL[u]}</span>))}
            {scoping !== s.id && limitedTo(s).length > 0 && <div style={{ marginTop: 6 }}><span className="badge gold">Only in:</span> {limitedTo(s).map(clsName).sort().join(', ')}</div>}</td>
          <td style={{ whiteSpace: 'nowrap' }}>{canEdit(s) ? (scoping === s.id ? <>
            <button className="btn small" onClick={() => saveClasses(s)}>Save classes</button>{' '}<button className="btn ghost small" onClick={() => setScoping(null)}>Cancel</button></> : editing === s.id ? <>
            <button className="btn small" onClick={() => saveSections(s)}>Save</button>{' '}<button className="btn ghost small" onClick={() => setEditing(null)}>Cancel</button></> : <>
            <button className="btn ghost small" onClick={() => { setEditing(s.id); setEditPicked(new Set(s.sub_sections)); }}>Edit sections</button>{' '}
            <button className="btn ghost small" onClick={() => { setScoping(s.id); setClassPicked(new Set(limitedTo(s))); }}>Choose classes</button>{' '}
            <button className="btn ghost small" onClick={() => rename(s)}>Rename</button>{' '}
            <button className="btn danger small" onClick={() => del(s)}>Delete</button></>) : <span className="auth-hint">Admin only</span>}</td></tr>))}</RecordFrame>}
  </>);
}
