'use client';
import { useMemo, useState } from 'react';
import ScatterPlot from './ScatterPlot';
import Histogram from './Histogram';
import useScores from './useScores';
import { studentMap, scatterView, histogram, subjectHue, subjectList, byName, one, SECTION_LABEL, TERM_LABEL } from '@/lib/dash-logic';

// Class Level Analytics. Uses the same filter bar as Top Level; the controls on the cards are the extra drill-downs.
export default function ClassLevel({ yearId, students, leaders, f, target, student, onStudent }) {
  const [local, setLocal] = useState({ gender: '', subject: '' });
  const [width, setWidth] = useState(10);
  const { data, loading, error } = useScores(yearId, f.term, true);
  const meta = useMemo(() => studentMap(students), [students]);
  const subjects = useMemo(() => subjectList(leaders), [leaders]);
  const hueIndex = useMemo(() => { const m = new Map(subjects.map((s, i) => [s.id, i])); return m; }, [subjects]);
  const hueOf = useMemo(() => (ji) => hueIndex.get(data?.subjects?.[ji]?.id) ?? ji, [hueIndex, data]);
  const view = useMemo(() => scatterView(data, meta, f, local), [data, meta, f, local]);
  const hist = useMemo(() => histogram(students, f, width, target), [students, f, width, target]);
  const names = useMemo(() => view.students.slice().sort((a, b) => byName(a.name, b.name)), [view]);
  const mine = useMemo(() => view.points.filter((p) => p.sid === student).map((p) => ({ subject: view.subjects[p.ji]?.name, v: p.y, ji: p.ji })).sort((a, b) => b.v - a.v), [view, student]);
  const who = student ? meta.get(student) : null;
  const sectionLabel = f.section ? (SECTION_LABEL[f.section] ?? f.section) + ' section' : 'all sections';
  const onlySubject = data?.subjects?.filter((s) => view.points.some((p) => data.subjects[p.ji]?.id === s.id)) ?? [];

  return (<>
    <h2 className="gd-h">Scores of every student <small>{TERM_LABEL[f.term]}{f.term === 0 ? ' (average per subject)' : ''}</small></h2>
    <section className="gd-glass gd-card" aria-labelledby="gd-sc-h">
      <header className="gd-card-head">
        <div><h3 id="gd-sc-h">Total scores by student</h3><p className="gd-hint">One dot per student per subject. Click a dot to follow that student.</p></div>
        <div className="gd-field-row">
          <div className="gd-field"><label htmlFor="gd-sc-g">Gender</label>
            <select id="gd-sc-g" value={local.gender} onChange={(e) => setLocal({ ...local, gender: e.target.value })}><option value="">All</option><option>Female</option><option>Male</option></select></div>
          <div className="gd-field"><label htmlFor="gd-sc-s">Subject</label>
            <select id="gd-sc-s" value={local.subject} onChange={(e) => setLocal({ ...local, subject: e.target.value })}><option value="">All subjects</option>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
          <div className="gd-field"><label htmlFor="gd-sc-st">Student</label>
            <select id="gd-sc-st" value={student} onChange={(e) => onStudent(e.target.value)}><option value="">No one selected</option>{names.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.cls})</option>)}</select></div>
        </div>
      </header>
      {error ? <div className="gd-error" role="alert">{error}</div>
        : loading || !data ? <div className="gd-skel" style={{ height: 320 }} aria-busy="true" />
        : view.n === 0 ? <div className="gd-empty small">No scores for this selection.</div> : <>
          <ScatterPlot view={view} hueOf={hueOf} highlight={student} target={target} onPick={(id) => onStudent(id === student ? '' : id)} />
          <ul className="gd-legend-h" aria-label="Subject colours">
            {onlySubject.map((s) => { const on = local.subject === s.id; return (
              <li key={s.id}><button type="button" className={'gd-chipbtn' + (on ? ' on' : '')} aria-pressed={on} onClick={() => setLocal({ ...local, subject: on ? '' : s.id })} title={on ? 'Show all subjects' : 'Show only ' + s.name}>
                <i style={{ background: `hsl(${subjectHue(hueIndex.get(s.id) ?? 0)} 72% 52%)` }} />{s.name}</button></li>); })}
          </ul>
          <p className="gd-note">{view.n} student{view.n === 1 ? '' : 's'}, {view.points.length} scores. The dashed line is the target average ({one(target)}).</p>
          {who && <div className="gd-picked">
            <div className="gd-bin-h"><b>{who.student_name}</b><span className="gd-hint">{who.class_name}</span><button type="button" className="gd-reset" onClick={() => onStudent('')}>Clear</button></div>
            {mine.length === 0 ? <p className="gd-hint">This student has no scores for the current selection.</p> :
              <ul className="gd-mini">{mine.map((m) => <li key={m.subject}><i style={{ background: `hsl(${subjectHue(hueOf(m.ji))} 72% 52%)` }} /><span>{m.subject}</span><b>{one(m.v)}</b></li>)}</ul>}
          </div>}
        </>}
    </section>

    <h2 className="gd-h">How averages are spread <small>{TERM_LABEL[f.term]}, {sectionLabel}</small></h2>
    <Histogram hist={hist} width={width} onWidth={setWidth} target={target} term={f.term} sectionLabel={sectionLabel} picked={student} onPick={onStudent} />
  </>);
}
