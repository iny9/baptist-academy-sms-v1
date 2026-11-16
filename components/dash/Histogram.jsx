'use client';
import { memo, useState } from 'react';
import { one, num, SECTION_LABEL, TERM_LABEL } from '@/lib/dash-logic';

const W = 640, H = 250, P = { l: 34, r: 10, t: 14, b: 30 };

// Distribution of student averages. Click a bar to list the students in it; click a student to follow them in the scatter plot.
function Histogram({ hist, width, onWidth, target, term, sectionLabel, picked, onPick }) {
  const [sel, setSel] = useState(null);
  const { bins, n, mean, median, max } = hist;
  const iw = W - P.l - P.r, ih = H - P.t - P.b, bw = iw / bins.length;
  const y = (c) => P.t + ih - (c / max) * ih, tx = (v) => P.l + (v / 100) * iw;
  const open = sel !== null && bins[sel] ? bins[sel] : null;
  return (
    <section className="gd-glass gd-card" aria-labelledby="gd-hi-h">
      <header className="gd-card-head">
        <div><h3 id="gd-hi-h">Distribution of averages</h3><p className="gd-hint">{TERM_LABEL[term]}, {sectionLabel}. {n} student{n === 1 ? '' : 's'}.</p></div>
        <div className="gd-terms" role="group" aria-label="Bar width">
          {[5, 10, 20].map((w) => <button key={w} type="button" className={'gd-seg' + (width === w ? ' on' : '')} aria-pressed={width === w} onClick={() => { onWidth(w); setSel(null); }}>{w} points</button>)}
        </div>
      </header>
      {n === 0 ? <div className="gd-empty small">No averages for this selection.</div> : <>
        <svg className="gd-hist" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Histogram of ${n} averages, mean ${one(mean)}, median ${one(median)}`}>
          {[0, 0.5, 1].map((t) => <g key={t}><line className="grid" x1={P.l} x2={W - P.r} y1={y(max * t)} y2={y(max * t)} /><text className="tick" x={P.l - 6} y={y(max * t) + 4} textAnchor="end">{Math.round(max * t)}</text></g>)}
          {bins.map((b, i) => (
            <g key={b.lo} className={'bar' + (sel === i ? ' on' : '')} tabIndex={0} role="button" aria-label={`${b.lo} to ${b.hi}: ${b.count} students`} aria-pressed={sel === i}
              onClick={() => setSel(sel === i ? null : i)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSel(sel === i ? null : i); } }}>
              <rect className="hit" x={P.l + i * bw} y={P.t} width={bw} height={ih} />
              <rect className="fill" x={P.l + i * bw + 2} y={y(b.count)} width={Math.max(1, bw - 4)} height={Math.max(0, P.t + ih - y(b.count))} rx="5" />
              {b.count > 0 && <text className="val" x={P.l + i * bw + bw / 2} y={y(b.count) - 4} textAnchor="middle">{b.count}</text>}
              {(bins.length <= 10 || i % 2 === 0) && <text className="tick" x={P.l + i * bw} y={H - 12} textAnchor="middle">{b.lo}</text>}
            </g>))}
          <text className="tick" x={W - P.r} y={H - 12} textAnchor="end">100</text>
          {target > 0 && target < 100 && <g><line className="target" x1={tx(target)} x2={tx(target)} y1={P.t} y2={P.t + ih} /><text className="tick gold" x={tx(target) + 4} y={P.t + 10}>target {one(target)}</text></g>}
        </svg>
        <ul className="gd-kpis"><li><b>{one(mean)}</b><span>mean average</span></li><li><b>{one(median)}</b><span>median</span></li>
          <li><b>{hist.above}</b><span>at or above target</span></li></ul>
        {open ? <div className="gd-bin">
          <div className="gd-bin-h"><b>{open.lo} to {open.hi}{open.hi === 100 ? ' (includes 100)' : ''}</b><button type="button" className="gd-reset" onClick={() => setSel(null)}>Close</button></div>
          {open.count === 0 ? <p className="gd-hint">Nobody in this range.</p> :
            <ul className="gd-bin-list">{open.students.map((s) => (
              <li key={s.student_id}><button type="button" className={'gd-group' + (picked === s.student_id ? ' on' : '')} onClick={() => onPick(picked === s.student_id ? '' : s.student_id)} title="Follow this student in the scatter plot">
                <span className="gd-group-l">{s.student_name}</span><span className="gd-group-n">{s.class_name}</span><span className="gd-group-n"><b>{one(s.average)}</b></span></button></li>))}</ul>}
        </div> : <p className="gd-note">Select a bar to see who is in it.</p>}
      </>}
    </section>
  );
}
export default memo(Histogram);
