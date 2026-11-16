'use client';
import { memo } from 'react';
import Photo from './Photo';
import { num, one, ordinal, cumOf } from '@/lib/dash-logic';

// Three glass cards for the best students: highest cumulative average first, merit score second. DOM order is 1, 2, 3 (screen readers and phones);
// on wide screens the CSS puts 1st in the middle.
function TopThree({ top, caption }) {
  if (top.length === 0) return <div className="gd-empty">No scores are recorded for this selection yet.</div>;
  return (
    <div className="gd-podium" role="list" aria-label={`Top students: ${caption}`}>
      {top.map((s) => (
        <article key={s.student_id} className={'gd-glass gd-pod r' + s.rank} role="listitem">
          <div className="gd-medal" aria-label={`Rank ${s.rank}`}>{s.rank}</div>
          <Photo url={s.photo_url} name={s.student_name} />
          <h3 className="gd-pod-name">{s.student_name}</h3>
          <p className="gd-pod-class">{s.class_name}</p>
          <p className="gd-pod-pos">{ordinal(num(s.class_pos))} of {num(s.class_size)} in class</p>
          <dl className="gd-stats">
            <div><dt>Cumulative average</dt><dd className="big">{one(cumOf(s))}</dd></div>
            <div><dt>Merit score</dt><dd>{num(s.merit)}</dd></div>
            <div><dt>Total</dt><dd>{num(s.total).toLocaleString()}</dd></div>
          </dl>
          {s.tie === 'average' && <span className="gd-chip">Level on cumulative average, placed by merit score</span>}
          {s.tie === 'both' && <span className="gd-chip">Level on cumulative average and merit score</span>}
        </article>
      ))}
    </div>
  );
}
export default memo(TopThree);
