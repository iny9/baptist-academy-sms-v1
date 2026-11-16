// Shared by the screen (components/Stamp.jsx) and the PDF engine: where "sign" and "date" sit on a stamp picture (fractions, top-left origin).
export const DEFAULT_LAYOUT = { sign: { x: 0.5, y: 0.6, w: 0.5 }, date: { x: 0.5, y: 0.8, size: 0.09 } };
export const parseLayout = (v) => {
  try { const j = JSON.parse(v); const n = (x, d, lo, hi) => (typeof x === 'number' && x >= lo && x <= hi ? x : d);
    return { sign: { x: n(j.sign?.x, 0.5, 0, 1), y: n(j.sign?.y, 0.6, 0, 1), w: n(j.sign?.w, 0.5, 0.1, 1) }, date: { x: n(j.date?.x, 0.5, 0, 1), y: n(j.date?.y, 0.8, 0, 1), size: n(j.date?.size, 0.09, 0.03, 0.25) } };
  } catch { return DEFAULT_LAYOUT; }
};
export const stampKeys = (section) => ({ stamp: 'stamp_' + section, signature: 'stamp_signature_' + section, layout: 'stamp_layout_' + section, legacy: section === 'secondary' ? 'signature_secondary' : 'signature_basic' });
