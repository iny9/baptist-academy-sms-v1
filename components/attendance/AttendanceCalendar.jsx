'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase-browser';
import Notice from '@/components/Notice';
import { dayLabel } from '@/lib/attendance-logic';
import { pickCurrentTerm } from '@/lib/current-term';
import RecordFrame from '@/components/RecordFrame';

const NAME = { secondary: 'Secondary (Junior and Senior)', basic: 'Basic (Nursery and Primary)' };

export default function AttendanceCalendar({ terms, sections, canExamEnd, isAdmin }) {
  const sb = useMemo(() => supabaseBrowser(), []);
  const [term, setTerm] = useState((pickCurrentTerm(terms) ?? terms[0])?.id ?? '');
  const [section, setSection] = useState(sections[0] ?? 'secondary');
  const [cal, setCal] = useState([]); const [hol, setHol] = useState([]);
  const [msg, setMsg] = useState(null); const [busy, setBusy] = useState(false);
  const t = terms.find((x) => x.id === term);
  const ok = (m) => setMsg({ ok: true, m }); const bad = (e) => setMsg({ ok: false, m: e?.message ?? String(e) });
  const load = useCallback(async () => {
    if (!term) return;
    const [c, h] = await Promise.all([sb.from('term_calendar').select('section,exam_end_on').eq('term_id', term), sb.from('school_holidays').select('id,section,starts_on,ends_on,note').eq('term_id', term).order('starts_on')]);
    setCal(c.data ?? []); setHol(h.data ?? []);
  }, [sb, term]);
  useEffect(() => { load(); }, [load]);
  const exam = cal.find((c) => c.section === section)?.exam_end_on ?? '';
  const mineHol = hol.filter((h) => h.section === section || h.section == null);

  async function run(fn, args, done) { setBusy(true); setMsg(null); const { error } = await sb.rpc(fn, args); setBusy(false); if (error) return bad(error); ok(done); load(); }
  const setExam = (e) => { e.preventDefault(); run('att_set_exam_end', { p_term: term, p_section: section, p_date: new FormData(e.target).get('d') }, 'Exam end date saved. Times school opens has been recalculated and class teachers must close their term registers again.'); };
  const addHol = (e) => {
    e.preventDefault(); const f = new FormData(e.target); const scope = f.get('scope') === 'all' ? null : section;
    run('att_add_holiday', { p_term: term, p_section: scope, p_from: f.get('from'), p_to: f.get('to') || f.get('from'), p_note: f.get('note') }, 'Holiday saved.');
  };

  return (<>
    <div className="row">
      <div><label htmlFor="c-term">Session and term</label><select id="c-term" value={term} onChange={(e) => setTerm(e.target.value)}>
        {terms.map((x) => <option key={x.id} value={x.id}>{x.academic_years.name}, Term {x.number}</option>)}</select></div>
      {sections.length > 1 && <div><label htmlFor="c-sec">Section</label><select id="c-sec" value={section} onChange={(e) => setSection(e.target.value)}>{sections.map((s) => <option key={s} value={s}>{NAME[s]}</option>)}</select></div>}
    </div>
    {msg && <Notice msg={msg} onClose={() => setMsg(null)} />}
    {t && <p className="auth-hint">This term runs {dayLabel(t.starts_on)} {t.starts_on.slice(0, 4)} to {dayLabel(t.ends_on)} {t.ends_on.slice(0, 4)} (set under Sessions). Everything below must fall inside these dates.</p>}
    <div className="panel" style={{ marginTop: 14 }}><h3>Exam end date, {NAME[section]}</h3>
      {exam ? <p>Attendance can be taken up to and including <strong>{dayLabel(exam)} {exam.slice(0, 4)}</strong>.</p> : <p className="auth-hint">Not set. Class teachers cannot take attendance until it is.</p>}
      {canExamEnd[section] ? <form className="row" onSubmit={setExam} key={term + section + exam}><div><label htmlFor="c-d">Exams end on</label><input id="c-d" name="d" type="date" required min={t?.starts_on} max={t?.ends_on} defaultValue={exam} /></div>
        <button className="btn" disabled={busy}>Save</button></form> : <p className="auth-hint">Only the administrator and this section’s exam officer set the exam end date.</p>}
    </div>
    <div className="panel" style={{ marginTop: 14 }}><h3>Holidays and no-school days</h3>
      <form className="row" onSubmit={addHol}><div><label htmlFor="h-f">From</label><input id="h-f" name="from" type="date" required min={t?.starts_on} max={t?.ends_on} /></div>
        <div><label htmlFor="h-t">To (leave empty for one day)</label><input id="h-t" name="to" type="date" min={t?.starts_on} max={t?.ends_on} /></div>
        <div style={{ flex: 1 }}><label htmlFor="h-n">Reason</label><input id="h-n" name="note" maxLength={120} placeholder="e.g. Mid-term break" /></div>
        {isAdmin && <div><label htmlFor="h-s">Applies to</label><select id="h-s" name="scope" defaultValue="section"><option value="section">This section only</option><option value="all">Every section</option></select></div>}
        <button className="btn" disabled={busy}>Add holiday</button></form>
      {mineHol.length === 0 ? <p className="auth-hint" style={{ marginTop: 10 }}>No holidays set for this term.</p> :
        <RecordFrame noun="holidays" style={{ marginTop: 12 }} head={<thead><tr><th>From</th><th>To</th><th>Reason</th><th>Applies to</th><th /></tr></thead>}>
          {mineHol.map((h) => (<tr key={h.id}><td>{dayLabel(h.starts_on)}</td><td>{dayLabel(h.ends_on)}</td><td>{h.note ?? ''}</td><td>{h.section ? NAME[h.section] : 'Every section'}</td>
            <td>{(h.section || isAdmin) && <button className="btn ghost small" disabled={busy} onClick={() => confirm('Remove this holiday?') && run('att_remove_holiday', { p_id: h.id }, 'Holiday removed.')}>Remove</button>}</td></tr>))}</RecordFrame>}
      <p className="auth-hint">A holiday cannot be added over a day whose register is already saved.</p>
    </div>
  </>);
}
