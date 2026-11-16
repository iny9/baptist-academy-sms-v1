import { notFound } from 'next/navigation';
import Link from 'next/link';
import Notice from '@/components/Notice';
import { getSessionRoles, supabaseServer } from '@/lib/supabase-server';
import PrintButton from '@/components/PrintButton';
import BackButton from '@/components/BackButton';
import DocHeader from '@/components/DocHeader';
import PrimaryCard from '@/components/PrimaryCard';
import HarvardCard from '@/components/HarvardCard';
import Stamp, { fmtDateLong } from '@/components/Stamp';
import { isUuid } from '@/lib/validate';

const LEVELS = ['', 'Poor', 'Average', 'Good', 'Very good', 'Excellent'];
const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const ord = (n) => { const v = n % 100, s = ['th', 'st', 'nd', 'rd']; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
import { gradeOf, GRADE_KEY, GRADE_COLOR as COLOR } from '@/lib/grading';

export default async function ReportCard({ params, searchParams = {} }) {
  const { user, roles } = await getSessionRoles();
  if (!isUuid(params.student) || !isUuid(params.term)) notFound();
  const sb = supabaseServer();
  const { data: st } = await sb.from('students_with_age').select('*').eq('id', params.student).maybeSingle();
  if (!st) notFound();
  // A parent sees a term's report only when that term's fee schedule is cleared. School users with result access are not affected.
  const schoolViewer = roles.some((r) => ['admin', 'exam_officer', 'class_teacher', 'principal', 'headmaster'].includes(r.role));
  if (!schoolViewer) {
    const { data: lk } = await sb.rpc('results_lock', { p_student: st.id, p_term: params.term });
    if (lk?.[0] && !lk[0].cleared) return (<div className="panel" style={{ maxWidth: 560, margin: '40px auto' }}>
      <h2 style={{ marginTop: 0 }}>This report is locked</h2>
      <p>{st.first_name}’s report for this term opens once the term’s fee schedule is fully paid and confirmed by the bursar. Still to clear: <strong>₦{Number(lk[0].owed).toLocaleString('en-NG', { minimumFractionDigits: 2 })}</strong>.</p>
      <p><Link className="btn" href={`/admin/payments?term=${params.term}`}>Open the payment schedule</Link> <BackButton fallback="/admin/results" label="Back to results" /></p></div>);
  }
  const [{ data: cls }, { data: term }, { data: set }, { data: all, error: resultsError }] = await Promise.all([
    sb.from('classes').select('name,section').eq('id', st.class_id).single(),
    sb.from('terms').select('*,academic_years(name,target_average)').eq('id', params.term).single(),
    sb.from('site_settings').select('key,value'),
    sb.rpc('term_results', { p_term: params.term, p_class: st.class_id }),
  ]);
  if (!term) notFound();
  const { data: excl } = await sb.from('term_exclusions').select('reason').eq('term_id', term.id).eq('student_id', st.id).maybeSingle();
  const inactiveNote = term.is_active === false ? 'This term is inactive for all students.' : excl ? `This term is inactive for this student.${excl.reason ? ' ' + excl.reason : ''}` : null;
  const rows = (all ?? []).filter((r) => r.student_id === st.id);
  const first = rows[0];
  // class average per subject, computed over the whole class even when the viewer is a parent who can only see their own child
  // these reads do not depend on each other: start them together (speed)
  const avgP = Promise.resolve(sb.rpc('class_subject_averages', { p_term: params.term, p_class: st.class_id }));
  const headP = Promise.resolve(sb.rpc('section_head', { p_section: cls.section }));
  const lockP = Promise.resolve(sb.from('result_locks').select('locked_at').eq('term_id', term.id).eq('section', cls.section).maybeSingle());
  const { data: avgRows } = await avgP;
  const classAvg = Object.fromEntries((avgRows ?? []).map((r) => [r.subject_id, Number(r.average)]));
  const [{ data: dOpen }, { data: att }, { data: traits }, { data: rt }, { data: yt }] = await Promise.all([
    sb.from('school_days').select('days_open').eq('term_id', term.id).eq('section', cls.section).maybeSingle(),
    sb.from('attendance').select('days_present').eq('term_id', term.id).eq('student_id', st.id).maybeSingle(),
    sb.from('rating_traits').select('*').order('name'),
    sb.from('ratings').select('trait_id,score').eq('term_id', term.id).eq('student_id', st.id),
    sb.from('terms').select('id,number').eq('year_id', term.year_id).lte('number', term.number).order('number'),
  ]);
  const per = await Promise.all((yt ?? []).map(async (t) => [t, t.id === term.id ? all : (await sb.rpc('term_results', { p_term: t.id, p_class: st.class_id })).data]));
  const trend = [];
  for (const [t, rr] of per) { const m = (rr ?? []).find((r) => r.student_id === st.id); if (m) trend.push({ n: t.number, avg: Number(m.term_average) }); }
  const S = Object.fromEntries((set ?? []).map((x) => [x.key, x.value]));
  const { data: lockRow } = await lockP;
  // A class teacher (with no wider results role) may only VIEW the result of a class they lead: no download button, and the card is hidden if printed
  const viewOnly = roles.some((r) => r.role === 'class_teacher') && !roles.some((r) => ['admin', 'exam_officer', 'principal', 'headmaster', 'parent'].includes(r.role));
  const canPrint = roles.some((r) => r.role === 'admin' || (r.role === 'exam_officer' && r.section === cls.section));
  const isAdmin = roles.some((r) => r.role === 'admin');
  const harvard = isAdmin && searchParams.template === 'harvard';   // the Harvard-style card is shown, printed and downloaded by the administrator only
  const open = dOpen?.days_open ?? null, present = att?.days_present ?? null;
  const pct = open && present != null ? Math.round((present / open) * 100) : null;
  const third = term.number === 3, cum = term.number >= 2;   // positions follow the cumulative average from Term 2
  const avgVal = first ? Number(cum ? first.cumulative_average : first.term_average) : null;
  const dom = (d) => (traits ?? []).filter((t) => t.domain === d).map((t) => ({ name: t.name, score: rt?.find((r) => r.trait_id === t.id)?.score }));

  const { data: headRows } = await headP; const head = headRows?.[0] ?? null;
  if (viewOnly) { const { data: led } = await sb.from('class_teachers').select('teacher_id').eq('class_id', st.class_id).eq('teacher_id', user.id).maybeSingle(); if (!led) notFound(); }
  return (<div className={viewOnly ? 'viewonly' : undefined}>
    <p className="noprint" style={{ marginBottom: 8 }}><BackButton fallback="/admin/results" label="Back to results" /></p>
    {resultsError && <Notice error={resultsError} />}
    {isAdmin && <p className="noprint">Template: <Link className={'btn small' + (harvard ? ' ghost' : '')} href={`/admin/results/${term.id}/${st.id}`}>Standard</Link> <Link className={'btn small' + (harvard ? '' : ' ghost')} href={`/admin/results/${term.id}/${st.id}?template=harvard`}>Harvard style</Link></p>}
    {canPrint && <p className="noprint"><a className="btn" href={`/api/pdf?kind=report&term=${term.id}&student=${st.id}${harvard ? '&template=harvard' : ''}`}>Download PDF{harvard ? ' (Harvard style)' : ''}</a> <PrintButton /></p>}
    {lockRow && <div className="notice info noprint" role="status"><span className="n-ico">🔒</span><div className="n-body"><strong>These results are locked</strong><p>This term’s results are final: they can be viewed and downloaded but not changed.</p></div></div>}
    {harvard ? <HarvardCard S={S} term={term} st={st} cls={cls} rows={rows} first={first} classAvg={classAvg} dOpen={open} present={present} affective={dom('affective')} psychomotor={dom('psychomotor')} head={head} inactiveNote={inactiveNote} stampNode={<Stamp S={S} section={cls.section} date={fmtDateLong()} />} />
    : cls.section === 'basic' ? <PrimaryCard head={head} S={S} term={term} st={st} cls={cls} rows={rows} first={first} classAvg={classAvg} trend={trend} dOpen={open} present={present} affective={dom('affective')} psychomotor={dom('psychomotor')} inactiveNote={inactiveNote} /> :
    <article className="rc">
      <DocHeader S={S} pill={`Term ${term.number} report card`} sub={`${term.academic_years.name} session`} />
      <div className="doc">
        <div className="student">
          <div>
            <h2 className="name">{st.last_name} {st.first_name} {st.other_names ?? ''}</h2>
            <div className="meta">{cls.name} &nbsp;|&nbsp; {st.gender} &nbsp;|&nbsp; {st.age_years} years{st.admission_no ? ` | Adm. ${st.admission_no}` : ''}</div>
            <div className="meta">Term {fmt(term.starts_on)} to {fmt(term.ends_on)} &nbsp; Next term begins {fmt(term.next_term_begins) || 'to be announced'}</div>
          </div>
          <div className="photo">{st.photo_url ? <img src={st.photo_url} alt="" /> : <svg width="52" height="52" viewBox="0 0 24 24" aria-label="No photo"><circle cx="12" cy="8" r="4" fill="#B9CDD1" /><path d="M4 21c0-5 4-7 8-7s8 2 8 7z" fill="#B9CDD1" /></svg>}</div>
        </div>
        {inactiveNote && <div className="callout gold"><small>Not active this term</small>{inactiveNote} No scores are counted for this term.</div>}
        <div className="tiles">
          <div className="tile"><div className="l">{cum ? `Cumulative average${first?.terms_counted ? ` (${first.terms_counted} term${first.terms_counted === 1 ? '' : 's'})` : ''}` : 'Term average'}</div><div className="v">{avgVal != null ? avgVal.toFixed(1) : '-'} <span className="s">{avgVal != null ? `Grade ${gradeOf(avgVal)}` : ''}</span></div></div>
          <div className="tile"><div className="l">Position in class</div><div className="v">{first ? ord(first.class_position) : '-'} <span className="s">{first ? `of ${first.class_size}` : ''}</span></div></div>
          <div className="tile"><div className="l">Attendance</div><div className="v">{pct != null ? `${pct}%` : '-'} <span className="s">{present != null ? `${present} of ${open} days` : ''}</span></div></div>
          {third && first?.status ? <div className={'tile ' + (first.status === 'Repeat' ? 'bad' : 'ok')}><div className="l">End of session</div><div className="v">{first.status}</div></div>
            : <div className="tile"><div className="l">Subjects taken</div><div className="v">{rows.length}</div></div>}
        </div>

        <table>
          <thead><tr><th>Subject</th><th>1st CA</th><th>2nd CA</th><th>Exam</th><th>Total</th><th style={{ width: '24%' }}>Score (class average |)</th><th>Avg</th><th>Grade</th></tr></thead>
          <tbody>{rows.map((r) => { const ca = classAvg[r.subject_id]; return (
            <tr key={r.subject_id}><td>{r.subject_name}</td><td>{r.ca1}</td><td>{r.ca2}</td><td>{r.exam}</td><td><b>{r.total}</b></td>
              <td><div className="bar"><i style={{ width: `${Math.min(100, r.total)}%`, background: COLOR[r.grade] }} />{ca != null && <b style={{ left: `${Math.min(100, ca)}%` }} />}</div></td>
              <td style={{ color: '#587278' }}>{ca != null ? ca.toFixed(0) : ''}</td><td><span className={'chip g-' + r.grade}>{r.grade}</span></td></tr>); })}
            {rows.length === 0 && <tr><td colSpan="8">{inactiveNote ?? 'No scores recorded for this term.'}</td></tr>}</tbody>
        </table>

        <div className="two">
          <div className="box"><h4>Progress this session (term average)</h4>
            {trend.length ? <div className="trend">{trend.map((p) => <div key={p.n} className={p.n === term.number ? 'now' : ''}>{p.avg.toFixed(0)}<i style={{ height: Math.max(3, p.avg * 0.34) }} />T{p.n}</div>)}</div> : <small>No earlier terms recorded.</small>}</div>
          <div className="box"><h4>Attendance</h4>
            <div className="progress"><i style={{ width: `${pct ?? 0}%`, background: pct >= 85 ? '#1F8A4C' : pct >= 70 ? '#E0A800' : '#D13B35' }} /></div>
            <div>{present != null ? `Present ${present}   Absent ${open - present}   School opened ${open}` : 'Not recorded'}</div></div>
        </div>
        <div className="two">
          {[['affective', 'Affective domain'], ['psychomotor', 'Psychomotor domain']].map(([d, title]) => (
            <div className="box" key={d}><h4>{title}</h4>{dom(d).map((t) => (
              <div className="trait" key={t.name}><span>{t.name}</span><span className="dots" aria-label={t.score ? `${t.score} of 5` : 'not rated'}>{[1, 2, 3, 4, 5].map((k) => <i key={k} className={'dot' + (t.score >= k ? ' on' : '')} />)}</span><span className="lvl">{t.score ? LEVELS[t.score] : ''}</span></div>))}</div>))}
        </div>
        <div className="remark"><small>{head?.title ?? (cls.section === 'secondary' ? 'Principal' : 'Headmaster / Headmistress')}’s remark</small><p>{first?.remark ?? ''}</p>{head?.full_name && <div className="rm-by">{head.full_name}, {head.title}</div>}</div>
        <div className="sigrow">
          <div className="key">Rating: 5 Excellent, 4 Very good, 3 Good, 2 Average, 1 Poor. {GRADE_KEY}</div>
          <Stamp S={S} section={cls.section} date={fmtDateLong()} />
        </div>
        <div className="foot"><span>{S.school_name} | {S.motto}</span><span>Generated {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</span></div>
      </div>
    </article>}</div>);
}
