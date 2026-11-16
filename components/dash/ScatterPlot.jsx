'use client';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { subjectHue, one } from '@/lib/dash-logic';

const PAD = { l: 38, r: 12, t: 12, b: 30 };

// Canvas scatter: thousands of points stay smooth. x = students ranked by mean score, y = score, one hue per subject.
function ScatterPlot({ view, hueOf, highlight, target, onPick }) {
  const wrap = useRef(null), cv = useRef(null);
  const [size, setSize] = useState({ w: 700, h: 360 });
  const [tip, setTip] = useState(null);
  const dark = () => document.documentElement.getAttribute('data-theme') === 'dark' || (!document.documentElement.getAttribute('data-theme') && matchMedia('(prefers-color-scheme: dark)').matches);

  useEffect(() => { // follow the width of the card
    const el = wrap.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.max(280, Math.floor(e.contentRect.width)), h: e.contentRect.width < 520 ? 300 : 360 }));
    ro.observe(el); return () => ro.disconnect();
  }, []);

  const geom = useMemo(() => {
    const n = Math.max(1, view.n), iw = size.w - PAD.l - PAD.r, ih = size.h - PAD.t - PAD.b;
    const px = (x) => PAD.l + (n === 1 ? iw / 2 : (x / (n - 1)) * iw), py = (y) => PAD.t + ih - (Math.min(100, Math.max(0, y)) / 100) * ih;
    const cols = Array.from({ length: view.n }, () => []);
    view.points.forEach((p, i) => cols[p.x].push(i));
    return { n, iw, ih, px, py, cols };
  }, [view, size]);

  useEffect(() => {
    const c = cv.current; if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = size.w * dpr; c.height = size.h * dpr;
    const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, size.w, size.h);
    const ink = dark() ? '#A9B6DA' : '#4F5C7E', grid = dark() ? 'rgba(255,255,255,.10)' : 'rgba(15,31,68,.10)';
    g.font = '11px Manrope, system-ui, sans-serif'; g.fillStyle = ink; g.textAlign = 'right'; g.textBaseline = 'middle'; g.lineWidth = 1;
    for (const v of [0, 25, 50, 75, 100]) { const y = geom.py(v); g.strokeStyle = grid; g.beginPath(); g.moveTo(PAD.l, y); g.lineTo(size.w - PAD.r, y); g.stroke(); g.fillText(String(v), PAD.l - 6, y); }
    if (target > 0 && target < 100) { const y = geom.py(target); g.save(); g.setLineDash([5, 4]); g.strokeStyle = dark() ? '#F2C45C' : '#B97A12'; g.beginPath(); g.moveTo(PAD.l, y); g.lineTo(size.w - PAD.r, y); g.stroke(); g.restore(); }
    g.textAlign = 'center'; g.textBaseline = 'top'; g.fillStyle = ink; g.fillText('Students, best average on the left', PAD.l + geom.iw / 2, size.h - 16);
    const r = view.n > 400 ? 2.2 : view.n > 120 ? 3 : 4, dim = !!highlight;
    for (const pass of dim ? [0, 1] : [0]) for (const p of view.points) {
      const hit = p.sid === highlight; if (dim && (pass === 1) !== hit) continue;
      g.globalAlpha = dim ? (hit ? 1 : 0.14) : 0.78;
      g.fillStyle = `hsl(${subjectHue(hueOf(p.ji))} 72% ${dark() ? 62 : 48}%)`;
      g.beginPath(); g.arc(geom.px(p.x), geom.py(p.y), hit ? r + 2 : r, 0, 6.2832); g.fill();
      if (hit) { g.strokeStyle = dark() ? '#fff' : '#0F1F44'; g.lineWidth = 1.5; g.stroke(); }
    }
    g.globalAlpha = 1;
  }, [view, geom, size, highlight, target, hueOf]);

  function near(e) { // nearest point inside the column under the pointer
    const b = cv.current.getBoundingClientRect(), mx = e.clientX - b.left, my = e.clientY - b.top;
    if (view.n === 0) return null;
    const col = view.n === 1 ? 0 : Math.round(((mx - PAD.l) / geom.iw) * (view.n - 1));
    if (col < 0 || col >= view.n) return null;
    let best = null, bd = 1e9;
    for (const i of geom.cols[col]) { const d = Math.abs(geom.py(view.points[i].y) - my); if (d < bd) { bd = d; best = i; } }
    return best !== null && bd < 22 ? { p: view.points[best], x: geom.px(col), y: geom.py(view.points[best].y) } : null;
  }
  const info = tip && { s: view.students[tip.p.x], subject: view.subjects[tip.p.ji]?.name };
  return (
    <div className="gd-scatter" ref={wrap}>
      <canvas ref={cv} style={{ width: size.w, height: size.h }} role="img" aria-label={`Scatter plot of ${view.points.length} scores for ${view.n} students`}
        onPointerMove={(e) => setTip(near(e))} onPointerLeave={() => setTip(null)} onClick={(e) => { const t = near(e); if (t) onPick(t.p.sid); }} />
      {tip && info.s && <div className="gd-tip" style={{ left: Math.min(tip.x + 12, size.w - 190), top: Math.max(tip.y - 64, 4) }}>
        <b>{info.s.name}</b><span>{info.s.cls}</span><span>{info.subject}: <b>{one(tip.p.y)}</b></span></div>}
    </div>
  );
}
export default memo(ScatterPlot);
