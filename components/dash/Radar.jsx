'use client';
import { memo } from 'react';

const S = 320, C = S / 2, R = 108;
const pt = (i, n, v, max) => { const a = -Math.PI / 2 + (2 * Math.PI * i) / n, r = (v / max) * R; return [C + r * Math.cos(a), C + r * Math.sin(a)]; };

// Radar chart. series = [{ key, name, color, values:[number|null] }], ratings run 1 (Poor) to 5 (Excellent).
function Radar({ title, axes, series, max = 5 }) {
  const n = axes.length;
  if (n < 3) return <div className="gd-empty small">At least three traits are needed for a radar chart.</div>;
  const poly = (vals) => vals.map((v, i) => pt(i, n, v ?? 0, max).join(',')).join(' ');
  return (
    <figure className="gd-radar">
      <figcaption>{title}</figcaption>
      <svg viewBox={`0 0 ${S} ${S}`} role="img" aria-label={`${title} radar chart. ${series.map((s) => s.name + ': ' + s.values.map((v, i) => axes[i] + ' ' + (v === null ? 'none' : v.toFixed(1))).join(', ')).join('. ')}`}>
        {Array.from({ length: max }, (_, k) => k + 1).map((k) => <polygon key={k} className="ring" points={axes.map((_, i) => pt(i, n, k, max).join(',')).join(' ')} />)}
        {axes.map((a, i) => { const [x, y] = pt(i, n, max, max), [lx, ly] = pt(i, n, max + 0.55, max); const anchor = lx < C - 8 ? 'end' : lx > C + 8 ? 'start' : 'middle';
          return <g key={a}><line className="spoke" x1={C} y1={C} x2={x} y2={y} /><text className="axis" x={lx} y={ly + 3} textAnchor={anchor}>{a.length > 16 ? a.slice(0, 15) + '…' : a}</text></g>; })}
        {[1, 3, 5].map((k) => <text key={k} className="scale" x={C + 3} y={C - (k / max) * R + 3}>{k}</text>)}
        {series.map((s) => s.values.some((v) => v !== null) && (
          <g key={s.key} style={{ '--c': s.color }}>
            <polygon className={'area ' + s.key} points={poly(s.values)} />
            {s.values.map((v, i) => v === null ? null : <circle key={i} className="dot" cx={pt(i, n, v, max)[0]} cy={pt(i, n, v, max)[1]} r="3.4"><title>{`${s.name}, ${axes[i]}: ${v.toFixed(1)}`}</title></circle>)}
          </g>))}
      </svg>
    </figure>
  );
}
export default memo(Radar);
