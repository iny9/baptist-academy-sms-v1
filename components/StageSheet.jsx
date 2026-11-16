'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase-browser';

const STAGES = [['ca1', '1st CA', 15], ['ca2', '2nd CA', 15], ['exam', 'Exam', 70]];

// Score entry in three steps for one subject of the selected term: save the 1st CA, then the 2nd CA, then the exam.
// A student's result appears everywhere (report cards, dashboard) only once all three are in.
export default function StageSheet({ term, classId, subjects, students, onDone, onError }) {
  const sb = supabaseBrowser();
  const [subject, setSubject] = useState(subjects[0]?.id ?? '');
  const [stage, setStage] = useState('ca1');
  const [saved, setSaved] = useState({});            // student_id -> {ca1,ca2,exam} as stored
  const [vals, setVals] = useState({});              // what is typed for the chosen stage
  const [loading, setLoading] = useState(false); const [busy, setBusy] = useState(false);
  const max = STAGES.find((s) => s[0] === stage)[2];

  const load = useCallback(async () => {
    if (!subject) return; setLoading(true);
    const { data, error } = await sb.rpc('score_stage_sheet', { p_term: term, p_class: classId, p_subject: subject });
    setLoading(false); if (error) return onError(error);
    setSaved(Object.fromEntries((data ?? []).map((r) => [r.student_id, r])));
  }, [term, classId, subject]);           // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setVals(Object.fromEntries(students.map((s) => [s.id, saved[s.id]?.[stage] ?? '']))); }, [saved, stage, students]);

  const done = (k) => students.filter((s) => saved[s.id]?.[k] != null).length;
  const prevDone = stage === 'ca1' || (stage === 'ca2' ? done('ca1') === students.length : done('ca1') === students.length && done('ca2') === students.length);
  const valid = (v) => v !== '' && /^\d{1,2}(\.\d{1,2})?$/.test(v) && Number(v) >= 0 && Number(v) <= max;
  const missing = students.filter((s) => vals[s.id] === '' || vals[s.id] == null).length;
  const invalid = students.filter((s) => vals[s.id] !== '' && vals[s.id] != null && !valid(String(vals[s.id]))).length;
  const complete = missing === 0 && invalid === 0 && prevDone;
  const label = STAGES.find((s) => s[0] === stage)[1];

  async function save(e) {
    e.preventDefault(); setBusy(true);
    const rows = students.map((s) => ({ student_id: s.id, score: Number(vals[s.id]) }));
    const { error } = await sb.rpc('save_scores_stage', { p_term: term, p_class: classId, p_subject: subject, p_stage: stage, p_rows: rows });
    setBusy(false); if (error) return onError(error);
    await load(); onDone(`${label} saved for ${rows.length} students.`);
  }
  const subjectName = useMemo(() => subjects.find((s) => s.id === subject)?.name ?? '', [subjects, subject]);

  return (<form onSubmit={save}>
    <div className="row">
      <div><label htmlFor="sj">Subject</label><select id="sj" value={subject} onChange={(e) => { setSubject(e.target.value); setStage('ca1'); }}>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
    </div>
    <div className="tabs" role="tablist" aria-label="Score stage">
      {STAGES.map(([k, name]) => (<a key={k} href="#" role="tab" aria-selected={stage === k} className={stage === k ? 'on' : ''} onClick={(e) => { e.preventDefault(); setStage(k); }}>
        {name} <span className={'badge ' + (done(k) === students.length ? 'green' : 'gold')}>{done(k)}/{students.length}</span></a>))}
    </div>
    {!prevDone && <div className="msg err" role="status">Save the {stage === 'ca2' ? '1st CA' : 'earlier stages'} for every student of {subjectName} first. The {label} opens after that.</div>}
    <table style={{ opacity: loading ? 0.6 : 1 }}><thead><tr><th>Student</th><th>1st CA</th><th>2nd CA</th><th>Exam</th><th>{label} (0 to {max})</th></tr></thead><tbody>
      {students.map((s) => { const sv = saved[s.id] ?? {}; const v = vals[s.id] ?? '';
        return (<tr key={s.id}><td>{s.last_name} {s.first_name}</td>
          {STAGES.map(([k]) => <td key={k} className="auth-hint">{sv[k] ?? ''}</td>)}
          <td><input inputMode="decimal" value={v} disabled={!prevDone} aria-label={`${label} for ${s.last_name} ${s.first_name}`} aria-invalid={v !== '' && !valid(String(v))}
            onChange={(e) => setVals((o) => ({ ...o, [s.id]: e.target.value.replace(/[^\d.]/g, '').slice(0, 5) }))} style={{ width: 90, borderColor: v !== '' && !valid(String(v)) ? 'var(--red, #b3261e)' : undefined }} /></td></tr>); })}
    </tbody></table>
    <p>{complete ? <span className="badge green">All {students.length} students have a {label}</span> : <span className="badge red">{missing ? `${missing} box(es) empty. ` : ''}{invalid ? `${invalid} value(s) out of range.` : ''}</span>}</p>
    <p><button className="btn" disabled={busy || !complete}>{busy ? 'Saving' : `Save ${label}`}</button> <span className="auth-hint">Every student needs a {label} before it can be saved. You can come back later for the next stage.</span></p>
  </form>);
}
