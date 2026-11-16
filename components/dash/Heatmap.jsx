'use client';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { heatHue, one } from '@/lib/dash-logic';

const ROW = 24, HEAD = 56;

// Canvas heatmap with its own scrolling: only the rows on screen are drawn, so hundreds of students stay smooth.
// Click a name or cell to follow a student; click a subject heading to look at that subject only.
function Heatmap({ view, picked, onPick, onCol, drillable }) {
  const box = useRef(null), cv = useRef(null), raf = useRef(0);
  const [w, setW] = useState(640);
  const [tip, setTip] = useState(null);
  const nameW = w < 520 ? 118 : 178, nc = Math.max(1, view.cols.length);
  const cellW = Math.max(w < 520 ? 44 : 50, Math.floor((w - nameW) / nc));
  const totalW = nameW + nc * cellW, totalH = HEAD + view.rows.length * ROW;
  const height = Math.min(520, totalH + 2);
  const dark = () => document.documentElement.getAttribute('data-theme') === 'dark' || (!document.documentElement.getAttribute('data-theme') && matchMedia('(prefers-color-scheme: dark)').matches);

  useEffect(() => { const el = box.current; if (!el) return; const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width))); ro.observe(el); return () => ro.disconnect(); }, []);

  const draw = useCallback(() => {
    const el = box.current, c = cv.current; if (!el || !c) return;
    const vw = el.clientWidth, vh = el.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1), D = dark();
    if (c.width !== vw * dpr || c.height !== vh * dpr) { c.width = vw * dpr; c.height = vh * dpr; c.style.width = vw + 'px'; c.style.height = vh + 'px'; }
    const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, vw, vh);
    const sx = el.scrollLeft, sy = el.scrollTop, ink = D ? '#EDF1FB' : '#0F1F44', muted = D ? '#A9B6DA' : '#4F5C7E';
    const r0 = Math.max(0, Math.floor(sy / ROW)), r1 = Math.min(view.rows.length, Math.ceil((sy + vh - HEAD) / ROW) + 1);
    g.font = '600 11px Manrope, system-ui, sans-serif'; g.textBaseline = 'middle';
    for (let r = r0; r < r1; r++) {
      const row = view.rows[r], y = HEAD + r * ROW - sy;
      for (let k = 0; k < view.cols.length; k++) {
        const x = nameW + k * cellW - sx; if (x + cellW < nameW || x > vw) continue;
        const v = row.cells[k];
        if (v === null) { g.fillStyle = D ? 'rgba(255,255,255,.05)' : 'rgba(15,31,68,.05)'; g.fillRect(x + 1, y + 1, cellW - 2, ROW - 2); continue; }
        g.fillStyle = `hsl(${heatHue(v)} ${D ? 62 : 70}% ${D ? 40 : 56}%)`; g.fillRect(x + 1, y + 1, cellW - 2, ROW - 2);
        g.fillStyle = D ? '#fff' : '#0B1B3D'; g.textAlign = 'center'; g.fillText(String(Math.round(v)), x + cellW / 2, y + ROW / 2 + 0.5);
      }
      if (row.id === picked) { g.strokeStyle = D ? '#F2C45C' : '#B97A12'; g.lineWidth = 2; g.strokeRect(nameW + 1, y + 1, vw - nameW - 2, ROW - 2); }
    }
    // frozen name column
    g.fillStyle = D ? 'rgb(24,36,78)' : 'rgb(246,248,253)'; g.fillRect(0, HEAD, nameW, vh - HEAD);
    g.textAlign = 'left'; g.fillStyle = ink;
    for (let r = r0; r < r1; r++) { const row = view.rows[r], y = HEAD + r * ROW - sy; g.font = (row.id === picked ? '700' : '600') + ' 11.5px Manrope, system-ui, sans-serif'; g.fillStyle = ink; g.fillText(clip(g, row.name, nameW - 12), 8, y + ROW / 2 + 0.5); }
    // frozen header
    g.fillStyle = D ? 'rgb(24,36,78)' : 'rgb(246,248,253)'; g.fillRect(0, 0, vw, HEAD);
    g.fillStyle = muted; g.font = '700 11px Manrope, system-ui, sans-serif'; g.textAlign = 'left'; g.fillText(`${view.rows.length} students`, 8, HEAD - 14);
    for (let k = 0; k < view.cols.length; k++) {
      const x = nameW + k * cellW - sx; if (x + cellW < nameW || x > vw) continue;
      g.save(); g.beginPath(); g.rect(nameW, 0, vw - nameW, HEAD); g.clip();
      g.translate(x + cellW / 2, HEAD - 8); g.rotate(cellW < 62 ? -Math.PI / 3 : 0); g.textAlign = cellW < 62 ? 'left' : 'center'; g.fillStyle = ink;
      g.fillText(clip(g, view.cols[k].label, cellW < 62 ? 70 : cellW - 6), 0, cellW < 62 ? 0 : -8); g.restore();
    }
    g.strokeStyle = D ? 'rgba(255,255,255,.12)' : 'rgba(15,31,68,.12)'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, HEAD + .5); g.lineTo(vw, HEAD + .5); g.moveTo(nameW + .5, 0); g.lineTo(nameW + .5, vh); g.stroke();
  }, [view, picked, nameW, cellW]);

  useEffect(() => { draw(); }, [draw, w]);
  const onScroll = () => { cancelAnimationFrame(raf.current); raf.current = requestAnimationFrame(draw); };
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  function hit(e) {
    const el = box.current, b = el.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top;
    if (y < HEAD) { if (x < nameW) return { kind: 'corner' }; const k = Math.floor((x - nameW + el.scrollLeft) / cellW); return view.cols[k] ? { kind: 'col', col: view.cols[k] } : null; }
    const r = Math.floor((y - HEAD + el.scrollTop) / ROW); const row = view.rows[r]; if (!row) return null;
    if (x < nameW) return { kind: 'name', row };
    const k = Math.floor((x - nameW + el.scrollLeft) / cellW); return view.cols[k] ? { kind: 'cell', row, col: view.cols[k], v: row.cells[k], x, y } : null;
  }
  const label = useMemo(() => `Heatmap of ${view.rows.length} students by ${view.cols.length} columns`, [view]);
  return (
    <div className="gd-heat-wrap">
      <div className="gd-heat" ref={box} style={{ height }} onScroll={onScroll} tabIndex={0} aria-label={label + '. Scroll to see more.'}>
        <div style={{ width: totalW, height: totalH }}>
          <canvas ref={cv} role="img" aria-label={label} style={{ position: 'sticky', top: 0, left: 0, display: 'block', cursor: 'pointer' }}
            onPointerMove={(e) => { const h = hit(e); setTip(h && h.kind === 'cell' ? h : h && h.kind === 'name' ? { ...h, x: nameW, y: e.clientY - box.current.getBoundingClientRect().top } : null); }}
            onPointerLeave={() => setTip(null)}
            onClick={(e) => { const h = hit(e); if (!h) return; if (h.kind === 'col') { if (drillable) onCol(h.col.key); } else if (h.row) onPick(h.row.id === picked ? '' : h.row.id); }} />
        </div>
      </div>
      {tip && <div className="gd-tip" style={{ left: Math.min(tip.x + 14, w - 200), top: Math.max(tip.y - 58, 62) }}>
        <b>{tip.row.name}</b><span>{tip.row.cls}</span>{tip.kind === 'cell' && <span>{tip.col.label}: <b>{tip.v === null ? 'no score' : one(tip.v)}</b></span>}</div>}
      <div className="gd-heat-key" aria-hidden="true"><span>0</span><i /><span>100</span></div>
    </div>
  );
}
function clip(g, text, max) { if (g.measureText(text).width <= max) return text; let t = text; while (t.length > 1 && g.measureText(t + '…').width > max) t = t.slice(0, -1); return t + '…'; }
export default memo(Heatmap);
