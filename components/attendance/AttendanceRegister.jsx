'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase-browser';
import Notice from '@/components/Notice';
import { dayLabel, fmtTime, mondayOf, pct } from '@/lib/attendance-logic';
import { pickCurrentTerm } from '@/lib/current-term';

const today0 = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });

export default function AttendanceRegister({ terms, classes }) {
  const sb = useMemo(() => supabaseBrowser(), []);
  const now = today0();
  const [term, setTerm] = useState(() => (pickCurrentTerm(terms) ?? terms[0])?.id ?? '');
  const [cls, setCls] = useState(classes[0]?.id ?? '');
  const [info, setInfo] = useState(null);
  const [day, setDay] = useState('');
  const [half, setHalf] = useState('M');
  const [reg, setReg] = useState(null);
  const [ticked, setTicked] = useState(new Set());
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const ok = (m) => setMsg({ ok: true, m }); const bad = (e) => setMsg({ ok: false, m: e?.message ?? String(e) });

  const loadInfo = useCallback(async () => {
    if (!term || !cls) return;
    const { data, error } = await sb.rpc('att_teacher_term', { p_class: cls, p_term: term });
    if (error) return bad(error); setInfo(data);
  }, [sb, term, cls]);
  useEffect(() => { setInfo(null); setDay(''); setReg(null); loadInfo(); }, [loadInfo]);

  // open the most useful day by default: today if it is a school day, otherwise the latest day not after today
  useEffect(() => {
    if (!info || day) return;
    const list = info.days.filter((d) => d.day <= info.today);
    setDay((list.find((d) => d.day === info.today) ?? list[list.length - 1])?.day ?? '');
  }, [info, day]);

  const loadReg = useCallback(async () => {
    if (!day || !cls) return;
    const { data, error } = await sb.rpc('att_register', { p_class: cls, p_day: day });
    if (error) return bad(error);
    setReg(data); setTicked(new Set(half === 'M' ? data.am : data.pm));
  }, [sb, cls, day, half]);
  useEffect(() => { setReg(null); loadReg(); }, [loadReg]);

  const saved = reg && (half === 'M' ? reg.am_at : reg.pm_at);
  const weekClosed = info && day && info.weeks.some((w) => w.week_start === mondayOf(day));
  const locked = !!info?.term_closed || weekClosed;
  const canEdit = info?.is_lead && !locked;
  const toggle = (id) => { const n = new Set(ticked); n.has(id) ? n.delete(id) : n.add(id); setTicked(n); };

  async function save() {
    setBusy(true); setMsg(null);
    const { data, error } = await sb.rpc('att_save_register', { p_class: cls, p_term: term, p_day: day, p_half: half, p_present: [...ticked] });
    setBusy(false); if (error) return bad(error);
    ok(`${half === 'M' ? 'Morning' : 'Afternoon'} register saved: ${data.present} of ${data.total} present.`); loadInfo(); loadReg();
  }
  async function act(fn, args, done) { setBusy(true); setMsg(null); const { error } = await sb.rpc(fn, args); setBusy(false); if (error) return bad(error); ok(done); loadInfo(); }

  const weeks = useMemo(() => {
    if (!info) return [];
    const m = new Map();
    for (const d of info.days) { const o = m.get(d.week) ?? { week: d.week, days: [] }; o.days.push(d); m.set(d.week, o); }
    return [...m.values()].map((w) => ({ ...w, closed: info.weeks.find((x) => x.week_start === w.week) ?? null, complete: w.days.every((d) => d.am_at && d.pm_at) }));
  }, [info]);
  const allComplete = weeks.length > 0 && weeks.every((w) => w.complete);
  const stat = (d) => (d.am_at && d.pm_at ? ['full', 'Both saved'] : d.am_at || d.pm_at ? ['part', d.am_at ? 'Morning only' : 'Afternoon only'] : d.day > (info?.today ?? '') ? ['', 'Not yet'] : ['none', 'Not taken']);

  return (<>
    <div className="row">
      <div><label htmlFor="at-term">Session and term</label><select id="at-term" value={term} onChange={(e) => setTerm(e.target.value)}>
        {terms.map((t) => <option key={t.id} value={t.id}>{t.academic_years.name}, Term {t.number}{t.is_active === false ? ' (inactive)' : ''}</option>)}</select></div>
      <div><label htmlFor="at-class">Class</label><select id="at-class" value={cls} onChange={(e) => setCls(e.target.value)}>
        {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
    </div>
    {msg && <Notice msg={msg} onClose={() => setMsg(null)} />}
    {!info ? <p className="auth-hint">Loading…</p> : <>
      {!info.is_lead && <Notice msg={{ ok: false, info: true, m: 'Only the first class teacher (form master) of this class takes attendance. You can view it here.' }} />}
      {info.exam_end_on == null ? <div className="msg err" role="alert">The exam end date for this term has not been set yet. The administrator or exam officer sets it in the Attendance calendar, then attendance opens.</div> : <>
        <div className="at-grid">
          <div className="at-kpi"><b>{info.times_open}</b><small>Times school opens this term (mornings + afternoons, to exam end {dayLabel(info.exam_end_on)})</small></div>
          <div className="at-kpi"><b>{info.days.length}</b><small>School days</small></div>
          <div className="at-kpi"><b>{info.students}</b><small>Students on the register</small></div>
          <div className="at-kpi"><b>{info.term_closed ? 'Closed' : allComplete ? 'Ready to close' : 'Open'}</b><small>{info.term_closed ? 'since ' + fmtTime(info.term_closed) : 'Term register'}</small></div>
        </div>
        {info.holidays.length > 0 && <p className="auth-hint">Holidays: {info.holidays.map((h) => `${dayLabel(h.from)}${h.to !== h.from ? ' to ' + dayLabel(h.to) : ''}${h.note ? ' (' + h.note + ')' : ''}`).join('; ')}. Weekends and holidays cannot be ticked.</p>}

        <h3>Pick a day</h3>
        {weeks.map((w) => (<div key={w.week}>
          <div className="at-week"><strong>Week of {dayLabel(w.week)}</strong>
            {w.closed ? <><span className="badge green">Closed, attendance {w.closed.pct_all ?? '—'}% (boys {w.closed.pct_m ?? '—'}%, girls {w.closed.pct_f ?? '—'}%)</span>
              {info.is_lead && !info.term_closed && <button className="btn ghost small" disabled={busy} onClick={() => act('att_reopen_week', { p_class: cls, p_term: term, p_week: w.week }, 'Week reopened.')}>Reopen week</button>}</>
              : <>{w.complete ? <span className="badge gold">All days saved</span> : <span className="badge">In progress</span>}
                {info.is_lead && !info.term_closed && w.complete && <button className="btn small" disabled={busy} onClick={() => act('att_close_week', { p_class: cls, p_term: term, p_week: w.week }, 'Week closed. Your head can see its percentages.')}>Close week</button>}</>}
          </div>
          <div className="at-days">{w.days.map((d) => { const [k, t] = stat(d); const dis = d.day > info.today; return (
            <button key={d.day} type="button" className={'at-day' + (day === d.day ? ' on' : '')} disabled={dis} onClick={() => setDay(d.day)} style={dis ? { opacity: .5, cursor: 'not-allowed' } : null}>
              <strong>{dayLabel(d.day)}</strong><small className={k}>{t}</small>
              <small>AM {d.am_at ? fmtTime(d.am_at) : '—'} · PM {d.pm_at ? fmtTime(d.pm_at) : '—'}</small></button>); })}</div>
        </div>))}

        {day && <div className="panel" style={{ marginTop: 18 }}>
          <div className="row"><h3 style={{ margin: 0 }}>{dayLabel(day)}</h3>
            <div className="tabs" role="tablist" style={{ margin: 0 }}>{[['M', 'Morning'], ['A', 'Afternoon']].map(([k, l]) => <a key={k} href="#" className={half === k ? 'on' : ''} onClick={(e) => { e.preventDefault(); setHalf(k); }}>{l}</a>)}</div>
            {saved ? <span className="badge green">Saved {fmtTime(saved)}</span> : <span className="badge gold">Not saved yet</span>}</div>
          {locked && <p className="auth-hint">{info.term_closed ? 'The term register is closed.' : 'This week is closed.'} Reopen it to make changes.</p>}
          {!reg ? <p className="auth-hint">Loading…</p> : <>
            {canEdit && <p><button type="button" className="btn ghost small" onClick={() => setTicked(new Set(reg.students.map((s) => s.id)))}>Everyone present</button>{' '}
              <button type="button" className="btn ghost small" onClick={() => setTicked(new Set())}>Clear all</button>{' '}
              <button type="button" className="btn ghost small" onClick={() => setTicked(new Set(reg.students.filter((s) => !ticked.has(s.id)).map((s) => s.id)))}>Invert</button></p>}
            <div style={{ overflowX: 'auto' }}><table><thead><tr><th style={{ width: 44 }}>Here</th><th>#</th><th>Student</th><th>Gender</th></tr></thead>
              <tbody>{reg.students.map((s, i) => (<tr key={s.id}><td><input type="checkbox" checked={ticked.has(s.id)} disabled={!canEdit} onChange={() => toggle(s.id)} aria-label={`${s.name} present`} /></td><td>{i + 1}</td><td>{s.name}</td><td>{s.gender}</td></tr>))}</tbody></table></div>
            <p>{ticked.size} of {reg.students.length} present ({pct(ticked.size, reg.students.length) ?? 0}%).{' '}
              {canEdit && <button className="btn" disabled={busy} onClick={save}>{busy ? 'Saving…' : `Save ${half === 'M' ? 'morning' : 'afternoon'} register`}</button>}</p></>}
        </div>}

        {info.is_lead && <div className="panel" style={{ marginTop: 18 }}><h3>Close the term</h3>
          {info.term_closed ? <p>The term register was closed {fmtTime(info.term_closed)}. Times school opened ({info.times_open}), times present, times absent and punctuality are final on the report cards.{' '}
            <button className="btn ghost small" disabled={busy} onClick={() => act('att_reopen_term', { p_class: cls, p_term: term }, 'Term reopened.')}>Reopen term</button></p>
            : <p>When every school day up to the exam end date has both registers saved, close the term. Weeks still open are closed for you.{' '}
              <button className="btn" disabled={busy || !allComplete} onClick={() => confirm('Close attendance for this term?') && act('att_close_term', { p_class: cls, p_term: term }, 'Term attendance closed.')}>Close term attendance</button>
              {!allComplete && <span className="auth-hint"> {weeks.flatMap((w) => w.days).filter((d) => !(d.am_at && d.pm_at)).length} school day(s) still need both registers.</span>}</p>}
        </div>}
      </>}</>}
  </>);
}
