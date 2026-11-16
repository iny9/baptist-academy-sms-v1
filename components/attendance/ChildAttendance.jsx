'use client';
import { useEffect, useMemo, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase-browser';
import Notice from '@/components/Notice';
import { childSummary, dayLabel, monthLabel, monthOf } from '@/lib/attendance-logic';
import RecordFrame from '@/components/RecordFrame';

export default function ChildAttendance({ kids, years, currentYear = '' }) {
  const sb = useMemo(() => supabaseBrowser(), []);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
  const [kid, setKid] = useState(kids[0].id); const [year, setYear] = useState(years.some((y) => y.id === currentYear) ? currentYear : years[0]?.id ?? '');
  const [data, setData] = useState(null); const [err, setErr] = useState(null); const [tab, setTab] = useState('daily'); const [tno, setTno] = useState(0); const [month, setMonth] = useState('');
  useEffect(() => {
    setData(null); if (!year) return;
    sb.rpc('att_child', { p_student: kid, p_year: year }).then(({ data: d, error }) => { if (error) return setErr(error); setData(d); });
  }, [sb, kid, year]);
  const sum = useMemo(() => (data ? childSummary(data, today) : null), [data, today]);
  const term = sum?.terms.find((t) => t.number === tno) ?? sum?.terms.find((t) => t.days.length) ?? sum?.terms[0];
  const months = term ? [...new Set(term.days.map((d) => monthOf(d.day)))] : [];
  const m = months.includes(month) ? month : months[months.length - 1] ?? '';
  const holidays = data?.holidays ?? [];
  const holOn = (iso) => holidays.find((h) => iso >= h.from && iso <= h.to);
  const dayMap = new Map((term?.days ?? []).map((d) => [d.day, d]));
  // calendar cells for the chosen month, Monday first
  const cells = useMemo(() => {
    if (!m) return [];
    const first = new Date(m + '-01T00:00:00Z'), n = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate(), lead = (first.getUTCDay() + 6) % 7;
    return [...Array(lead).fill(null), ...Array.from({ length: n }, (_, i) => m + '-' + String(i + 1).padStart(2, '0'))];
  }, [m]);
  const kidName = kids.find((k) => k.id === kid);
  return (<>
    <div className="row">
      {kids.length > 1 && <div><label htmlFor="c-k">Child</label><select id="c-k" value={kid} onChange={(e) => setKid(e.target.value)}>{kids.map((k) => <option key={k.id} value={k.id}>{k.last_name} {k.first_name}</option>)}</select></div>}
      <div><label htmlFor="c-y">Session</label><select id="c-y" value={year} onChange={(e) => setYear(e.target.value)}>{years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}</select></div>
      {sum && <div><label htmlFor="c-t">Term</label><select id="c-t" value={term?.number ?? ''} onChange={(e) => { setTno(Number(e.target.value)); setMonth(''); }}>{sum.terms.map((t) => <option key={t.number} value={t.number}>Term {t.number}</option>)}</select></div>}
    </div>
    {err && <Notice error={err} onClose={() => setErr(null)} />}
    {!sum ? <p className="auth-hint">Loading…</p> : <>
      <div className="at-grid"><div className="at-kpi"><b>{term?.pct ?? '—'}{term?.pct != null && '%'}</b><small>{kidName.last_name} {kidName.first_name}: this term so far</small></div>
        <div className="at-kpi"><b>{term?.present ?? 0}</b><small>Times present of {term?.open ?? 0}</small></div><div className="at-kpi"><b>{term?.absent ?? 0}</b><small>Times absent</small></div>
        <div className="at-kpi"><b>{sum.session.pct ?? '—'}{sum.session.pct != null && '%'}</b><small>Whole session so far</small></div></div>
      {term && !term.closed && <p className="auth-hint">The class teacher has not closed this term’s register yet, so the figures can still change.</p>}
      <div className="tabs" role="tablist">{[['daily', 'Daily'], ['monthly', 'Monthly'], ['termly', 'Termly'], ['session', 'Session']].map(([k, l]) => <a key={k} href="#" className={tab === k ? 'on' : ''} onClick={(e) => { e.preventDefault(); setTab(k); }}>{l}</a>)}</div>
      {tab === 'daily' && (months.length === 0 ? <div className="empty">No school days yet for this term.</div> : <>
        <div className="row"><div><label htmlFor="c-m">Month</label><select id="c-m" value={m} onChange={(e) => setMonth(e.target.value)}>{months.map((x) => <option key={x} value={x}>{monthLabel(x)}</option>)}</select></div></div>
        <div className="at-cal" style={{ marginTop: 10 }}>{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <strong key={d} style={{ textAlign: 'center', fontSize: '.75rem' }}>{d}</strong>)}
          {cells.map((iso, i) => { if (!iso) return <div key={'e' + i} />; const d = dayMap.get(iso), h = holOn(iso);
            return (<div key={iso} className={'at-cell' + (d ? '' : ' off')}><strong>{Number(iso.slice(8))}</strong>
              {d ? <div className="t" title="Morning, afternoon"><span className={'at-dot ' + (d.am ? 'y' : 'n')} aria-label={d.am ? 'Morning present' : 'Morning absent'} /><span className={'at-dot ' + (d.pm ? 'y' : 'n')} aria-label={d.pm ? 'Afternoon present' : 'Afternoon absent'} /></div> : h ? <small>{h.note || 'Holiday'}</small> : null}</div>); })}</div>
        <p className="auth-hint">First dot is the morning, second the afternoon. Green = present, red = absent. Grey days are weekends, holidays or days not yet come.</p></>)}
      {tab === 'monthly' && <RecordFrame noun="rows" head={<thead><tr><th>Month</th><th>Present</th><th>Absent</th><th>Out of</th><th>Attendance</th></tr></thead>}>{(term?.months ?? []).map((x) => <tr key={x.month}><td>{x.label}</td><td>{x.present}</td><td>{x.absent}</td><td>{x.open}</td><td>{x.pct ?? '—'}%</td></tr>)}</RecordFrame>}
      {tab === 'termly' && <RecordFrame noun="rows" head={<thead><tr><th>Term</th><th>Present</th><th>Absent</th><th>Out of (so far)</th><th>Attendance</th><th>Register</th></tr></thead>}>{sum.terms.map((t) => <tr key={t.number}><td>Term {t.number}</td><td>{t.present}</td><td>{t.absent}</td><td>{t.open}</td><td>{t.pct ?? '—'}{t.pct != null && '%'}</td><td>{t.closed ? <span className="badge green">Closed</span> : <span className="badge gold">Open</span>}</td></tr>)}</RecordFrame>}
      {tab === 'session' && <RecordFrame noun="rows"><tr><th>Times present</th><td>{sum.session.present}</td></tr><tr><th>Times absent</th><td>{sum.session.absent}</td></tr><tr><th>Times school opened so far</th><td>{sum.session.open}</td></tr><tr><th>Attendance</th><td>{sum.session.pct ?? '—'}{sum.session.pct != null && '%'}</td></tr></RecordFrame>}
    </>}
  </>);
}
