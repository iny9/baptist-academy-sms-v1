'use client';
import { memo } from 'react';
import { one, ordinal, num, cumOf, TERM_LABEL } from '@/lib/dash-logic';

// The four best students for the current selection: highest cumulative average first, merit score second. Click a row to follow that student.
function TopFourBars({ top, term, picked, onPick, caption }) {
  const best = Math.max(1, ...top.map((s) => cumOf(s)));
  return (
    <section className="gd-glass gd-card" aria-labelledby="gd-tt-h">
      <header className="gd-card-head"><div><h3 id="gd-tt-h">Top four by cumulative average</h3><p className="gd-hint">{TERM_LABEL[term]}. {caption}</p></div></header>
      {top.length === 0 ? <div className="gd-empty small">No averages for this selection.</div> :
        <ol className="gd-tt">
          {top.map((s) => (
            <li key={s.student_id}>
              <button type="button" className={'gd-tt-row' + (picked === s.student_id ? ' on' : '')} onClick={() => onPick(picked === s.student_id ? '' : s.student_id)} title="Follow this student">
                <span className="gd-tt-rank">{s.rank}</span>
                <span className="gd-tt-name">{s.student_name}<small>{s.class_name}, merit score {num(s.merit)}, {ordinal(num(s.class_pos))} in class</small></span>
                <span className="gd-tt-bar" aria-hidden="true"><i style={{ width: (cumOf(s) / best) * 100 + '%' }} /></span>
                <b className="gd-tt-val">{one(cumOf(s))}</b>
              </button>
            </li>))}
        </ol>}
    </section>
  );
}
export default memo(TopFourBars);
