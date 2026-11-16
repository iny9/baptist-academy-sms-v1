'use client';
import { useMemo, useState } from 'react';
import Heatmap from './Heatmap';
import TopFourBars from './TopFourBars';
import Radar from './Radar';
import { useScoreTerms, useDomains } from './useScores';
import { studentMap, heatmapView, domainView, topThree, subjectList, byName, SECTION_LABEL, SUB_LABEL, TERM_LABEL } from '@/lib/dash-logic';

const SERIES = [['student', 'Student', '#D9962B'], ['cls', 'Class average', '#4F78EB'], ['scope', 'Selection average', '#1FA89A']];

// Student Analytics. Same filter bar as the other tabs; the controls on the cards are the extra drill-downs.
export default function StudentLevel({ yearId, students, leaders, f, student, onStudent, caption }) {
  const [layout, setLayout] = useState('subjects'), [subject, setSubject] = useState(''), [sort, setSort] = useState('mean');
  const [show, setShow] = useState({ student: true, cls: true, scope: true });
  const meta = useMemo(() => studentMap(students), [students]);
  const subjects = useMemo(() => subjectList(leaders), [leaders]);
  const terms = layout === 'terms' ? [1, 2, 3, 0] : [f.term];
  const sc = useScoreTerms(yearId, terms, true);
  const dm = useDomains(yearId, f.term, true);
  // the best ten and the best four: highest cumulative average first, merit score second, for the term in the filter bar
  const ranked = useMemo(() => topThree(students, f, 10), [students, f]);
  const top = useMemo(() => ranked.slice(0, 4), [ranked]);
  const only = useMemo(() => new Set(ranked.map((r) => r.student_id)), [ranked]);
  const heat = useMemo(() => (sc.sets ? heatmapView(sc.sets, meta, f, { mode: layout, subject, sort, only }) : null), [sc.sets, meta, f, layout, subject, sort, only]);
  const dv = useMemo(() => domainView(dm.data, meta, f, student), [dm.data, meta, f, student]);
  const options = useMemo(() => students.filter((r) => Number(r.term_no) === 0 && (!f.section || r.section === f.section) && (!f.sub || r.sub_section === f.sub) && (!f.cls || r.class_id === f.cls))
    .sort((a, b) => byName(a.student_name, b.student_name)), [students, f]);
  const who = student ? meta.get(student) : null;
  const subjName = subjects.find((s) => s.id === subject)?.name;
  const series = (d) => SERIES.filter(([k]) => show[k]).map(([key, name, color]) => ({ key, name: key === 'cls' && dv.classLabel ? `${name} (${dv.classLabel})` : name, color, values: d?.[key] ?? [] }));
  const hasRatings = !!who && ['psychomotor', 'affective'].some((k) => dv[k]?.student.some((v) => v !== null));

  return (<>
    <h2 className="gd-h">Scores across subjects and terms <small>{caption}</small></h2>
    <section className="gd-glass gd-card" aria-labelledby="gd-hm-h">
      <header className="gd-card-head">
        <div><h3 id="gd-hm-h">Heatmap of the top ten students</h3><p className="gd-hint">Ten best by cumulative average (merit score breaks a tie). {layout === 'terms' ? (subjName ? subjName + ' in each term.' : 'Mean of all subjects in each term.') : TERM_LABEL[f.term] + (f.term === 0 ? ' (average per subject).' : '.')} Click a name or cell to follow a student{layout === 'subjects' ? ', a heading to see one subject' : ''}.</p></div>
        <div className="gd-field-row">
          <div className="gd-terms" role="group" aria-label="Layout">
            {[['subjects', 'By subject'], ['terms', 'By term']].map(([k, l]) => <button key={k} type="button" className={'gd-seg' + (layout === k ? ' on' : '')} aria-pressed={layout === k} onClick={() => setLayout(k)}>{l}</button>)}
          </div>
          <div className="gd-field"><label htmlFor="gd-hm-s">Subject</label>
            <select id="gd-hm-s" value={subject} onChange={(e) => setSubject(e.target.value)}><option value="">{layout === 'terms' ? 'All subjects (mean)' : 'All subjects'}</option>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
          <div className="gd-field"><label htmlFor="gd-hm-o">Order</label>
            <select id="gd-hm-o" value={sort} onChange={(e) => setSort(e.target.value)}><option value="mean">Best average first</option><option value="name">Name</option><option value="class">Class</option></select></div>
        </div>
      </header>
      {sc.error ? <div className="gd-error" role="alert">{sc.error}</div>
        : sc.loading || !heat ? <div className="gd-skel" style={{ height: 320 }} aria-busy="true" />
        : heat.rows.length === 0 ? <div className="gd-empty small">No scores for this selection.</div>
        : <Heatmap view={heat} picked={student} onPick={onStudent} onCol={(key) => setSubject(key)} drillable={layout === 'subjects'} />}
    </section>

    <div className="gd-two">
      <TopFourBars top={top} term={f.term} picked={student} onPick={onStudent} caption={[f.section && SECTION_LABEL[f.section], f.sub && SUB_LABEL[f.sub], options.find((o) => o.class_id === f.cls)?.class_name].filter(Boolean).join(', ') || 'All students you can view.'} />
      <section className="gd-glass gd-card" aria-labelledby="gd-st-h">
        <header className="gd-card-head"><div><h3 id="gd-st-h">Student in focus</h3><p className="gd-hint">Choose a student for the charts below. The choice is shared with the other tabs.</p></div></header>
        <div className="gd-field"><label htmlFor="gd-st-p">Student</label>
          <select id="gd-st-p" value={student} onChange={(e) => onStudent(e.target.value)} style={{ width: '100%' }}>
            <option value="">No one selected</option>{options.map((o) => <option key={o.student_id} value={o.student_id}>{o.student_name} ({o.class_name})</option>)}</select></div>
        {who ? <p className="gd-note"><b>{who.student_name}</b>, {who.class_name}. Ratings: 1 Poor, 2 Average, 3 Good, 4 Very good, 5 Excellent.</p> : <p className="gd-note">Or click a student in the heatmap or the top ten.</p>}
        <div className="gd-by" role="group" aria-label="Compare with" style={{ marginTop: 14 }}>
          <span>Show</span>
          {SERIES.map(([k, name, color]) => <button key={k} type="button" className={'gd-chipbtn' + (show[k] ? ' on' : '')} aria-pressed={show[k]} onClick={() => setShow({ ...show, [k]: !show[k] })}><i style={{ background: color }} />{name}</button>)}
        </div>
      </section>
    </div>

    <h2 className="gd-h">Behaviour and skills <small>{TERM_LABEL[f.term]}</small></h2>
    {dm.error ? <div className="gd-glass gd-error" role="alert">{dm.error}</div>
      : !who ? <div className="gd-glass gd-empty">Choose a student above to compare their psychomotor and affective ratings.</div>
      : dm.loading || !dm.data ? <div className="gd-skel" style={{ height: 380 }} aria-busy="true" />
      : !hasRatings ? <div className="gd-glass gd-empty">No psychomotor or affective ratings are recorded for {who.student_name} in this selection.</div>
      : <div className="gd-radars">
          <section className="gd-glass gd-card"><Radar title="Psychomotor" axes={dv.psychomotor?.axes ?? []} series={series(dv.psychomotor)} /></section>
          <section className="gd-glass gd-card"><Radar title="Affective" axes={dv.affective?.axes ?? []} series={series(dv.affective)} /></section>
        </div>}
  </>);
}
