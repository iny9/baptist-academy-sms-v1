'use client';
import { useMemo, useState } from 'react';
import { EMPTY_FILTER, TERM_LABEL, SECTION_LABEL, SUB_LABEL, scopeOptions, fixFilter, topThree, champions, subjectList, promotionView } from '@/lib/dash-logic';
import TopThree from './TopThree';
import Champions from './Champions';
import PromotionDonut from './PromotionDonut';
import ClassLevel from './ClassLevel';
import StudentLevel from './StudentLevel';
import KpiStrip from './KpiStrip';

const D0 = { gender: '', subject: '', by: 'gender' };

// Top Level Analytics. All three data sets arrive once per session; every filter below works instantly in the browser.
export default function DashboardClient({ yearId, students, leaders, pass, yearName, target, initialTerm = 0 }) {
  // opens on the term running now (when this is the running session and that term has scores), otherwise on the whole session
  const startTerm = students.some((r) => Number(r.term_no) === Number(initialTerm)) ? Number(initialTerm) : 0;
  const START = { ...EMPTY_FILTER, term: startTerm };
  const [f, setF] = useState(START);
  const [subject, setSubject] = useState('');
  const [d, setD] = useState(D0);
  const [view, setView] = useState('top');      // 'top' | 'class'
  const [student, setStudent] = useState('');   // followed student (shared by the class-level charts)
  const setFilter = (patch) => setF((cur) => fixFilter({ ...cur, ...patch }, students));
  const opts = useMemo(() => scopeOptions(students, f), [students, f]);
  const have = useMemo(() => new Set(students.map((r) => Number(r.term_no))), [students]);
  const subjects = useMemo(() => subjectList(leaders), [leaders]);
  const top = useMemo(() => topThree(students, f), [students, f]);
  const champs = useMemo(() => champions(leaders, f, subject), [leaders, f, subject]);
  const promo = useMemo(() => promotionView(students, pass, f, d), [students, pass, f, d]);

  const className = opts.classes.find((c) => c.id === f.cls)?.name;
  const caption = [TERM_LABEL[f.term], f.section && SECTION_LABEL[f.section], f.sub && SUB_LABEL[f.sub], className].filter(Boolean).join(', ');
  const dirty = f.term !== startTerm || f.section || f.sub || f.cls || subject || d.gender || d.subject || d.by !== 'gender' || student;
  const reset = () => { setF(START); setSubject(''); setD(D0); setStudent(''); };
  const drill = (by, id) => {
    if (by === 'class') setFilter({ cls: id }); else if (by === 'section') setFilter({ section: id, sub: '', cls: '' }); else if (by === 'sub') setFilter({ sub: id, cls: '' });
    else if (by === 'gender') setD((x) => ({ ...x, gender: id })); else setD((x) => ({ ...x, subject: id }));
  };

  if (students.length === 0) return <div className="gd-glass gd-empty">No scores have been recorded for session {yearName} in the sections you can view.</div>;
  return (<>
    <nav className="gd-tabs" aria-label="Dashboard sections">
      {[['top', 'Top level'], ['class', 'Class level'], ['student', 'Student level']].map(([k, label]) => (
        <button key={k} type="button" className={'gd-tab' + (view === k ? ' on' : '')} aria-current={view === k ? 'page' : undefined} onClick={() => setView(k)}>{label}</button>))}
    </nav>
    <section className="gd-glass gd-filters" aria-label="Filters">
      <div className="gd-terms" role="group" aria-label="Term">
        {[0, 1, 2, 3].map((t) => (
          <button key={t} type="button" className={'gd-seg' + (f.term === t ? ' on' : '')} aria-pressed={f.term === t} disabled={!have.has(t)} title={have.has(t) ? '' : 'No scores recorded yet'} onClick={() => setFilter({ term: t })}>
            {t === 0 ? 'Whole session' : 'Term ' + t}</button>))}
      </div>
      <div className="gd-selects">
        <div className="gd-field"><label htmlFor="gd-sec">Section</label>
          <select id="gd-sec" value={f.section} onChange={(e) => setFilter({ section: e.target.value })}><option value="">All sections</option>{opts.sections.map((s) => <option key={s} value={s}>{SECTION_LABEL[s] ?? s}</option>)}</select></div>
        <div className="gd-field"><label htmlFor="gd-sub">Sub-section</label>
          <select id="gd-sub" value={f.sub} onChange={(e) => setFilter({ sub: e.target.value })}><option value="">All sub-sections</option>{opts.subs.map((s) => <option key={s} value={s}>{SUB_LABEL[s] ?? s}</option>)}</select></div>
        <div className="gd-field"><label htmlFor="gd-cls">Class</label>
          <select id="gd-cls" value={f.cls} onChange={(e) => setFilter({ cls: e.target.value })}><option value="">All classes</option>{opts.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <button type="button" className="gd-reset" onClick={reset} disabled={!dirty}>Reset</button>
      </div>
    </section>

    <KpiStrip students={students} f={f} />

    {view === 'top' && <>
    <h2 className="gd-h">Top students <small>{caption}</small></h2>
    <TopThree top={top} caption={caption} />

    <div className="gd-two">
      <Champions list={champs} subjects={subjects} subject={subject} onSubject={setSubject} term={f.term} />
      <PromotionDonut view={promo} d={d} onChange={(p) => setD((x) => ({ ...x, ...p }))} onDrill={drill} subjects={subjects} sessionName={yearName} target={target} term={f.term} />
    </div>
    </>}
    {view === 'student' && <StudentLevel yearId={yearId} students={students} leaders={leaders} f={f} student={student} onStudent={setStudent} caption={caption} />}
    {view === 'class' && <ClassLevel yearId={yearId} students={students} leaders={leaders} f={f} target={target} student={student} onStudent={setStudent} />}
  </>);
}
