'use client';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Notice from '@/components/Notice';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { offeredIn } from '@/lib/subject-scope';
import { cleanText } from '@/lib/validate';
import RecordFrame from './RecordFrame';

const SUBNAME = { nursery: 'Nursery', primary: 'Primary', junior: 'Junior secondary', senior: 'Senior secondary' };
const ORDER = ['nursery', 'primary', 'junior', 'senior'];

// Switch many subjects on or off for many classes at once, for one term or a whole session.
export default function SubjectStatusManager({ years, terms, classes, subjects, rows, current = null }) {
  const sb = supabaseBrowser(); const router = useRouter(); const [, start] = useTransition();
  const [msg, setMsg] = useState(null); const [busy, setBusy] = useState(false);
  const [year, setYear] = useState(years.some((y) => y.id === current?.year_id) ? current.year_id : years[0]?.id ?? ''); const [term, setTerm] = useState(() => (terms.some((t) => t.id === current?.id && t.year_id === current?.year_id) ? current.id : ''));   // '' = whole session
  const [pickC, setPickC] = useState(new Set()); const [pickS, setPickS] = useState(new Set()); const [q, setQ] = useState(''); const [reason, setReason] = useState('');
  const yTerms = terms.filter((t) => t.year_id === year);
  const toggle = (set, setter, id) => { const n = new Set(set); n.has(id) ? n.delete(id) : n.add(id); setter(n); };

  const subsOfPicked = useMemo(() => new Set(classes.filter((c) => pickC.has(c.id)).map((c) => c.sub_section)), [classes, pickC]);
  const offered = useMemo(() => subjects.filter((s) => classes.some((c) => pickC.has(c.id) && offeredIn(s, c))).filter((s) => !q || s.name.toLowerCase().includes(q.toLowerCase())), [subjects, subsOfPicked, q]);
  const groups = ORDER.map((u) => [u, classes.filter((c) => c.sub_section === u)]).filter(([, l]) => l.length);
  const shownRows = rows.filter((r) => r.year_id === year);
  const nameS = (id) => subjects.find((s) => s.id === id)?.name ?? ''; const nameC = (id) => classes.find((c) => c.id === id)?.name ?? '';
  const nameT = (id) => (id ? `Term ${terms.find((t) => t.id === id)?.number}` : 'Whole session');

  async function apply(inactive) {
    if (pickC.size === 0 || pickS.size === 0) return setMsg({ ok: false, m: 'Tick at least one class and one subject first.' });
    setBusy(true);
    const { data, error } = await sb.rpc('set_subject_inactivity', { p_subjects: [...pickS], p_classes: [...pickC], p_year: year, p_term: term || null, p_inactive: inactive, p_reason: cleanText(reason, 200) || null });
    setBusy(false);
    if (error) return setMsg({ ok: false, m: error.message });
    setMsg({ ok: true, m: `${inactive ? 'Switched off' : 'Switched on'}: ${data} subject-and-class combination${data === 1 ? '' : 's'} for ${term ? nameT(term) : 'the whole session'}.${inactive ? ' They are left out of results.' : ''}` });
    setPickS(new Set()); start(() => router.refresh());
  }
  async function undo(r) {
    const { error } = await sb.rpc('set_subject_inactivity', { p_subjects: [r.subject_id], p_classes: [r.class_id], p_year: r.year_id, p_term: r.term_id, p_inactive: false, p_reason: null });
    error ? setMsg({ ok: false, m: error.message }) : (setMsg({ ok: true, m: 'Switched back on.' }), start(() => router.refresh()));
  }

  return (<>
    {msg && <Notice msg={msg} onClose={() => setMsg(null)} />}
    <div className="panel">
      <h3>1. When</h3>
      <div className="row">
        <div><label htmlFor="y">Session</label><select id="y" value={year} onChange={(e) => { setYear(e.target.value); setTerm(''); }}>{years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}</select></div>
        <div><label htmlFor="t">Applies to</label><select id="t" value={term} onChange={(e) => setTerm(e.target.value)}><option value="">The whole session (all terms)</option>{yTerms.map((t) => <option key={t.id} value={t.id}>Term {t.number} only</option>)}</select></div>
      </div>
      <h3 style={{ marginTop: 18 }}>2. Which classes</h3>
      <p className="auth-hint">Classes can come from different sub-sections{classes.some((c) => c.section === 'basic') && classes.some((c) => c.section === 'secondary') ? ' and sections' : ''}.</p>
      {groups.map(([u, list]) => (<div key={u} style={{ marginBottom: 10 }}>
        <strong>{SUBNAME[u]}</strong>{' '}
        <button type="button" className="btn ghost small" onClick={() => setPickC(new Set([...pickC, ...list.map((c) => c.id)]))}>Tick all</button>{' '}
        <button type="button" className="btn ghost small" onClick={() => { const n = new Set(pickC); list.forEach((c) => n.delete(c.id)); setPickC(n); }}>Clear</button>
        <div className="checks" style={{ marginTop: 6 }}>{list.map((c) => <label key={c.id} className="chk"><input type="checkbox" checked={pickC.has(c.id)} onChange={() => toggle(pickC, setPickC, c.id)} />{c.name}</label>)}</div></div>))}
      <h3 style={{ marginTop: 18 }}>3. Which subjects</h3>
      {pickC.size === 0 ? <p className="auth-hint">Tick a class first; its subjects appear here.</p> : (<>
        <div className="row"><div><label htmlFor="sq">Search subjects</label><input id="sq" value={q} maxLength={60} onChange={(e) => setQ(e.target.value)} /></div>
          <div style={{ alignSelf: 'end' }}><button type="button" className="btn ghost small" onClick={() => setPickS(new Set([...pickS, ...offered.map((s) => s.id)]))}>Tick all shown ({offered.length})</button>{' '}
            <button type="button" className="btn ghost small" onClick={() => setPickS(new Set())}>Clear</button></div></div>
        <div className="checks" style={{ marginTop: 8, maxHeight: 220, overflow: 'auto' }}>{offered.map((s) => <label key={s.id} className="chk"><input type="checkbox" checked={pickS.has(s.id)} onChange={() => toggle(pickS, setPickS, s.id)} />{s.name}</label>)}</div></>)}
      <div className="row" style={{ marginTop: 14 }}><div style={{ flex: 1 }}><label htmlFor="rs">Reason (optional)</label><input id="rs" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Not offered this term" /></div></div>
      <p style={{ marginTop: 12 }}><button className="btn danger" disabled={busy} onClick={() => apply(true)}>Switch off ({pickS.size} subject{pickS.size === 1 ? '' : 's'}, {pickC.size} class{pickC.size === 1 ? '' : 'es'})</button>{' '}
        <button className="btn" disabled={busy} onClick={() => apply(false)}>Switch back on</button></p>
      <p className="auth-hint">Switched-off subjects are not used to compute results, averages or positions for that term or session, and they no longer need a teacher.</p>
    </div>
    <h2 style={{ marginTop: 28 }}>Currently switched off</h2>
    {shownRows.length === 0 ? <div className="empty">Nothing is switched off for this session.</div> :
      <RecordFrame noun="rows" head={<thead><tr><th>Class</th><th>Subject</th><th>For</th><th>Reason</th><th /></tr></thead>}>{shownRows.map((r) => (
        <tr key={r.id}><td>{nameC(r.class_id)}</td><td>{nameS(r.subject_id)}</td><td>{nameT(r.term_id)}</td><td>{r.reason ?? ''}</td>
          <td style={{ textAlign: 'right' }}><button className="btn small" onClick={() => undo(r)}>Switch on</button></td></tr>))}</RecordFrame>}
  </>);
}
