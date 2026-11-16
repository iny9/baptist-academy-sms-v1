'use client';
import { useDeferredValue, useMemo, useState } from 'react';
import Icon from './Icon';
import RecordFrame from './RecordFrame';

const SUBN = { nursery: 'Nursery', primary: 'Primary', junior: 'Junior secondary', senior: 'Senior secondary' };
const MODES = [['class', 'By class'], ['subsection', 'By sub-section'], ['section', 'By section'], ['students', 'Pick students'], ['parent', 'By parent or guardian']];

export default function ReportPicker({ terms, classes, students, links, isAdmin = false, currentTerm = '' }) {
  const [tpl, setTpl] = useState('standard');
  const [mode, setMode] = useState('class'); const [term, setTerm] = useState(terms.some((t) => t.id === currentTerm) ? currentTerm : terms[0]?.id ?? ''); const [cls, setCls] = useState(''); const [section, setSection] = useState('basic'); const [sub, setSub] = useState('nursery');
  const [picked, setPicked] = useState(new Set()); const [q, setQ] = useState(''); const [parent, setParent] = useState('');
  const parents = useMemo(() => [...new Map(links.map((l) => [l.parent_id, l.parent_name || l.parent_email])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [links]);
  const clsName = (id) => classes.find((c) => c.id === id)?.name ?? '';
  const dq = useDeferredValue(q);
  const shown = useMemo(() => students.filter((s) => !dq || `${s.last_name} ${s.first_name} ${s.admission_no ?? ''}`.toLowerCase().includes(dq.toLowerCase()) || clsName(s.class_id).toLowerCase().includes(dq.toLowerCase())), [students, dq]);
  const toggle = (id) => { const n = new Set(picked); n.has(id) ? n.delete(id) : n.add(id); setPicked(n); };
  const count = mode === 'class' ? students.filter((s) => s.class_id === cls).length : mode === 'subsection' ? students.filter((s) => classes.find((c) => c.id === s.class_id)?.sub_section === sub).length : mode === 'section' ? students.filter((s) => classes.find((c) => c.id === s.class_id)?.section === section).length
    : mode === 'students' ? picked.size : links.filter((l) => l.parent_id === parent).length;
  const url = !term ? null : mode === 'class' && cls ? `kind=report&term=${term}&class=${cls}` : mode === 'subsection' ? `kind=report&term=${term}&subsection=${sub}` : mode === 'section' ? `kind=report&term=${term}&section=${section}`
    : mode === 'students' && picked.size ? `kind=report&term=${term}&students=${[...picked].join(',')}` : mode === 'parent' && parent ? `kind=report&term=${term}&parent=${parent}` : null;
  return (<>
    <div className="row"><div><label htmlFor="t">Session and term</label><select id="t" value={term} onChange={(e) => setTerm(e.target.value)}>{terms.map((t) => <option key={t.id} value={t.id}>{t.academic_years.name}, Term {t.number}</option>)}</select></div></div>
    {isAdmin && <div className="row"><div><label htmlFor="tpl">Report card template</label><select id="tpl" value={tpl} onChange={(e) => setTpl(e.target.value)}><option value="standard">Standard (current design)</option><option value="harvard">Harvard style (administrator only)</option></select></div></div>}
    <div className="tabs" role="tablist">{MODES.map(([k, l]) => <a key={k} href="#" className={mode === k ? 'on' : ''} onClick={(e) => { e.preventDefault(); setMode(k); }}>{l}</a>)}</div>
    {mode === 'class' && <div><label htmlFor="c">Class</label><select id="c" value={cls} onChange={(e) => setCls(e.target.value)} style={{ maxWidth: 280 }}><option value="">Choose a class</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>}
    {mode === 'subsection' && <div><label htmlFor="ssub">Sub-section</label><select id="ssub" value={sub} onChange={(e) => setSub(e.target.value)} style={{ maxWidth: 280 }}>{Object.entries(SUBN).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>}
    {mode === 'section' && <div><label htmlFor="s">Section</label><select id="s" value={section} onChange={(e) => setSection(e.target.value)} style={{ maxWidth: 280 }}><option value="basic">Basic section</option><option value="secondary">Secondary section</option></select></div>}
    {mode === 'parent' && <div><label htmlFor="p">Parent or guardian</label><select id="p" value={parent} onChange={(e) => setParent(e.target.value)} style={{ maxWidth: 360 }}><option value="">Choose</option>{parents.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
      {parents.length === 0 && <p className="auth-hint">No parents are linked to students yet. Link them on the Students page.</p>}</div>}
    {mode === 'students' && <div><label htmlFor="q">Search students</label><input id="q" maxLength={60} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, admission number or class" style={{ maxWidth: 360 }} />
      <p><button type="button" className="btn ghost small" onClick={() => setPicked(new Set([...picked, ...shown.map((s) => s.id)]))}>Tick all shown ({shown.length})</button> <button type="button" className="btn ghost small" onClick={() => setPicked(new Set())}>Clear</button></p>
      <RecordFrame noun="students">{shown.slice(0, 300).map((s) => <tr key={s.id}><td style={{ width: 36 }}><input type="checkbox" checked={picked.has(s.id)} onChange={() => toggle(s.id)} aria-label={`Select ${s.last_name}`} /></td><td>{s.last_name} {s.first_name}</td><td>{clsName(s.class_id)}</td><td>{s.admission_no}</td></tr>)}</RecordFrame></div>}
    <p style={{ marginTop: 18 }}>{url ? <a className="btn" href={`/api/pdf?${url}${isAdmin && tpl === 'harvard' ? '&template=harvard' : ''}`}><Icon name="download" size={16} />Download PDF ({count} report card{count === 1 ? '' : 's'})</a> : <button className="btn" disabled>Choose what to download</button>}</p>
    <p className="auth-hint">One report card per page, with the stamp at the bottom right. Cards are sorted by class, then surname. Up to 200 students per download.</p>
  </>);
}
