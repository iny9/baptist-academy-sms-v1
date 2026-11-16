'use client';
import { memo } from 'react';
import { BY_OPTIONS, one, TERM_LABEL } from '@/lib/dash-logic';

const R = 74, C = 2 * Math.PI * R;

// Donut of promoted vs repeat for the session, with a "break down by" list. Clicking a row drills into that group.
function PromotionDonut({ view, d, onChange, onDrill, subjects, sessionName, target, term }) {
  const { a, b, total, pct, groups, partial, mode } = view;
  const goodLabel = mode === 'subject' ? 'At or above target' : 'Promoted', badLabel = mode === 'subject' ? 'Below target' : 'Repeat';
  const arcA = total ? (a / total) * C : 0, arcB = total ? (b / total) * C : 0, gap = a && b ? 3 : 0;
  return (
    <section className="gd-glass gd-card" aria-labelledby="gd-pr-h">
      <header className="gd-card-head">
        <div><h3 id="gd-pr-h">{mode === 'subject' ? 'Subject results' : 'Promoted and repeat'}</h3>
          <p className="gd-hint">Session {sessionName}, {TERM_LABEL[term].toLowerCase()}. Target average {one(target)}.</p></div>
        <div className="gd-field-row">
          <div className="gd-field"><label htmlFor="gd-pr-g">Gender</label>
            <select id="gd-pr-g" value={d.gender} onChange={(e) => onChange({ gender: e.target.value })}><option value="">All</option><option>Female</option><option>Male</option></select></div>
          <div className="gd-field"><label htmlFor="gd-pr-s">Subject</label>
            <select id="gd-pr-s" value={d.subject} onChange={(e) => onChange({ subject: e.target.value })}><option value="">All subjects</option>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        </div>
      </header>
      {total === 0 ? <div className="gd-empty small">No students match these filters.</div> : <>
        <div className="gd-donut-wrap">
          <svg className="gd-donut" viewBox="0 0 200 200" role="img" aria-label={`${a} ${goodLabel.toLowerCase()} and ${b} ${badLabel.toLowerCase()}, ${one(pct)} percent`}>
            <circle className="track" cx="100" cy="100" r={R} />
            <circle className="arc b" cx="100" cy="100" r={R} strokeDasharray={`${Math.max(arcB - gap, 0)} ${C}`} strokeDashoffset={-arcA} />
            <circle className="arc a" cx="100" cy="100" r={R} strokeDasharray={`${Math.max(arcA - gap, 0)} ${C}`} />
            <text x="100" y="98" textAnchor="middle" className="pct">{Math.round(pct)}%</text>
            <text x="100" y="120" textAnchor="middle" className="cap">{goodLabel.toLowerCase()}</text>
          </svg>
          <ul className="gd-legend">
            <li><i className="a" /><span>{goodLabel}</span><b>{a}</b></li>
            <li><i className="b" /><span>{badLabel}</span><b>{b}</b></li>
            <li className="sum"><span>{mode === 'subject' ? 'Students taking it' : 'Students'}</span><b>{total}</b></li>
          </ul>
        </div>
        {partial > 0 && <p className="gd-note">{partial} student{partial > 1 ? 's have' : ' has'} scores for fewer than three terms, so their result is not final.</p>}
        <div className="gd-by" role="group" aria-label="Break down by">
          <span id="gd-by-l">Break down by</span>
          {BY_OPTIONS.map(([k, label]) => <button key={k} type="button" className={'gd-seg' + (d.by === k ? ' on' : '')} aria-pressed={d.by === k} onClick={() => onChange({ by: k })}>{label}</button>)}
        </div>
        <ul className="gd-groups">
          {groups.map((g) => (
            <li key={g.id}>
              <button type="button" className="gd-group" onClick={() => onDrill(d.by, g.id)} title={`Show only ${g.label}`}>
                <span className="gd-group-l">{g.label}</span>
                <span className="gd-bar" aria-hidden="true"><i className="a" style={{ width: g.pct + '%' }} /><i className="b" style={{ width: 100 - g.pct + '%' }} /></span>
                <span className="gd-group-n">{g.a} of {g.total}</span>
              </button>
            </li>))}
        </ul>
      </>}
    </section>
  );
}
export default memo(PromotionDonut);
