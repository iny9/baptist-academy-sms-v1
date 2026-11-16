'use client';
import { useState } from 'react';
import Notice from '@/components/Notice';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase-browser';
import SubjectsManager from './SubjectsManager';
import RecordFrame from './RecordFrame';

const SUBS = { basic: ['nursery', 'primary'], secondary: ['junior', 'senior'] };
const cap = (s) => s[0].toUpperCase() + s.slice(1);

export default function AcademicsManager({ isAdmin, sections, years, terms, classes, subjects }) {
  const sb = supabaseBrowser(); const router = useRouter();
  const [msg, setMsg] = useState(null); const [sec, setSec] = useState(sections[0]);
  const ok = (m) => { setMsg({ ok: true, m }); router.refresh(); };
  const bad = (e) => setMsg({ ok: false, m: e.message ?? String(e) });

  async function addYear(e) {
    e.preventDefault(); const f = new FormData(e.target);
    const { data, error } = await sb.from('academic_years').insert({ name: f.get('name'), target_average: Number(f.get('target')) }).select().single();
    if (error) return bad(error);
    const rows = [1, 2, 3].map((n) => ({ year_id: data.id, number: n, starts_on: f.get(`s${n}`), ends_on: f.get(`e${n}`), next_term_begins: f.get(`n${n}`) || null }));
    const r = await sb.from('terms').insert(rows);
    if (r.error) { await sb.from('academic_years').delete().eq('id', data.id); return bad(r.error); }
    e.target.reset(); ok('Session and its three terms created.');
  }
  async function editTarget(y) {
    const v = prompt('Promotion target average (0 to 100)', y.target_average); if (v === null) return;
    const n = Number(v); if (!(n >= 0 && n <= 100)) return bad({ message: 'Enter a number from 0 to 100.' });
    const { error } = await sb.from('academic_years').update({ target_average: n }).eq('id', y.id); error ? bad(error) : ok('Target updated.');
  }
  async function addClass(e) {
    e.preventDefault(); const f = new FormData(e.target);
    const { error } = await sb.from('classes').insert({ name: String(f.get('name')).trim(), section: sec, sub_section: f.get('sub') });
    error ? bad(error) : (e.target.reset(), ok('Class added.'));
  }
  async function del(table, id, label) {
    if (!confirm(`Delete ${label}? This cannot be undone.`)) return;
    const { error } = await sb.from(table).delete().eq('id', id); error ? bad(error) : ok('Deleted.');
  }
  async function rename(table, id, cur) {
    const v = prompt('New name', cur); if (!v?.trim()) return;
    const { error } = await sb.from(table).update({ name: v.trim() }).eq('id', id); error ? bad(error) : ok('Renamed.');
  }
  const termsOf = (id) => terms.filter((t) => t.year_id === id);

  return (<>
    {msg && <Notice msg={msg} onClose={() => setMsg(null)} />}
    {isAdmin && (<>
      <h2>Academic sessions</h2>
      <p>Scores and results can only be entered for a session that exists. Each session has three terms.</p>
      <form className="panel" onSubmit={addYear}>
        <div className="row">
          <div><label htmlFor="yn">Session (e.g. 2026/2027)</label><input id="yn" name="name" required pattern="[0-9]{4}/[0-9]{4}" /></div>
          <div><label htmlFor="yt">Promotion target average</label><input id="yt" name="target" type="number" min="0" max="100" step="0.01" defaultValue="50" required /></div>
        </div>
        {[1, 2, 3].map((n) => (<div className="row" key={n}>
          <div><label>Term {n} begins</label><input name={`s${n}`} type="date" required /></div>
          <div><label>Term {n} ends</label><input name={`e${n}`} type="date" required /></div>
          <div><label>Next term begins</label><input name={`n${n}`} type="date" /></div></div>))}
        <p><button className="btn">Create session</button></p>
      </form>
      <RecordFrame noun="rows" head={<thead><tr><th>Session</th><th>Target</th><th>Terms</th><th></th></tr></thead>}>{years.map((y) => (
        <tr key={y.id}><td>{y.name}</td><td>{y.target_average}</td>
          <td>{termsOf(y.id).map((t) => `T${t.number}: ${t.starts_on} to ${t.ends_on}${t.is_active === false ? ' (inactive)' : ''}`).join('; ')}</td>
          <td><button className="btn ghost small" onClick={() => editTarget(y)}>Edit target</button>{' '}
            <button className="btn danger small" onClick={() => del('academic_years', y.id, 'session ' + y.name)}>Delete</button></td></tr>))}</RecordFrame>
    </>)}

    <h2 style={{ marginTop: 40 }}>Classes and subjects</h2>
    {sections.length > 1 && <div className="row"><div><label htmlFor="sec">Section</label>
      <select id="sec" value={sec} onChange={(e) => setSec(e.target.value)}>{sections.map((s) => <option key={s} value={s}>{cap(s)}</option>)}</select></div></div>}
    <div className="sections-grid" style={{ marginTop: 16 }}>
      <div>
        <form className="panel" onSubmit={addClass}>
          <h3>Add class</h3>
          <label htmlFor="cn">Class name</label><input id="cn" name="name" required minLength={2} maxLength={40} />
          <label htmlFor="cs">Sub-section</label>
          <select id="cs" name="sub">{SUBS[sec].map((s) => <option key={s} value={s}>{cap(s)}</option>)}</select>
          <p><button className="btn">Add class</button></p>
        </form>
        <RecordFrame noun="rows">{classes.filter((c) => c.section === sec).map((c) => (
          <tr key={c.id}><td>{c.name}</td><td>{cap(c.sub_section)}</td><td>
            <button className="btn ghost small" onClick={() => rename('classes', c.id, c.name)}>Rename</button>{' '}
            <button className="btn danger small" onClick={() => del('classes', c.id, c.name)}>Delete</button></td></tr>))}</RecordFrame>
      </div>
      <div><SubjectsManager isAdmin={isAdmin} sections={sections} sec={sec} subjects={subjects} classes={classes} /></div>
    </div>
  </>);
}
