'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase-browser';
import Notice from '@/components/Notice';
import { STATE, SUBS, VARIANT, byStudent, canIgnoreHint, filterRows, naira, reminderStudents, scheduleCsv, totals } from '@/lib/schedule-logic';
import RecordFrame from './RecordFrame';

function download(name, text) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + text], { type: 'text/csv' })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }

// View and download the schedules you may see (class teacher: own class; section head: own section; bursar and admin: everyone),
// drill by session, term, section, sub-section, class, gender, student, parent and status; mark lines "Ignored" (cleared by the system); the bursar can remind parents.
export default function ScheduleBoard({ terms, term, roles, leads = [], isBursar = false }) {
  const sb = useMemo(() => supabaseBrowser(), []);
  const termRow = terms.find((t) => t.id === term);
  const [scope, setScope] = useState('term');                       // term | session | all
  const [rows, setRows] = useState(null); const [err, setErr] = useState(null); const [msg, setMsg] = useState(null);
  const [f, setF] = useState({ section: '', sub: '', cls: '', gender: '', state: 'open', level: '', q: '' });
  const [view, setView] = useState('lines'); const [sel, setSel] = useState(new Set()); const [note, setNote] = useState(''); const [busy, setBusy] = useState(false);
  const upd = (k, v) => { setF((p) => ({ ...p, [k]: v, ...(k === 'section' ? { sub: '', cls: '' } : k === 'sub' ? { cls: '' } : {}) })); setSel(new Set()); };
  const leadSet = useMemo(() => new Set(leads), [leads]);

  const load = useCallback(async () => {
    setRows(null);
    const { data, error } = await sb.rpc('fee_schedule', { p_term: scope === 'term' ? term : null, p_year: scope === 'session' ? termRow?.year_id ?? null : null });
    if (error) return setErr(error); setRows(data ?? []);
  }, [sb, scope, term, termRow]);
  useEffect(() => { load(); }, [load]);

  const classes = useMemo(() => { const m = new Map(); for (const r of rows ?? []) m.set(r.class_id, { id: r.class_id, name: r.class_name, section: r.section, sub_section: r.sub_section }); return [...m.values()].sort((a, b) => a.name.localeCompare(b.name)); }, [rows]);
  const sections = [...new Set(classes.map((c) => c.section))]; const subs = [...new Set(classes.filter((c) => !f.section || c.section === f.section).map((c) => c.sub_section))];
  const shown = useMemo(() => filterRows(rows ?? [], f), [rows, f]);
  const tot = useMemo(() => totals(shown), [shown]);
  const students = useMemo(() => byStudent(shown), [shown]);
  const chosen = shown.filter((r) => sel.has(r.line_id));
  const toggle = (id) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const ignorable = shown.filter((r) => canIgnoreHint(r, roles, leadSet));

  async function ignore(list) {
    if (!list.length || !confirm(`Mark ${list.length} line(s) as Ignored? The system will mark them Cleared and they will not be brought forward.`)) return;
    setBusy(true); setMsg(null); const { data, error } = await sb.rpc('ignore_lines', { p_lines: list.map((r) => r.line_id), p_note: note || null }); setBusy(false);
    if (error) return setMsg({ ok: false, m: error.message });
    setMsg({ ok: true, m: `${data.ignored} line(s) ignored and cleared.${data.not_allowed ? ` ${data.not_allowed} not allowed for your role.` : ''}${data.awaiting_bursar ? ` ${data.awaiting_bursar} have evidence waiting for the bursar.` : ''}` }); setSel(new Set()); load();
  }
  async function remind(ids) {
    if (!ids.length || !confirm(`Send a personalised reminder to the parents of ${ids.length} student(s)?`)) return;
    setBusy(true); setMsg(null); const { data, error } = await sb.rpc('notify_uncleared', { p_term: term, p_class: f.cls || null, p_students: ids }); setBusy(false);
    setMsg(error ? { ok: false, m: error.message } : { ok: true, m: `${data} parent inbox(es) notified.` });
  }
  async function catchUp() { setBusy(true); setMsg(null); const a = await sb.rpc('issue_schedule', { p_term: term, p_class: null }); const b = await sb.rpc('carry_due'); setBusy(false); const e = a.error || b.error; setMsg(e ? { ok: false, m: e.message } : { ok: true, m: `Checked: ${a.data} missing line(s) added, ${b.data} brought forward.` }); load(); }

  return (<section style={{ marginTop: 28 }}>
    <h2>Schedules and clearing</h2>
    {err && <Notice error={err} onClose={() => setErr(null)} />}{msg && <Notice msg={msg} onClose={() => setMsg(null)} />}
    <div className="row">
      <div><label htmlFor="sc-sc">Show</label><select id="sc-sc" value={scope} onChange={(e) => setScope(e.target.value)}><option value="term">This term</option><option value="session">Whole session</option><option value="all">Every session</option></select></div>
      {sections.length > 1 && <div><label htmlFor="sc-s">Section</label><select id="sc-s" value={f.section} onChange={(e) => upd('section', e.target.value)}><option value="">All</option>{sections.map((s) => <option key={s} value={s}>{s === 'basic' ? 'Basic' : 'Secondary'}</option>)}</select></div>}
      {subs.length > 1 && <div><label htmlFor="sc-ss">Sub-section</label><select id="sc-ss" value={f.sub} onChange={(e) => upd('sub', e.target.value)}><option value="">All</option>{subs.map((s) => <option key={s} value={s}>{SUBS[s]}</option>)}</select></div>}
      {classes.length > 1 && <div><label htmlFor="sc-c">Class</label><select id="sc-c" value={f.cls} onChange={(e) => upd('cls', e.target.value)}><option value="">All</option>{classes.filter((c) => (!f.section || c.section === f.section) && (!f.sub || c.sub_section === f.sub)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>}
      <div><label htmlFor="sc-g">Gender</label><select id="sc-g" value={f.gender} onChange={(e) => upd('gender', e.target.value)}><option value="">All</option><option value="Male">Boys</option><option value="Female">Girls</option></select></div>
      <div><label htmlFor="sc-st">Status</label><select id="sc-st" value={f.state} onChange={(e) => upd('state', e.target.value)}><option value="">All</option><option value="open">Not cleared (owed)</option><option value="outstanding">Outstanding</option><option value="awaiting">Awaiting bursar</option><option value="cleared">Cleared</option><option value="ignored">Ignored</option><option value="carried">Brought forward</option></select></div>
      <div><label htmlFor="sc-l">Level</label><select id="sc-l" value={f.level} onChange={(e) => upd('level', e.target.value)}><option value="">All</option><option value="1">Level 1</option><option value="2">Level 2</option><option value="3">Level 3</option><option value="bf">Brought forward</option></select></div>
      <div style={{ flex: 1 }}><label htmlFor="sc-q">Student, admission no. or parent</label><input id="sc-q" value={f.q} onChange={(e) => upd('q', e.target.value)} /></div>
    </div>
    {rows == null ? <p className="auth-hint">Loading…</p> : <>
      <div className="at-grid"><div className="at-kpi"><b>{naira(tot.owed)}</b><small>Owed (outstanding + awaiting)</small></div><div className="at-kpi"><b>{naira(tot.cleared + tot.ignored)}</b><small>Cleared (incl. ignored {naira(tot.ignored)})</small></div>
        <div className="at-kpi"><b>{naira(tot.carried)}</b><small>Brought forward to later terms</small></div><div className="at-kpi"><b>{students.length}</b><small>Students · {tot.lines} lines</small></div></div>
      <div className="row"><div className="tabs" role="tablist" style={{ margin: 0 }}>{[['lines', 'Lines'], ['students', 'By student']].map(([k, l]) => <a key={k} href="#" className={view === k ? 'on' : ''} onClick={(e) => { e.preventDefault(); setView(k); }}>{l}</a>)}</div>
        <button className="btn ghost small" onClick={() => download('schedules.csv', scheduleCsv(shown))}>Download {shown.length} line(s)</button>
        {chosen.length > 0 && <button className="btn ghost small" onClick={() => download('schedules-selected.csv', scheduleCsv(chosen))}>Download {chosen.length} selected</button>}
        <button className="btn ghost small" onClick={() => window.print()}>Print</button>
        {isBursar && <button className="btn ghost small" disabled={busy} onClick={catchUp}>Re-check schedules and carry-forward</button>}</div>
      {(ignorable.length > 0) && <div className="row" style={{ marginTop: 8 }}><div style={{ flex: 1 }}><label htmlFor="sc-n">Reason for ignoring (optional)</label><input id="sc-n" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} /></div>
        <button className="btn" disabled={busy || chosen.filter((r) => canIgnoreHint(r, roles, leadSet)).length === 0} onClick={() => ignore(chosen.filter((r) => canIgnoreHint(r, roles, leadSet)))}>Ignore {chosen.filter((r) => canIgnoreHint(r, roles, leadSet)).length} selected</button>
        <button className="btn ghost" disabled={busy} onClick={() => ignore(ignorable)}>Ignore all {ignorable.length} I may ignore here</button></div>}
      {isBursar && <p style={{ marginTop: 8 }}><button className="btn" disabled={busy || reminderStudents(chosen.length ? chosen : shown).length === 0} onClick={() => remind(reminderStudents(chosen.length ? chosen : shown))}>Notify parents of {reminderStudents(chosen.length ? chosen : shown).length} student(s) with uncleared items{chosen.length ? ' (selected)' : ''}</button>
        <span className="auth-hint"> A personalised message lands in each parent’s inbox with every uncleared item and brought-forward amount for this term.</span></p>}
      <div style={{ overflowX: 'auto' }}>
        {view === 'lines' ? <RecordFrame style={{ marginTop: 10 }} noun="lines" head={<thead><tr><th><input type="checkbox" aria-label="Select all shown" checked={shown.length > 0 && sel.size === shown.length} onChange={(e) => setSel(e.target.checked ? new Set(shown.map((r) => r.line_id)) : new Set())} /></th><th>Student</th><th>Class</th><th>Item</th><th>Level</th><th>Amount</th><th>Status</th><th>Parent</th></tr></thead>}>
          {shown.slice(0, 1500).map((r) => (<tr key={r.line_id}><td><input type="checkbox" checked={sel.has(r.line_id)} onChange={() => toggle(r.line_id)} aria-label={`Select ${r.student_name} ${r.title}`} /></td>
            <td>{r.student_name}<div className="auth-hint">{r.admission_no}</div></td><td>{r.class_name}</td><td>{r.title}{scope !== 'term' && <div className="auth-hint">{r.year_name}, Term {r.term_number}</div>}</td><td>{VARIANT[r.variant] ?? '—'}</td><td>{naira(r.amount_ngn)}</td>
            <td><span className={'badge ' + STATE[r.state][1]}>{STATE[r.state][0]}</span>{r.note && <div className="auth-hint">{r.note}</div>}</td><td className="auth-hint">{r.parents}</td></tr>))}</RecordFrame>
        : <RecordFrame style={{ marginTop: 10 }} noun="students" head={<thead><tr><th>Student</th><th>Class</th><th>Parent</th><th>Lines</th><th>Owed</th><th>Cleared</th><th>Brought fwd</th></tr></thead>}>
          {students.slice(0, 1500).map((s) => (<tr key={s.student_id}><td>{s.student_name}<div className="auth-hint">{s.admission_no}</div></td><td>{s.class_name}</td><td className="auth-hint">{s.parents}</td><td>{s.lines}</td><td>{naira(s.owed)}</td><td>{naira(s.cleared)}</td><td>{naira(s.carried)}</td></tr>))}</RecordFrame>}
      </div>
      {shown.length > 1500 && <p className="auth-hint">Showing the first 1500; narrow the filters or download the CSV for everything.</p>}
      {shown.length === 0 && <div className="empty">Nothing matches.</div>}
    </>}
  </section>);
}
