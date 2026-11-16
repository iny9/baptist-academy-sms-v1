'use client';
import { memo, useMemo } from 'react';
import Icon from '@/components/Icon';
import { inScope, num, one, cumOf } from '@/lib/dash-logic';

// Four headline numbers for the current selection (term, section, sub-section, class), shown above the charts like the cards of an analytics app.
function KpiStrip({ students, f }) {
  const k = useMemo(() => {
    const rows = students.filter((r) => num(r.term_no) === num(f.term) && inScope(r, f));
    if (rows.length === 0) return null;
    const mean = rows.reduce((a, r) => a + cumOf(r), 0) / rows.length;
    const best = Math.max(...rows.map(cumOf));
    const promoted = rows.filter((r) => r.status === 'Promoted').length;
    return { n: rows.length, mean, best, rate: Math.round((promoted / rows.length) * 100) };
  }, [students, f]);
  if (!k) return null;
  const items = [['cap', 'Students', k.n.toLocaleString(), 'blue'], ['trending', 'Cumulative average', one(k.mean), 'green'], ['award', 'Highest average', one(k.best), 'amber'], ['shield', 'At or above target', k.rate + '%', 'violet']];
  return (
    <section className="gd-kpis" aria-label="Key numbers">
      {items.map(([icon, label, value, tone]) => (
        <div key={label} className={'gd-glass gd-kpi tone-' + tone}><span className="gd-kpi-ico"><Icon name={icon} size={20} /></span><div><span className="gd-kpi-l">{label}</span><b className="gd-kpi-n">{value}</b></div></div>))}
    </section>
  );
}
export default memo(KpiStrip);
