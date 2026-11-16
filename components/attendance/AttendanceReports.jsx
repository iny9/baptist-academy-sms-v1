'use client';
import { pickCurrentTerm } from '@/lib/current-term';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase-browser';
import Notice from '@/components/Notice';
import { classesIn, completionByClass, dailyUploads, dayLabel, fmtTime, pct, rollupSheets, rollupTotals, toCsv } from '@/lib/attendance-logic';
import RecordFrame from '@/components/RecordFrame';

const SUBS = { nursery: 'Nursery', primary: 'Primary', junior: 'Junior secondary', senior: 'Senior secondary' };
function download(name, csv) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv' })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }

function Bars({ title, rows, hint }) {
  return (<section className="panel" style={{ marginTop: 14 }}><h3>{title}</h3>{hint && <p className="auth-hint">{hint}</p>}
    {rows.length === 0 ? <div className="empty" style={{ padding: 18 }}>No saved registers for this selection.</div> :
      <div className="at-bars" role="img" aria-label={title}>{rows.map((r) => (<div className="at-bar" key={r.key} title={`${r.label}: ${r.pct ?? '—'}% (${r.present} of ${r.possible})`}>
        <b>{r.pct ?? '—'}%</b><i style={{ height: (r.pct ?? 0) + '%' }} /><span>{r.label.replace('Wk of ', '')}</span></div>))}</div>}
  </section>);
}

export default function AttendanceReports({ years, year, terms }) {
  const sb = useMemo(() => supabaseBrowser(), []); const router = useRouter();
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
  const [term, setTerm] = useState(() => (pickCurrentTerm(terms) ?? terms[0])?.id ?? '');
  const [sh, setSh] = useState(null); const [ru, setRu] = useState(null); const [co, setCo] = useState([]);
  const [f, setF] = useState({ section: '', sub: '', cls: '', gender: '', from: '', to: '' });
  const [grain, setGrain] = useState('week'); const [tab, setTab] = useState('overview');
  const [err, setErr] = useState(null); const [stamp, setStamp] = useState(null);
  const [drill, setDrill] = useState(null);
  const upd = (k, v) => setF((p) => ({ ...p, [k]: v, ...(k === 'section' ? { sub: '', cls: '' } : k === 'sub' ? { cls: '' } : {}) }));

  const loadSheets = useCallback(async () => { if (!term) return; const { data, error } = await sb.rpc('att_sheets', { p_term: term }); if (error) return setErr(error); setSh(data); setStamp(new Date()); }, [sb, term]);
  const loadRest = useCallback(async () => {
    const [a, b] = await Promise.all([sb.rpc('att_rollups', { p_year: year }), sb.rpc('att_completion', { p_year: year })]);
    if (a.error || b.error) return setErr(a.error || b.error); setRu(a.data); setCo(b.data ?? []);
  }, [sb, year]);
  useEffect(() => { setSh(null); loadSheets(); }, [loadSheets]);
  useEffect(() => { setRu(null); loadRest(); }, [loadRest]);

  // a saved register appears for every head at once: Realtime when it is on, plus a gentle refresh every 30 seconds and when the tab is shown again
  const timer = useRef(null);
  useEffect(() => {
    const refresh = () => { clearTimeout(timer.current); timer.current = setTimeout(() => { loadSheets(); loadRest(); }, 400); };
    const ch = sb.channel('att-sheets').on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_sheets' }, refresh).subscribe();
    const iv = setInterval(refresh, 30000), vis = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', vis);
    return () => { clearTimeout(timer.current); clearInterval(iv); document.removeEventListener('visibilitychange', vis); sb.removeChannel(ch); };
  }, [sb, loadSheets, loadRest]);

  const classes = sh?.classes ?? ru?.classes ?? [];
  const sections = [...new Set(classes.map((c) => c.section))];
  const subs = [...new Set(classes.filter((c) => !f.section || c.section === f.section).map((c) => c.sub_section))];
  const clsList = classesIn(classes, { section: f.section, sub: f.sub });
  const sheets = sh?.sheets ?? [];

  const weekRows = useMemo(() => rollupSheets(sheets, classes, f, 'week'), [sheets, classes, f]);
  const detail = useMemo(() => {
    if (grain === 'day' || grain === 'week') return rollupSheets(sheets, classes, f, grain);
    return ru ? rollupTotals(ru, f, grain) : [];
  }, [grain, sheets, classes, f, ru]);
  const monthRows = useMemo(() => (ru ? rollupTotals(ru, f, 'month') : []), [ru, f]);
  const termRows = useMemo(() => (ru ? rollupTotals(ru, f, 'term') : []), [ru, f]);
  const total = useMemo(() => { const d = rollupSheets(sheets, classes, f, 'month'); const p = d.reduce((s, r) => s + r.present, 0), n = d.reduce((s, r) => s + r.possible, 0); return { p, n, pct: pct(p, n), days: d.reduce((s, r) => s + r.days, 0) }; }, [sheets, classes, f]);
  const uploads = useMemo(() => dailyUploads(sheets, classes, f), [sheets, classes, f]);
  const comp = useMemo(() => completionByClass(co, f), [co, f]);
  const closedWeeks = useMemo(() => { const ids = new Set(classesIn(classes, f).map((c) => c.id)); return (sh?.weeks ?? []).filter((w) => ids.has(w.class_id)); }, [sh, classes, f]);

  async function openClass(id) { setDrill({ id, loading: true }); const { data, error } = await sb.rpc('att_students', { p_term: term, p_class: id }); if (error) { setDrill(null); return setErr(error); } setDrill({ id, ...data }); }
  const drillRows = useMemo(() => {
    if (!drill?.students) return [];
    const per = drill.students.map(() => 0); for (const [ix, , m] of drill.marks) per[ix] += (m & 1 ? 1 : 0) + (m & 2 ? 1 : 0);
    const open = Number(drill.times_open ?? 0);
    return drill.students.map((s, i) => ({ ...s, present: per[i], absent: Math.max(0, open - per[i]), pct: pct(per[i], open), open }));
  }, [drill]);

  const tabs = [['overview', 'Overview and charts'], ['uploads', 'Daily uploads'], ['status', 'Completion'], ['students', 'By student']];
  return (<>
    <div className="row">
      <div><label htmlFor="r-y">Session</label><select id="r-y" value={year} onChange={(e) => router.replace('/admin/attendance/reports?year=' + e.target.value)}>{years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}</select></div>
      <div><label htmlFor="r-t">Term</label><select id="r-t" value={term} onChange={(e) => setTerm(e.target.value)}>{terms.map((t) => <option key={t.id} value={t.id}>Term {t.number}</option>)}</select></div>
      {sections.length > 1 && <div><label htmlFor="r-s">Section</label><select id="r-s" value={f.section} onChange={(e) => upd('section', e.target.value)}><option value="">All</option>{sections.map((s) => <option key={s} value={s}>{s === 'basic' ? 'Basic' : 'Secondary'}</option>)}</select></div>}
      {subs.length > 1 && <div><label htmlFor="r-ss">Sub-section</label><select id="r-ss" value={f.sub} onChange={(e) => upd('sub', e.target.value)}><option value="">All</option>{subs.map((s) => <option key={s} value={s}>{SUBS[s]}</option>)}</select></div>}
      <div><label htmlFor="r-c">Class</label><select id="r-c" value={f.cls} onChange={(e) => upd('cls', e.target.value)}><option value="">All</option>{clsList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
      <div><label htmlFor="r-g">Gender</label><select id="r-g" value={f.gender} onChange={(e) => upd('gender', e.target.value)}><option value="">All</option><option value="Male">Boys</option><option value="Female">Girls</option></select></div>
      <div><label htmlFor="r-f">From</label><input id="r-f" type="date" value={f.from} onChange={(e) => upd('from', e.target.value)} /></div>
      <div><label htmlFor="r-to">To</label><input id="r-to" type="date" value={f.to} onChange={(e) => upd('to', e.target.value)} /></div>
    </div>
    {err && <Notice error={err} onClose={() => setErr(null)} />}
    <p className="auth-hint">{stamp ? 'Updated ' + stamp.toLocaleTimeString('en-GB') : 'Loading…'} Boys and girls are counted from each register as it was saved.</p>
    <div className="tabs" role="tablist">{tabs.map(([k, l]) => <a key={k} href="#" className={tab === k ? 'on' : ''} onClick={(e) => { e.preventDefault(); setTab(k); }}>{l}</a>)}</div>

    {tab === 'overview' && <>
      <div className="at-grid"><div className="at-kpi"><b>{total.pct ?? '—'}{total.pct != null && '%'}</b><small>Attendance this term (selection)</small></div>
        <div className="at-kpi"><b>{total.p.toLocaleString()}</b><small>Present ticks of {total.n.toLocaleString()}</small></div>
        <div className="at-kpi"><b>{uploads.length}</b><small>Class-days uploaded</small></div>
        <div className="at-kpi"><b>{closedWeeks.length}</b><small>Weeks closed by class teachers</small></div></div>
      <Bars title="Week on week" rows={weekRows} hint="Attendance percentage per week of the chosen term." />
      <Bars title="Month on month" rows={monthRows} hint="All terms of the session." />
      <Bars title="Term on term" rows={termRows} hint="Terms of the session side by side." />
      <section className="panel" style={{ marginTop: 14 }}><div className="row"><h3 style={{ margin: 0 }}>Records</h3>
        <div><label htmlFor="r-gr">Show by</label><select id="r-gr" value={grain} onChange={(e) => setGrain(e.target.value)}>{[['day', 'Day'], ['week', 'Week'], ['month', 'Month'], ['term', 'Term'], ['session', 'Whole session']].map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        <button className="btn ghost small" onClick={() => download(`attendance-${grain}.csv`, toCsv(['Period', 'Present ticks', 'Possible ticks', 'Absent ticks', 'Attendance %'], detail.map((r) => [r.label, r.present, r.possible, r.absent, r.pct])))}>Download CSV</button>
        <button className="btn ghost small" onClick={() => window.print()}>Print</button></div>
        <RecordFrame noun="rows" style={{ marginTop: 10 }} head={<thead><tr><th>Period</th><th>Present</th><th>Possible</th><th>Absent</th><th>Attendance</th></tr></thead>}>{detail.map((r) => <tr key={r.key}><td>{r.label}</td><td>{r.present}</td><td>{r.possible}</td><td>{r.absent}</td><td>{r.pct ?? '—'}{r.pct != null && '%'}</td></tr>)}</RecordFrame>
        {detail.length === 0 && <p className="auth-hint">Nothing saved for this selection.</p>}
      </section>
      {closedWeeks.length > 0 && <section className="panel" style={{ marginTop: 14 }}><h3>Closed weeks (generated when the class teacher closes the week)</h3>
        <RecordFrame noun="rows" head={<thead><tr><th>Class</th><th>Week of</th><th>All</th><th>Boys</th><th>Girls</th><th>Closed</th></tr></thead>}>
          {closedWeeks.map((w) => <tr key={w.class_id + w.week_start}><td>{classes.find((c) => c.id === w.class_id)?.name}</td><td>{dayLabel(w.week_start)}</td><td>{w.pct_all ?? '—'}%</td><td>{w.pct_m ?? '—'}%</td><td>{w.pct_f ?? '—'}%</td><td>{fmtTime(w.closed_at)}</td></tr>)}</RecordFrame>
        <p><button className="btn ghost small" onClick={() => download('closed-weeks.csv', toCsv(['Class', 'Week of', 'All %', 'Boys %', 'Girls %', 'Closed at'], closedWeeks.map((w) => [classes.find((c) => c.id === w.class_id)?.name, w.week_start, w.pct_all, w.pct_m, w.pct_f, w.closed_at])))}>Download CSV</button></p></section>}
    </>}

    {tab === 'uploads' && <section className="panel"><div className="row"><h3 style={{ margin: 0 }}>When each day’s attendance was uploaded</h3>
      <button className="btn ghost small" onClick={() => download('daily-uploads.csv', toCsv(['Class', 'Day', 'Morning uploaded', 'Afternoon uploaded', 'Present', 'Possible', '%'], uploads.map((u) => [u.class_name, u.day, u.am_at, u.pm_at, u.present, u.possible, u.pct])))}>Download CSV</button></div>
      <div style={{ overflowX: 'auto' }}><RecordFrame noun="rows" style={{ marginTop: 10 }} head={<thead><tr><th>Day</th><th>Class</th><th>Morning uploaded</th><th>Afternoon uploaded</th><th>Attendance</th></tr></thead>}>
        {uploads.map((u) => <tr key={u.class_id + u.day}><td>{dayLabel(u.day)}</td><td>{u.class_name}</td><td>{u.am_at ? fmtTime(u.am_at) : <span className="badge gold">missing</span>}</td><td>{u.pm_at ? fmtTime(u.pm_at) : <span className="badge gold">missing</span>}</td><td>{u.pct ?? '—'}{u.pct != null && '%'}</td></tr>)}</RecordFrame></div>
      {uploads.length === 0 && <p className="auth-hint">No registers uploaded yet for this selection.</p>}</section>}

    {tab === 'status' && <section className="panel"><div className="row"><h3 style={{ margin: 0 }}>Who has completed, who has not</h3>
      <button className="btn ghost small" onClick={() => download('completion.csv', toCsv(['Class', 'Term', 'Exam end', 'Weeks closed', 'Weeks expected', 'Days saved', 'School days', 'Term status', 'Last saved'], comp.flatMap((c) => c.terms.map((t) => [c.class_name, t.term_no, t.exam_end_on, t.weeks_closed, t.weeks_total, t.days_saved, t.days_total, t.status, t.last_saved_at]))))}>Download CSV</button></div>
      <div style={{ overflowX: 'auto' }}><RecordFrame noun="rows" style={{ marginTop: 10 }} head={<thead><tr><th>Class</th>{(ru?.terms ?? []).map((t) => <th key={t.id}>Term {t.number}: weeks closed · term</th>)}<th>Session</th></tr></thead>}>
        {comp.map((c) => <tr key={c.class_id}><td>{c.class_name}</td>
          {(ru?.terms ?? []).map((t) => { const x = c.terms.find((y) => y.term_id === t.id); return <td key={t.id}>{!x ? '—' : x.status === 'No calendar' ? <span className="badge">No exam end date</span> : <>{x.weeks_closed}/{x.weeks_total} {x.weeksDone ? <span className="badge green">weeks done</span> : <span className="badge gold">weeks pending</span>} {x.status === 'Closed' ? <span className="badge green">closed</span> : <span className="badge gold">{x.status.toLowerCase()}</span>}</>}</td>; })}
          <td>{c.sessionDone ? <span className="badge green">Complete</span> : <span className="badge gold">Not complete</span>}</td></tr>)}</RecordFrame></div></section>}

    {tab === 'students' && <section className="panel"><h3>Student by student</h3>
      <div className="row"><div><label htmlFor="r-dc">Class</label><select id="r-dc" value={drill?.id ?? ''} onChange={(e) => e.target.value && openClass(e.target.value)}><option value="">Choose a class</option>{clsList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        {drillRows.length > 0 && <button className="btn ghost small" onClick={() => download('students-attendance.csv', toCsv(['Student', 'Gender', 'Times present', 'Times absent', 'Times school opens', '%'], drillRows.map((s) => [s.name, s.gender, s.present, s.absent, s.open, s.pct])))}>Download CSV</button>}</div>
      {drill?.loading && <p className="auth-hint">Loading…</p>}
      {drillRows.length > 0 && <div style={{ overflowX: 'auto' }}><RecordFrame noun="rows" style={{ marginTop: 10 }} head={<thead><tr><th>#</th><th>Student</th><th>Gender</th><th>Present</th><th>Absent</th><th>Out of</th><th>Attendance</th></tr></thead>}>
        {drillRows.map((s, i) => <tr key={s.id}><td>{i + 1}</td><td>{s.name}</td><td>{s.gender}</td><td>{s.present}</td><td>{s.absent}</td><td>{s.open}</td><td>{s.pct ?? '—'}{s.pct != null && '%'}</td></tr>)}</RecordFrame></div>}
      <p className="auth-hint">“Out of” is the number of times school opens this term (mornings plus afternoons up to the exam end date).</p></section>}
  </>);
}
