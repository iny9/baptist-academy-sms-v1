'use client';
import { useMemo, useState } from 'react';
import StageSheet from '@/components/StageSheet';
import Notice from '@/components/Notice';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { parseCsv } from '@/lib/csv';

const LEVELS = ['', 'Poor', 'Average', 'Good', 'Very good', 'Excellent'];
const MAX = { ca1: 15, ca2: 15, exam: 70 };
const filled = (v) => v !== '' && v != null && !Number.isNaN(Number(v));

// One subject's score sheet. Saved as a whole class or not at all: every student needs a 1st CA, a 2nd CA and an exam score.
function ScoreSheet({ term, classId, subject, students, scores, onDone, onError }) {
  const sb = supabaseBrowser();
  const [vals, setVals] = useState(() => Object.fromEntries(students.map((s) => { const v = scores.find((x) => x.student_id === s.id && x.subject_id === subject); return [s.id, { ca1: v?.ca1 ?? '', ca2: v?.ca2 ?? '', exam: v?.exam ?? '' }]; })));
  const [busy, setBusy] = useState(false); const [showBlanks, setShowBlanks] = useState(false);
  const set = (id, k, v) => setVals({ ...vals, [id]: { ...vals[id], [k]: v } });
  const bad = (id, k) => filled(vals[id][k]) && (Number(vals[id][k]) < 0 || Number(vals[id][k]) > MAX[k]);
  const missing = useMemo(() => students.filter((s) => ['ca1', 'ca2', 'exam'].some((k) => !filled(vals[s.id][k]))).length, [vals, students]);
  const outOfRange = students.some((s) => ['ca1', 'ca2', 'exam'].some((k) => bad(s.id, k)));
  const complete = missing === 0 && !outOfRange;

  async function save(e) {
    e.preventDefault(); if (!complete) { setShowBlanks(true); return; }
    setBusy(true);
    const rows = students.map((s) => ({ student_id: s.id, ca1: Number(vals[s.id].ca1), ca2: Number(vals[s.id].ca2), exam: Number(vals[s.id].exam) }));
    const { error } = await sb.rpc('save_scores', { p_term: term, p_class: classId, p_subject: subject, p_rows: rows });
    setBusy(false); error ? onError(error) : onDone(`Saved scores for ${rows.length} students.`);
  }
  async function csv(e) {
    const file = e.target.files[0]; e.target.value = ''; if (!file) return;
    if (file.size > 512 * 1024 || !/\.csv$/i.test(file.name)) return onError({ message: 'Choose a .csv under 512 KB.' });
    const rows = parseCsv(await file.text()); const next = { ...vals }; const unknown = [];
    rows.forEach((r, i) => { const s = students.find((x) => x.admission_no && x.admission_no === r.admission_no); if (!s) return unknown.push(i + 2); next[s.id] = { ca1: r.ca1 ?? '', ca2: r.ca2 ?? '', exam: r.exam ?? '' }; });
    setVals(next); setShowBlanks(true);
    onError({ message: unknown.length ? `Rows ${unknown.slice(0, 8).join(', ')} are not in this class and were ignored. Check the sheet below, then press Save.` : 'CSV loaded into the sheet. Check it, then press Save. Nothing is saved until every box is filled.' }, true);
  }
  const box = (id, k) => (<input type="number" min="0" max={MAX[k]} step="0.5" value={vals[id][k]} onChange={(e) => set(id, k, e.target.value)}
    aria-invalid={bad(id, k) || (showBlanks && !filled(vals[id][k]))} style={(showBlanks && !filled(vals[id][k])) || bad(id, k) ? { borderColor: 'var(--red)', background: 'var(--red-50)' } : null} />);
  return (<form onSubmit={save}>
    <div className="row"><div><label htmlFor="csv">Fill from a CSV file (admission_no, ca1, ca2, exam)</label><input id="csv" type="file" accept=".csv" onChange={csv} /></div>
      <div style={{ paddingBottom: 6 }}>{complete ? <span className="badge green">All {students.length} students complete</span> : <span className="badge red">{missing} student(s) still have an empty box{outOfRange ? ' and some scores are out of range' : ''}</span>}</div></div>
    <table style={{ marginTop: 16 }}><thead><tr><th>#</th><th>Student</th><th>1st CA (0-15)</th><th>2nd CA (0-15)</th><th>Exam (0-70)</th></tr></thead>
      <tbody>{students.map((s, i) => (<tr key={s.id}><td>{i + 1}</td><td>{s.last_name} {s.first_name}</td><td>{box(s.id, 'ca1')}</td><td>{box(s.id, 'ca2')}</td><td>{box(s.id, 'exam')}</td></tr>))}</tbody></table>
    <p><button className="btn" disabled={busy || !complete}>{busy ? 'Saving' : 'Save scores'}</button> <span className="auth-hint">{complete ? 'Ready to save.' : 'Save unlocks when no box is empty. A score of 0 counts as filled; a blank box does not.'}</span></p>
  </form>);
}


// Basic section: the class teacher enters one or many subjects together (all or nothing). Boxes for each chosen subject sit side by side.
function MultiSheet({ term, classId, subjects, students, scores, onDone, onError }) {
  const sb = supabaseBrowser();
  const [chosen, setChosen] = useState(() => new Set(subjects.slice(0, 1).map((x) => x.id)));
  const [vals, setVals] = useState(() => { const o = {}; for (const st of students) for (const sj of subjects) { const v = scores.find((x) => x.student_id === st.id && x.subject_id === sj.id); o[st.id + ':' + sj.id] = { ca1: v?.ca1 ?? '', ca2: v?.ca2 ?? '', exam: v?.exam ?? '' }; } return o; });
  const [busy, setBusy] = useState(false); const [showBlanks, setShowBlanks] = useState(false);
  const list = subjects.filter((x) => chosen.has(x.id));
  const set = (k, f, v) => setVals((p) => ({ ...p, [k]: { ...p[k], [f]: v } }));
  const bad = (k, f) => filled(vals[k][f]) && (Number(vals[k][f]) < 0 || Number(vals[k][f]) > MAX[f]);
  const stats = useMemo(() => { let missing = 0, out = 0; for (const st of students) for (const sj of list) for (const f of ['ca1', 'ca2', 'exam']) { const v = vals[st.id + ':' + sj.id][f]; if (!filled(v)) missing++; else if (Number(v) < 0 || Number(v) > MAX[f]) out++; } return { missing, out }; }, [vals, students, list]);
  const complete = list.length > 0 && stats.missing === 0 && stats.out === 0;
  const toggle = (id) => { const n = new Set(chosen); n.has(id) ? n.delete(id) : n.add(id); setChosen(n); };
  async function save(e) {
    e.preventDefault(); if (!complete) { setShowBlanks(true); return; }
    setBusy(true);
    const sheets = list.map((sj) => ({ subject_id: sj.id, rows: students.map((st) => { const v = vals[st.id + ':' + sj.id]; return { student_id: st.id, ca1: Number(v.ca1), ca2: Number(v.ca2), exam: Number(v.exam) }; }) }));
    const { error } = await sb.rpc('save_scores_multi', { p_term: term, p_class: classId, p_sheets: sheets });
    setBusy(false); error ? onError(error) : onDone(`Saved ${list.length} subject${list.length === 1 ? '' : 's'} for ${students.length} students.`);
  }
  const box = (k, f) => { const red = (showBlanks && !filled(vals[k][f])) || bad(k, f); return (<input type="number" min="0" max={MAX[f]} step="0.5" inputMode="decimal" value={vals[k][f]} onChange={(e) => set(k, f, e.target.value)} aria-invalid={red} style={{ width: 74, ...(red ? { borderColor: 'var(--red)', background: 'var(--red-50)' } : null) }} />); };
  return (<form onSubmit={save}>
    <p className="auth-hint">You teach every subject of this class. Tick the subjects you want to enter now; you can do one, several or all together.</p>
    <div className="checks">{subjects.map((sj) => <label key={sj.id}><input type="checkbox" checked={chosen.has(sj.id)} onChange={() => toggle(sj.id)} />{sj.name}</label>)}</div>
    <p><button type="button" className="btn ghost small" onClick={() => setChosen(new Set(subjects.map((x) => x.id)))}>Tick all subjects</button>{' '}<button type="button" className="btn ghost small" onClick={() => setChosen(new Set())}>Clear</button>{' '}
      {list.length > 0 && (complete ? <span className="badge green">All boxes filled</span> : <span className="badge red">{stats.missing} empty box{stats.missing === 1 ? '' : 'es'}{stats.out ? ` and ${stats.out} out of range` : ''}</span>)}</p>
    {list.length > 0 && <div style={{ overflowX: 'auto' }}><table style={{ marginTop: 8 }}><thead>
      <tr><th rowSpan="2">#</th><th rowSpan="2">Student</th>{list.map((sj) => <th key={sj.id} colSpan="3" style={{ textAlign: 'center', borderLeft: '1px solid var(--line)' }}>{sj.name}</th>)}</tr>
      <tr>{list.map((sj) => ['1st test', '2nd test', 'Exam'].map((l, i) => <th key={sj.id + i} style={i === 0 ? { borderLeft: '1px solid var(--line)' } : null}>{l}<br /><small>0-{[15, 15, 70][i]}</small></th>))}</tr></thead>
      <tbody>{students.map((st, i) => (<tr key={st.id}><td>{i + 1}</td><td style={{ whiteSpace: 'nowrap' }}>{st.last_name} {st.first_name}</td>
        {list.map((sj) => { const k = st.id + ':' + sj.id; return ['ca1', 'ca2', 'exam'].map((f, j) => <td key={k + f} style={j === 0 ? { borderLeft: '1px solid var(--line)' } : null}>{box(k, f)}</td>); })}</tr>))}</tbody></table></div>}
    <p><button className="btn" disabled={busy || !complete}>{busy ? 'Saving…' : `Save ${list.length || ''} subject${list.length === 1 ? '' : 's'}`}</button> <span className="auth-hint">{complete ? 'Ready to save.' : 'Save unlocks when every box of every ticked subject is filled. A 0 counts as filled; a blank does not.'}</span></p>
  </form>);
}

// A locked term and section: everything can be looked at, nothing can be changed.
function LockedView({ students, subjects, scores, attendance, daysOpen, completeness, reason }) {
  const [subject, setSubject] = useState(subjects[0]?.id ?? '');
  const [tab, setTab] = useState(subjects.length ? 'scores' : 'attendance');
  const val = (id, k) => scores.find((x) => x.student_id === id && x.subject_id === subject)?.[k];
  const show = (v) => (v == null ? '—' : Number(v));
  return (<>
    <div className="notice info" role="status"><span className="n-ico" aria-hidden="true">🔒</span><div className="n-body"><strong>These results are locked</strong><p>You can view them here, on the Results page and as report cards, but nothing can be changed.{reason ? ` Note: ${reason}` : ''}</p><small>Only the administrator can unlock them (Lock results).</small></div></div>
    <div className="tabs" role="tablist">{[['scores', 'Subject scores', subjects.length > 0], ['attendance', 'Attendance', true]].filter((t) => t[2]).map(([k, l]) => <a key={k} href="#" className={tab === k ? 'on' : ''} onClick={(e) => { e.preventDefault(); setTab(k); }}>{l}</a>)}</div>
    {tab === 'scores' && <>
      <div className="row"><div><label htmlFor="lv">Subject</label><select id="lv" value={subject} onChange={(e) => setSubject(e.target.value)}>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div></div>
      {(completeness ?? []).find((c) => c.subject_id === subject) && <p className="auth-hint">{completeness.find((c) => c.subject_id === subject).complete} of {completeness.find((c) => c.subject_id === subject).eligible} students have a complete score for this subject.</p>}
      <div style={{ overflowX: 'auto' }}><table><thead><tr><th>#</th><th>Student</th><th>1st CA (15)</th><th>2nd CA (15)</th><th>Exam (70)</th><th>Total</th></tr></thead>
        <tbody>{students.map((x, i) => { const a = val(x.id, 'ca1'), b = val(x.id, 'ca2'), e = val(x.id, 'exam'); return (<tr key={x.id}><td>{i + 1}</td><td>{x.last_name} {x.first_name}</td><td>{show(a)}</td><td>{show(b)}</td><td>{show(e)}</td><td><strong>{a == null || b == null || e == null ? '—' : Number(a) + Number(b) + Number(e)}</strong></td></tr>); })}</tbody></table></div></>}
    {tab === 'attendance' && <>
      <p>School opened {daysOpen ?? 'not yet set'} times this term.</p>
      <div style={{ overflowX: 'auto' }}><table><thead><tr><th>#</th><th>Student</th><th>Days present</th></tr></thead>
        <tbody>{students.map((x, i) => { const p = attendance.find((a) => a.student_id === x.id)?.days_present; return (<tr key={x.id}><td>{i + 1}</td><td>{x.last_name} {x.first_name}</td><td>{p == null ? '—' : p}</td></tr>); })}</tbody></table></div></>}
  </>);
}

export default function AssessmentManager({ term, classId, section, canManage, isLead, isFirst, firstTeacher, students, subjects, traits, daysOpen, attendance, ratings, scores, locked, lockReason, termOpen, termReason, excludedCount, completeness }) {
  const sb = supabaseBrowser(); const router = useRouter();
  const canMark = isFirst || canManage;   // first class teacher / form master, administrator, this section's exam officer
  const tabs = [['scores', subjects.length > 0], ['attendance', isLead || canManage || isFirst], ['domains', isLead || canManage]].filter((t) => t[1]).map((t) => t[0]);
  const [tab, setTab] = useState(tabs[0]);
  const [msg, setMsg] = useState(null);
  const ok = (m) => { setMsg({ ok: true, m }); router.refresh(); };
  const bad = (e, info) => setMsg({ ok: false, info: !!info, m: e.message ?? String(e) });
  const [subject, setSubject] = useState(subjects[0]?.id ?? '');
  // ---------- domains ----------
  const [stu, setStu] = useState(students[0]?.id ?? '');
  const [dom, setDom] = useState('affective');
  async function saveRatings(e) {
    e.preventDefault(); const f = new FormData(e.target);
    const rows = traits.filter((t) => t.domain === dom && t.name !== 'Punctuality' && f.get('t' + t.id)).map((t) => ({ student_id: stu, term_id: term, trait_id: t.id, score: Number(f.get('t' + t.id)) }));
    const { error } = await sb.from('ratings').upsert(rows); error ? bad(error) : ok('Ratings saved.');
  }
  async function clearRatings() {
    if (!confirm('Remove this student’s ratings for the domain?')) return;
    const ids = traits.filter((t) => t.domain === dom && t.name !== 'Punctuality').map((t) => t.id);
    const { error } = await sb.from('ratings').delete().eq('student_id', stu).eq('term_id', term).in('trait_id', ids); error ? bad(error) : ok('Removed.');
  }

  const progress = (completeness ?? []).length > 0 && (
    <div className="panel" style={{ marginBottom: 16 }}><h3>Score sheets for this class and term</h3>
      <table><tbody>{completeness.map((c) => (<tr key={c.subject_id}><td>{c.subject_name}</td><td style={{ width: 160 }}><div className="progress" style={{ height: 8, borderRadius: 4, background: 'var(--line)', overflow: 'hidden' }}><i style={{ display: 'block', height: '100%', width: `${c.eligible ? (c.complete / c.eligible) * 100 : 0}%`, background: c.complete === c.eligible && c.eligible > 0 ? 'var(--green)' : 'var(--gold)' }} /></div></td>
        <td style={{ width: 150 }}>{c.complete} of {c.eligible} {c.complete === c.eligible && c.eligible > 0 ? <span className="badge green">Complete</span> : <span className="badge gold">Incomplete</span>}</td></tr>))}</tbody></table></div>);

  if (locked) return <LockedView students={students} subjects={subjects} scores={scores} attendance={attendance} daysOpen={daysOpen} completeness={completeness} reason={lockReason} />;
  if (!termOpen) return <div className="msg err" role="alert" style={{ marginTop: 16 }}>This term is inactive for all students, so no entries can be made for it.{termReason ? ` Reason: ${termReason}` : ''}</div>;
  if (students.length === 0) return <><p>This class has no students who are active this term.</p>{excludedCount > 0 && <p className="auth-hint">{excludedCount} student(s) are marked inactive for this term.</p>}</>;
  return (<>
    {progress}
    {excludedCount > 0 && <div className="msg err" role="status" style={{ background: 'var(--gold-50)', color: 'var(--ink)', borderColor: 'var(--gold)' }}>{excludedCount} student(s) are inactive this term and are not on these sheets. No entries can be made for them.</div>}
    <div className="tabs" role="tablist">{tabs.map((t) => <a key={t} href="#" className={tab === t ? 'on' : ''} onClick={(e) => { e.preventDefault(); setTab(t); }}>
      {{ scores: 'Subject scores', attendance: 'Attendance', domains: 'Affective and psychomotor' }[t]}</a>)}</div>
    {msg && <Notice msg={msg} onClose={() => setMsg(null)} />}

    {tab === 'scores' && <StageSheet key={term + classId} term={term} classId={classId} subjects={subjects} students={students} onDone={ok} onError={bad} />}

    {tab === 'attendance' && (<>
      <p>School opens <strong>{daysOpen ?? 'not yet set'}</strong> times this term (mornings and afternoons, counted from the calendar up to the exam end date).</p>
      <Notice msg={{ ok: false, info: true, m: 'Attendance is taken in the daily register (Attendance register in the menu) by the class teacher or form master. Times present, times absent and punctuality follow from it and cannot be typed here.' }} />
      <div style={{ overflowX: 'auto' }}><table style={{ marginTop: 12 }}><thead><tr><th>#</th><th>Student</th><th>Times present</th><th>Times absent</th></tr></thead>
        <tbody>{students.map((x, i) => { const p = attendance.find((a) => a.student_id === x.id)?.days_present; return (<tr key={x.id}><td>{i + 1}</td><td>{x.last_name} {x.first_name}</td><td>{p == null ? '—' : p}</td><td>{p == null || daysOpen == null ? '—' : daysOpen - p}</td></tr>); })}</tbody></table></div>
    </>)}

    {tab === 'domains' && (<form onSubmit={saveRatings} key={stu + dom}>
      <div className="row"><div><label htmlFor="st">Student</label><select id="st" value={stu} onChange={(e) => setStu(e.target.value)}>{students.map((s) => <option key={s.id} value={s.id}>{s.last_name} {s.first_name}</option>)}</select></div>
        <div><label htmlFor="dm">Domain</label><select id="dm" value={dom} onChange={(e) => setDom(e.target.value)}><option value="affective">Affective</option><option value="psychomotor">Psychomotor</option></select></div></div>
      {dom === 'affective' && <p className="auth-hint">Punctuality is set automatically from the attendance register.</p>}
      <table style={{ marginTop: 16 }}><thead><tr><th>Trait</th>{[1, 2, 3, 4, 5].map((n) => <th key={n}>{n} {LEVELS[n]}</th>)}</tr></thead>
        <tbody>{traits.filter((t) => t.domain === dom && t.name !== 'Punctuality').map((t) => { const cur = ratings.find((r) => r.student_id === stu && r.trait_id === t.id)?.score; return (<tr key={t.id}><td>{t.name}</td>
          {[1, 2, 3, 4, 5].map((n) => <td key={n}><input type="radio" style={{ width: 'auto' }} name={'t' + t.id} value={n} defaultChecked={cur === n} aria-label={`${t.name}: ${LEVELS[n]}`} /></td>)}</tr>); })}</tbody></table>
      <p><button className="btn">Save ratings</button>{' '}<button type="button" className="btn danger" onClick={clearRatings}>Remove ratings</button></p></form>)}
  </>);
}
