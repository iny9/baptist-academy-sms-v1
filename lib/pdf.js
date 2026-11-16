import { PDFDocument, StandardFonts, rgb, grayscale } from 'pdf-lib';

// ---------- palette (matches the web app) ----------
const hex = (h) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const C = { teal: hex('#1B3A7A'), deep: hex('#0E2252'), gold: hex('#E8B04B'), ink: hex('#0F1F44'), muted: hex('#5B6785'), line: hex('#E3DCCB'),
  soft: hex('#F8F5EE'), tint: hex('#EAF0FB'), white: rgb(1, 1, 1), green: hex('#1F8A4C'), red: hex('#D13B35'), orange: hex('#E07B1A'), goldSoft: hex('#FFF4DC') };
const GRADE = { A: C.green, B: C.teal, C: C.gold, D: C.orange, E: rgb(0.72, 0.33, 0.10), F: C.red };
const W = 595, H = 842, M = 36, BAND = 118;
const TW = W - 2 * M;   // content width

// Standard PDF fonts only support Latin-1; replace anything else.
export const clean = (s) => String(s ?? '').replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');
const LEVELS = ['', 'Poor', 'Average', 'Good', 'Very good', 'Excellent'];
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const headTitle = (d) => d.head?.title ?? (d.cls.section === 'secondary' ? 'Principal' : 'Headmaster / Headmistress');
const headLine = (d) => (d.head?.name ? `${d.head.name}, ${headTitle(d)}` : headTitle(d));
const ord = (n) => { const v = n % 100, s = ['th', 'st', 'nd', 'rd']; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
import { gradeOf, GRADE_KEY, meritPoints } from './grading.js';

// Only fetch images from our own origin or our Supabase project (prevents server-side request forgery).
export async function loadImage(doc, url, origin) {
  try {
    if (!url) return null;
    const ok = url.startsWith(origin) || url.startsWith(process.env.NEXT_PUBLIC_SUPABASE_URL + '/storage/');
    if (!ok) return null;
    const res = await fetch(url); if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer()); if (bytes.length > 3 * 1024 * 1024) return null;
    return bytes[0] === 0x89 ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
  } catch { return null; }
}

export async function newDoc() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold), serif = await doc.embedFont(StandardFonts.TimesRomanBold);
  const times = await doc.embedFont(StandardFonts.TimesRoman), timesItalic = await doc.embedFont(StandardFonts.TimesRomanItalic);
  return { doc, font, bold, serif, times, timesItalic };
}

function writer(page, fonts) {
  const { font, bold, serif, times, timesItalic } = fonts;
  const pick = (o) => (o.tr ? times : o.it ? timesItalic : o.serif ? serif : o.bold ? bold : font);
  const t = (s, x, y, o = {}) => {
    const f = pick(o), size = o.size ?? 9; let str = clean(s);
    if (o.max) while (str.length > 1 && f.widthOfTextAtSize(str, size) > o.max) str = str.slice(0, -1);
    if (o.align === 'right') x -= f.widthOfTextAtSize(str, size); else if (o.align === 'center') x -= f.widthOfTextAtSize(str, size) / 2;
    page.drawText(str, { x, y, size, font: f, color: o.color ?? C.ink });
  };
  const width = (s, size, o = {}) => pick(o).widthOfTextAtSize(clean(s), size);
  const wrap = (s, size, max, o = {}) => {
    const f = pick(o), out = [];
    for (const para0 of String(s ?? '').split(/\r?\n/)) { const para = clean(para0); let line = '';
      for (const w of para.split(/\s+/)) { const tryLine = line ? line + ' ' + w : w; if (f.widthOfTextAtSize(tryLine, size) > max && line) { out.push(line); line = w; } else line = tryLine; }
      out.push(line); }
    return out;
  };
  const rect = (x, y, w, h, color, o = {}) => page.drawRectangle({ x, y, width: w, height: h, color, ...o });
  return { t, wrap, width, rect, page };
}

// ---------- shared header: deep band, gold stripe, logo tile, title pill, faint watermark ----------
function header(w, ctx, title, sub) {
  const { page, rect, t, width } = w;
  if (ctx.logo) page.drawImage(ctx.logo, { x: (W - 340) / 2, y: (H - 340) / 2 - 20, width: 340, height: 340, opacity: 0.055 });
  rect(0, H - BAND, W, BAND, C.deep);
  rect(0, H - BAND - 4, W, 4, C.gold);
  rect(W - 150, H - BAND, 150, BAND, C.teal, { opacity: 0.18 });
  rect(M, H - 100, 72, 72, C.white);
  if (ctx.logo) page.drawImage(ctx.logo, { x: M + 4, y: H - 96, width: 64, height: 64 });
  const x = M + 90;
  t(ctx.S.school_name ?? 'Baptist Academy', x, H - 52, { serif: true, size: 20, color: C.white, max: 360 });
  t(ctx.S.address ?? '', x, H - 67, { size: 8.5, color: hex('#B4C3E6'), max: 360 });
  const label = clean(title).toUpperCase(), lw = width(label, 8.5, { bold: true }) + 22;
  rect(x, H - 98, lw, 19, C.gold);
  t(label, x + 11, H - 92, { bold: true, size: 8.5, color: hex('#3a2600') });
  if (sub) t(sub, x + lw + 10, H - 92, { size: 8.5, color: hex('#D5DFF5'), max: 200 });
}

function footer(w, ctx, note) {
  const { t, page } = w;
  page.drawLine({ start: { x: M, y: M + 10 }, end: { x: W - M, y: M + 10 }, thickness: 0.6, color: C.line });
  t(`${ctx.S.school_name ?? ''}  |  ${ctx.S.motto ?? ''}`, M, M, { size: 7, color: C.muted, max: 360 });
  t(note ?? `Generated ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`, W - M, M, { size: 7, color: C.muted, align: 'right' });
}

const tile = (w, x, y, wd, label, value, o = {}) => {
  w.rect(x, y, wd, 44, C.tint); w.rect(x, y, 3, 44, o.accent ?? C.teal);
  w.t(label, x + 11, y + 32, { bold: true, size: 6.8, color: C.muted });
  w.t(value, x + 11, y + 12, { serif: true, size: o.size ?? 15, color: o.color ?? C.ink, max: wd - 16 });
  if (o.sub) w.t(o.sub, x + wd - 8, y + 12, { size: 7, color: C.muted, align: 'right' });
};

// ---------- black-and-white printing ----------
// Report cards are built to survive a black-and-white printer: every colour is turned into a grey with enough contrast, and meaning is never carried by colour alone
// (grades are always printed as letters, and each grade has its own grey so A..F also read apart in monochrome). Pass bw:false (admin, ?color=1) for the coloured version.
let BW = true;
const GREYS = { A: 0.12, B: 0.3, C: 0.48, D: 0.64, E: 0.78, F: 1 };
const lum = (c) => 0.299 * c.red + 0.587 * c.green + 0.114 * c.blue;
const grey = (c) => (c && c.red !== undefined ? grayscale(Math.min(1, lum(c))) : c);
const chip = (g, colour) => (BW ? grayscale(GREYS[g] ?? 0.5) : colour);
const chipText = (g, colour) => (BW ? (g === 'A' || g === 'B' || g === 'C' ? rgb(1, 1, 1) : rgb(0, 0, 0)) : colour);
const chipEdge = () => (BW ? { borderColor: grayscale(0.1), borderWidth: 0.7 } : {});
const barFill = (colour) => (BW ? grayscale(0.28) : colour);
function bwPage(page) {
  for (const m of ['drawRectangle', 'drawCircle', 'drawEllipse', 'drawSvgPath', 'drawLine', 'drawText']) {
    const orig = page[m].bind(page);
    page[m] = (...args) => {
      const i = args.length - 1, o = args[i];
      if (o && typeof o === 'object' && !Array.isArray(o)) args[i] = { ...o, ...(o.color ? { color: grey(o.color) } : {}), ...(o.borderColor ? { borderColor: grey(o.borderColor) } : {}) };
      return orig(...args);
    };
  }
  return page;
}
// Coloured report cards (the default) use a LIGHTER version of the school colours: every fill, border and line is blended with white; text keeps its colour so it stays readable.
const LIGHT = 0.32;
const lighten = (c) => (c && c.red !== undefined ? rgb(c.red + (1 - c.red) * LIGHT, c.green + (1 - c.green) * LIGHT, c.blue + (1 - c.blue) * LIGHT) : c);
function lightPage(page) {
  for (const m of ['drawRectangle', 'drawCircle', 'drawEllipse', 'drawSvgPath', 'drawLine']) {
    const orig = page[m].bind(page);
    page[m] = (...args) => {
      const i = args.length - 1, o = args[i];
      if (o && typeof o === 'object' && !Array.isArray(o)) args[i] = { ...o, ...(o.color ? { color: lighten(o.color) } : {}), ...(o.borderColor ? { borderColor: lighten(o.borderColor) } : {}) };
      return orig(...args);
    };
  }
  return page;
}
const newPage = (ctx) => { const p = ctx.doc.addPage([W, H]); return BW ? bwPage(p) : lightPage(p); };

// ======================= REPORT CARD =======================
// d.template === 'harvard' selects the formal black-and-white transcript style (administrator only; the route enforces it). d.bw === false keeps colours.
export function reportPage(ctx, d) {
  BW = d.template === 'harvard' ? d.bw !== false : d.bw === true;   // Harvard = black and white; every other card is coloured unless asked otherwise
  try { return d.template === 'harvard' ? harvardReportPage(ctx, d) : d.cls.section === 'basic' ? primaryReportPage(ctx, d) : secondaryReportPage(ctx, d); }
  finally { BW = true; }
}

function secondaryReportPage(ctx, d) {
  const page = newPage(ctx); const w = writer(page, ctx); const { t, rect } = w;
  const third = d.term.number === 3, cum = d.term.number >= 2, f = d.first;
  header(w, ctx, `Term ${d.term.number} report card`, `${d.term.academic_years.name} session`);

  // student block + photo
  const px = W - M - 84, py = H - BAND - 84;
  rect(px - 3, py - 3, 90, 106, C.white); rect(px - 3, py - 3, 90, 106, C.white, { borderColor: C.line, borderWidth: 1 });
  if (d.photo) page.drawImage(d.photo, { x: px, y: py, width: 84, height: 100 });
  else { rect(px, py, 84, 100, C.soft); page.drawCircle({ x: px + 42, y: py + 66, size: 16, color: hex('#B9C5DE') }); page.drawEllipse({ x: px + 42, y: py + 14, xScale: 30, yScale: 26, color: hex('#B9C5DE') }); }
  t(`${d.student.last_name} ${d.student.first_name} ${d.student.other_names ?? ''}`, M, H - BAND - 34, { serif: true, size: 17, max: 390 });
  t(`${d.cls.name}   |   ${d.student.gender}   |   ${d.student.age_years} years${d.student.admission_no ? '   |   Adm. ' + d.student.admission_no : ''}`, M, H - BAND - 50, { size: 9, color: C.muted, max: 400 });
  t(`Term ${fmtDate(d.term.starts_on)} to ${fmtDate(d.term.ends_on)}    Next term begins ${fmtDate(d.term.next_term_begins) || 'to be announced'}`, M, H - BAND - 64, { size: 8.5, color: C.muted, max: 400 });

  // stat tiles
  const ty = H - BAND - 128, gap = 8, tw4 = (TW - 3 * gap) / 4;
  const avgVal = f ? Number(cum ? f.cumulative_average : f.term_average) : null;
  const pct = d.dOpen ? Math.round((d.att / d.dOpen) * 100) : null;
  tile(w, M, ty, tw4, cum ? `CUMULATIVE AVG (${f?.terms_counted ?? d.term.number} TERM${(f?.terms_counted ?? d.term.number) === 1 ? '' : 'S'})` : 'TERM AVERAGE', avgVal != null ? avgVal.toFixed(1) : '-', { sub: avgVal != null ? 'Grade ' + gradeOf(avgVal) : '' });
  tile(w, M + (tw4 + gap), ty, tw4, 'POSITION IN CLASS', f ? ord(f.class_position) : '-', { sub: f ? 'of ' + f.class_size : '' });
  tile(w, M + 2 * (tw4 + gap), ty, tw4, 'ATTENDANCE', pct != null && d.att != null ? pct + '%' : '-', { sub: d.att != null ? `${d.att} of ${d.dOpen} days` : '' });
  if (third && f?.status) tile(w, M + 3 * (tw4 + gap), ty, tw4, 'END OF SESSION', f.status, { accent: f.status === 'Repeat' ? C.red : C.green, color: f.status === 'Repeat' ? C.red : C.green });
  else tile(w, M + 3 * (tw4 + gap), ty, tw4, 'SUBJECTS TAKEN', String(d.rows.length), {});

  // ----- bottom block, anchored from the page bottom -----
  const sigLine = M + 34, remarkTop = sigLine + 24 + 38, domTop = remarkTop + 10 + 100, rowATop = domTop + 10 + 64;

  // ----- subject table (fills the space above the bottom block) -----
  const tableTop = ty - 16, n = Math.max(1, d.rows.length), avail = tableTop - 17 - (rowATop + 12);
  const rh = Math.max(7.4, Math.min(16, avail / n)), fs = rh < 8.6 ? 6.2 : rh < 9.6 ? 6.8 : rh < 12.5 ? 8 : 9, fit = Math.max(1, Math.floor(avail / rh)), shownRows = d.rows.slice(0, fit);      // many subjects shrink the rows instead of running into the block below
  const cx = { sub: M + 8, ca1: M + 178, ca2: M + 216, ex: M + 254, tot: M + 296, bar: M + 332, avg: M + 440, gr: M + 480 };
  rect(M, tableTop - 17, TW, 17, C.deep);
  [['SUBJECT', cx.sub], ['1ST CA', cx.ca1], ['2ND CA', cx.ca2], ['EXAM', cx.ex], ['TOTAL', cx.tot], ['SCORE (CLASS AVG |)', cx.bar], ['AVG', cx.avg], ['GRADE', cx.gr]].forEach(([h, x]) => t(h, x, tableTop - 12, { bold: true, size: 6.8, color: C.white }));
  let y = tableTop - 17;
  shownRows.forEach((r, i) => {
    y -= rh; if (i % 2 === 0) rect(M, y, TW, rh, C.soft);
    const base = y + (rh - fs) / 2 + 1;
    t(r.subject_name, cx.sub, base, { size: fs, max: 160 }); t(r.ca1, cx.ca1 + 4, base, { size: fs }); t(r.ca2, cx.ca2 + 4, base, { size: fs }); t(r.exam, cx.ex + 4, base, { size: fs });
    t(r.total, cx.tot, base, { bold: true, size: fs });
    const bw = 96, by = y + rh / 2 - 2.5; rect(cx.bar, by, bw, 5, C.line);
    rect(cx.bar, by, Math.max(1, Math.min(100, Number(r.total)) / 100 * bw), 5, barFill(GRADE[r.grade] ?? C.teal));
    const ca = d.classAvg?.[r.subject_id]; if (ca != null) { rect(cx.bar + Math.min(100, ca) / 100 * bw - 0.5, by - 2, 1.4, 9, C.ink); t(ca.toFixed(0), cx.avg + 4, base, { size: fs, color: C.muted }); }
    const cw = 20, chx = cx.gr; rect(chx, y + (rh - 11) / 2, cw, 11, chip(r.grade, GRADE[r.grade] ?? C.teal), chipEdge()); t(r.grade, chx + cw / 2, y + (rh - 11) / 2 + 3, { bold: true, size: 7.5, color: chipText(r.grade, C.white), align: 'center' });
  });
  if (d.rows.length === 0) t(d.inactiveNote ?? 'No scores recorded for this term.', M + 8, y - 14, { size: 9, color: C.muted });
  if (d.rows.length > shownRows.length) t(`+ ${d.rows.length - shownRows.length} more subject(s) are on the online report`, M + 8, y - 8, { size: 6.5, color: C.muted });
  rect(M, tableTop - 17 - n * rh, TW, 0.8, C.line);

  // ----- row A: trend + attendance -----
  const half = (TW - 12) / 2; let a = rowATop;
  rect(M, a - 64, half, 64, C.white, { borderColor: C.line, borderWidth: 1 });
  t('PROGRESS THIS SESSION (TERM AVERAGE)', M + 10, a - 12, { bold: true, size: 6.8, color: C.muted });
  const tr = (d.trend ?? []).slice(0, 3);
  tr.forEach((p, i) => { const bx = M + 14 + i * 56, bh = Math.max(2, (p.avg / 100) * 34);
    rect(bx, a - 56, 34, bh, p.n === d.term.number ? C.teal : hex('#BFD0F0')); t(p.avg.toFixed(0), bx + 17, a - 56 + bh + 3, { size: 7.5, bold: true, align: 'center' }); t('T' + p.n, bx + 17, a - 63, { size: 6.5, color: C.muted, align: 'center' }); });
  if (tr.length === 0) t('No earlier terms recorded.', M + 10, a - 36, { size: 8, color: C.muted });
  const ax = M + half + 12; rect(ax, a - 64, half, 64, C.white, { borderColor: C.line, borderWidth: 1 });
  t('ATTENDANCE', ax + 10, a - 12, { bold: true, size: 6.8, color: C.muted });
  const bw = half - 20; rect(ax + 10, a - 30, bw, 8, C.line); if (pct != null && d.att != null) rect(ax + 10, a - 30, Math.max(1, bw * pct / 100), 8, pct >= 85 ? C.green : pct >= 70 ? C.gold : C.red);
  t(d.att != null ? `Present ${d.att}   Absent ${d.dOpen - d.att}   School opened ${d.dOpen}` : 'Not recorded', ax + 10, a - 46, { size: 8.5 });
  t(pct != null && d.att != null ? `${pct}% attendance` : '', ax + 10, a - 58, { size: 7.5, color: C.muted });

  // ----- domains -----
  const dd = domTop; const col = (title, list, x0) => {
    t(title.toUpperCase(), x0, dd - 2, { bold: true, size: 6.8, color: C.teal }); let yy = dd - 6;
    const step = Math.min(11, 82 / Math.max(1, list.length));
    for (const it of list) { yy -= step; t(it.name, x0, yy, { size: 8, max: 118 });
      for (let k = 1; k <= 5; k++) page.drawCircle({ x: x0 + 140 + k * 10, y: yy + 2.7, size: 3, color: it.score >= k ? C.teal : C.white, borderColor: it.score >= k ? C.teal : hex('#B9C5DE'), borderWidth: 0.8 });
      if (it.score) t(LEVELS[it.score], x0 + 205, yy, { size: 7, color: C.muted, max: 50 }); }
  };
  col('Affective domain', d.affective, M); col('Psychomotor domain', d.psychomotor, M + half + 12);
  t('Rating: 5 Excellent, 4 Very good, 3 Good, 2 Average, 1 Poor.   ' + GRADE_KEY, M, remarkTop + 4, { size: 6.8, color: C.muted, max: TW });

  // ----- remark -----
  const remW = TW - 104; rect(M, sigLine + 24, remW, 36, C.goldSoft); rect(M, sigLine + 24, 4, 36, C.gold);
  t(`${headTitle(d).toUpperCase()}'S REMARK`, M + 14, sigLine + 24 + 25, { bold: true, size: 6.8, color: hex('#8a5f00') });
  w.wrap(f?.remark ?? '', 10.5, remW - 28, { bold: true }).slice(0, 2).forEach((ln, i) => t(ln, M + 14, sigLine + 24 + 11 - i * 0, { bold: true, size: 10.5 }));

  // ----- stamp: always the bottom right corner -----
  t(headLine(d), M, sigLine - 11, { size: 8.5, bold: true, color: C.muted, max: 300 });
  drawStamp(w, d, W - M - 96, M + 16, 96);
  footer(w, ctx);
}


// ======================= HARVARD-STYLE REPORT (formal transcript, black and white by design) =======================
// Serif type, hairline rules, no fills, no colour: an academic-transcript look for the Basic and Secondary sections alike. Administrator only.
function harvardReportPage(ctx, d) {
  const page = newPage(ctx); const w = writer(page, ctx); const { t } = w;
  const basic = d.cls.section === 'basic', third = d.term.number === 3, cum = d.term.number >= 2, f = d.first, K = grayscale(0), G = grayscale(0.38), L = grayscale(0.65);
  const rule = (y, th = 0.6, x1 = M, x2 = W - M, col = K) => page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: th, color: col });
  const tr = (s, x, y, o = {}) => t(s, x, y, { tr: true, color: K, ...o }), tb = (s, x, y, o = {}) => t(s, x, y, { serif: true, color: K, ...o }), ti = (s, x, y, o = {}) => t(s, x, y, { it: true, color: G, ...o });

  // letterhead
  if (ctx.logo) page.drawImage(ctx.logo, { x: (W - 340) / 2, y: (H - 340) / 2 - 10, width: 340, height: 340, opacity: 0.04 });
  if (ctx.logo) page.drawImage(ctx.logo, { x: W / 2 - 24, y: H - 84, width: 48, height: 48 });
  tb((ctx.S.school_name ?? 'Baptist Academy').toUpperCase(), W / 2, H - 104, { size: 17, align: 'center', max: TW });
  ti(ctx.S.address ?? '', W / 2, H - 117, { size: 8.5, align: 'center', max: TW });
  rule(H - 126, 1.4); rule(H - 129, 0.5);
  tb(basic ? 'OFFICIAL PROGRESS REPORT' : 'OFFICIAL ACADEMIC REPORT', W / 2, H - 150, { size: 11.5, align: 'center' });
  ti(`Term ${d.term.number}, ${d.term.academic_years.name} session`, W / 2, H - 163, { size: 9.5, align: 'center' });

  // student particulars (two columns) and photograph
  const top = H - 186, labelW = 82, col2 = M + 262;
  const field = (label, value, x, y) => { tr(label.toUpperCase(), x, y, { size: 7, color: G }); tb(value, x + labelW, y, { size: 9.5, max: 170 }); };
  field('Name', `${d.student.last_name}, ${d.student.first_name} ${d.student.other_names ?? ''}`.trim(), M, top);
  field('Class', d.cls.name, M, top - 15);
  field('Admission no.', d.student.admission_no ?? '-', M, top - 30);
  field('Sex / age', `${d.student.gender}, ${d.student.age_years} years`, col2, top);
  field('Term dates', `${fmtDate(d.term.starts_on)} to ${fmtDate(d.term.ends_on)}`, col2, top - 15);
  field('Next term', fmtDate(d.term.next_term_begins) || 'To be announced', col2, top - 30);
  if (d.photo) page.drawImage(d.photo, { x: W - M - 46, y: top - 36, width: 46, height: 56 });
  rule(top - 44, 0.6);

  // summary strip
  const avgVal = f ? Number(cum ? f.cumulative_average : f.term_average) : null;
  const merit = d.rows.reduce((a, r) => a + meritPoints(r.total), 0);
  const pct = d.dOpen ? Math.round((d.att / d.dOpen) * 100) : null;
  const cells = [[cum ? `CUMULATIVE AVERAGE` : 'TERM AVERAGE', avgVal != null ? `${avgVal.toFixed(1)}  (${gradeOf(avgVal)})` : '-'], ['POSITION', f ? `${ord(f.class_position)} of ${f.class_size}` : '-'],
    ['MERIT SCORE', `${merit}`], [third && f?.status ? 'END OF SESSION' : 'SUBJECTS', third && f?.status ? f.status.toUpperCase() : String(d.rows.length)]];
  const sy = top - 72, cw4 = TW / 4;
  cells.forEach(([lab, val], i) => { const x = M + i * cw4; tr(lab, x + 6, sy + 16, { size: 6.8, color: G }); tb(val, x + 6, sy, { size: 12.5, max: cw4 - 12 }); if (i) page.drawLine({ start: { x, y: sy - 6 }, end: { x, y: sy + 26 }, thickness: 0.4, color: L }); });
  rule(sy - 12, 0.6);

  // bottom block anchored from the page bottom
  const sigLine = M + 34, remarkTop = sigLine + 24 + 30, ratingsTop = remarkTop + 12 + 78, attTop = ratingsTop + 12 + 30;

  // subject table
  const tableTop = sy - 24, n = Math.max(1, d.rows.length), avail = tableTop - 16 - (attTop + 10);
  const rh = Math.max(7.4, Math.min(15, avail / n)), fs = rh < 8.6 ? 6.2 : rh < 9.6 ? 6.9 : rh < 12 ? 8.2 : 9.2, fit = Math.max(1, Math.floor(avail / rh)), shown = d.rows.slice(0, fit);
  const X = { sub: M + 2, ca1: M + 190, ca2: M + 228, ex: M + 266, tot: M + 304, avg: M + 346, gr: M + 392, pts: M + 428, rem: M + 458 };
  rule(tableTop, 1.2);
  [['SUBJECT', X.sub], ['CA 1', X.ca1], ['CA 2', X.ca2], ['EXAM', X.ex], ['TOTAL', X.tot], ['CLASS AVG', X.avg], ['GRADE', X.gr], ['PTS', X.pts], [basic ? 'COMMENT' : 'REMARK', X.rem]]
    .forEach(([h, x]) => tb(h, x, tableTop - 11, { size: 6.8 }));
  rule(tableTop - 15, 0.5);
  let y = tableTop - 15;
  shown.forEach((r, i) => {
    y -= rh; const base = y + (rh - fs) / 2 + 1;
    tr(r.subject_name, X.sub, base, { size: fs, max: 180 }); tr(r.ca1, X.ca1 + 4, base, { size: fs }); tr(r.ca2, X.ca2 + 4, base, { size: fs }); tr(r.exam, X.ex + 4, base, { size: fs });
    tb(r.total, X.tot + 2, base, { size: fs });
    const ca = d.classAvg?.[r.subject_id]; if (ca != null) tr(ca.toFixed(0), X.avg + 10, base, { size: fs, color: G });
    tb(r.grade, X.gr + 8, base, { size: fs + 0.6 }); tr(String(meritPoints(r.total)), X.pts + 4, base, { size: fs, color: G });
    tr(WORD[r.grade] ?? '', X.rem, base, { size: fs - 0.4, color: G, max: 84 });
    if (i < shown.length - 1) page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.25, color: grayscale(0.82) });
  });
  if (d.rows.length === 0) ti(d.inactiveNote ?? 'No scores recorded for this term.', M + 2, y - 14, { size: 9 });
  if (d.rows.length > shown.length) ti(`+ ${d.rows.length - shown.length} more subject(s) are on the online report`, M + 2, y - 8, { size: 6.5 });
  rule(tableTop - 15 - n * rh - 1, 1.2);

  // attendance
  tb('ATTENDANCE', M, attTop - 2, { size: 7.5 });
  tr(d.att != null ? `School opened ${d.dOpen} times    Present ${d.att}    Absent ${d.dOpen - d.att}    Attendance ${pct}%` : 'Attendance not recorded', M + 70, attTop - 2, { size: 8.5 });
  rule(attTop - 8, 0.3, M, W - M, L);

  // ratings as words, two columns
  const half = (TW - 14) / 2;
  const col = (title, list, x0) => { tb(title.toUpperCase(), x0, ratingsTop - 2, { size: 7.5 }); let yy = ratingsTop - 5; const step = Math.min(10.4, 66 / Math.max(1, list.length));
    for (const it of list) { yy -= step; tr(it.name, x0, yy, { size: 7.8, max: 120 }); tr(it.score ? `${it.score} - ${LEVELS[it.score]}` : '-', x0 + half - 4, yy, { size: 7.8, align: 'right', color: G }); } };
  col(basic ? 'Character and behaviour' : 'Affective domain', d.affective, M); col(basic ? 'Skills and activities' : 'Psychomotor domain', d.psychomotor, M + half + 14);
  page.drawLine({ start: { x: M + half + 7, y: ratingsTop - 4 }, end: { x: M + half + 7, y: ratingsTop - 70 }, thickness: 0.3, color: L });
  ti('Ratings: 5 Excellent, 4 Very good, 3 Good, 2 Average, 1 Poor.   ' + GRADE_KEY + '   Pts: A=5 B=4 C=3 D=2 E=1 F=0.', M, remarkTop + 2, { size: 6.5, max: TW });

  // remark and signature
  tb(`${headTitle(d).toUpperCase()}'S REMARK`, M, sigLine + 24 + 22, { size: 7 });
  w.wrap(f?.remark ?? '', 10, TW - 120, { it: true }).slice(0, 2).forEach((ln, i) => ti(ln, M, sigLine + 24 + 9 - i * 12, { size: 10, color: K }));
  tr(headLine(d), M, sigLine - 11, { size: 8.5, color: G, max: 300 });
  drawStamp(w, d, W - M - 96, M + 16, 96);
  rule(M + 12, 0.6);
  tr(`${ctx.S.school_name ?? ''}  |  ${ctx.S.motto ?? ''}`, M, M, { size: 7, color: G, max: 360 });
  tr(`Printed ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`, W - M, M, { size: 7, color: G, align: 'right' });
}

// ======================= STAMP (bottom right of every report card page) =======================
// The picture holds the stamp; the signature is laid over the "sign" spot and the printing date over the "date" spot.
function drawStamp(w, d, x, y, width) {
  const st = d.stamp; const { page, t } = w; const maxH = 88;
  if (!st || (!st.img && !st.sample)) {
    if (st?.sig) { const dim = st.sig.scale(Math.min(110 / st.sig.width, 36 / st.sig.height)); page.drawImage(st.sig, { x: x + width - dim.width, y: y + 14, width: dim.width, height: dim.height }); }
    page.drawLine({ start: { x: x - 14, y: y + 12 }, end: { x: x + width, y: y + 12 }, thickness: 0.8, color: C.ink });
    t(headLine(d), x + width, y + 2, { size: 8, color: C.muted, align: 'right', max: 230 });
    return;
  }
  const L = st.layout; let wd = width, ht = st.sample ? width : (width * st.img.height) / st.img.width;
  if (ht > maxH) { wd = (wd * maxH) / ht; ht = maxH; }
  const sx = x + width - wd, sy = y;      // right aligned
  if (st.sample) {                         // made-up stamp for the template preview
    const cx = sx + wd / 2, cy = sy + ht / 2, rad = Math.min(wd, ht) / 2 - 2;
    page.drawCircle({ x: cx, y: cy, size: rad, borderColor: hex('#2A3F9E'), borderWidth: 2, opacity: 0, borderOpacity: 0.85 });
    page.drawCircle({ x: cx, y: cy, size: rad - 5, borderColor: hex('#2A3F9E'), borderWidth: 0.8, opacity: 0, borderOpacity: 0.85 });
    t('SCHOOL STAMP', cx, cy + rad - 16, { bold: true, size: 6.5, color: hex('#2A3F9E'), align: 'center' });
    t('Sign', cx - rad / 2 - 4, cy + 4, { size: 6, color: hex('#6674B8') }); t('Date', cx - rad / 2 - 4, cy - 14, { size: 6, color: hex('#6674B8') });
    page.drawSvgPath('M0,10 C6,-6 10,22 16,6 S28,0 34,10', { x: cx - 8, y: cy + 6, scale: 0.9, borderColor: hex('#1B2A6B'), borderWidth: 1.2 });
  } else page.drawImage(st.img, { x: sx, y: sy, width: wd, height: ht });
  if (st.sig) {
    const sw = Math.max(20, L.sign.w * wd), sh = (sw * st.sig.height) / st.sig.width;
    page.drawImage(st.sig, { x: sx + L.sign.x * wd - sw / 2, y: sy + ht - L.sign.y * ht - sh / 2, width: sw, height: sh });
  }
  const size = Math.max(4.5, L.date.size * wd), txt = st.date ?? fmtDate(new Date());
  t(txt, sx + L.date.x * wd, sy + ht - L.date.y * ht - size / 3, { bold: true, size, color: hex('#1B2A6B'), align: 'center' });
}

// rounded rectangle with a real corner radius (pdf-lib has none built in)
function rr(page, x, y, wd, ht, r, o = {}) {
  const k = Math.min(r, wd / 2, ht / 2);
  page.drawSvgPath(`M${k},0 H${wd - k} Q${wd},0 ${wd},${k} V${ht - k} Q${wd},${ht} ${wd - k},${ht} H${k} Q0,${ht} 0,${ht - k} V${k} Q0,0 ${k},0 Z`, { x, y: y + ht, ...o });
}
const STAR = 'M12 2l3 6.5 7 .9-5.1 4.9 1.3 7L12 17.8 5.8 21.3l1.3-7L2 9.4l7-.9z';
const P = { sky: hex('#2E86DE'), sun: hex('#F59E0B'), leaf: hex('#22A06B'), berry: hex('#E2547A'), cream: hex('#FFF8E6'), skySoft: hex('#E7F3FF'), sunSoft: hex('#FFF3D6'), edge: hex('#FFE2A8'), brown: hex('#3A2600') };
const PGRADE = { A: P.leaf, B: P.sky, C: P.sun, D: hex('#E07B1A'), E: hex('#B8541A'), F: hex('#D13B35') };
const WORD = { A: 'Excellent', B: 'Very good', C: 'Good', D: 'Fair', E: 'Weak pass', F: 'Needs help' };

// ======================= PRIMARY / NURSERY REPORT CARD (sunny, rounded, with stars) =======================
function primaryReportPage(ctx, d) {
  const page = newPage(ctx); const w = writer(page, ctx); const { t, rect } = w;
  const third = d.term.number === 3, cum = d.term.number >= 2, f = d.first;
  // frame + sunny header
  rr(page, 14, 14, W - 28, H - 28, 22, { borderColor: P.sun, borderWidth: 3, opacity: 0, borderOpacity: 1 });
  if (ctx.logo) page.drawImage(ctx.logo, { x: (W - 300) / 2, y: (H - 300) / 2 - 30, width: 300, height: 300, opacity: 0.05 });
  rr(page, 22, H - 134, W - 44, 112, 18, { color: P.sun });
  page.drawCircle({ x: W - 60, y: H - 40, size: 46, color: hex('#FFD27A') }); page.drawCircle({ x: W - 110, y: H - 120, size: 22, color: hex('#FFD27A') }); page.drawCircle({ x: 90, y: H - 128, size: 16, color: hex('#FFD27A') });
  rect(22, H - 134, W - 44, 8, P.sky);
  page.drawCircle({ x: 72, y: H - 76, size: 36, color: C.white }); if (ctx.logo) page.drawImage(ctx.logo, { x: 42, y: H - 106, width: 60, height: 60 });
  t(ctx.S.school_name ?? 'Baptist Academy', 122, H - 62, { serif: true, size: 21, color: P.brown, max: 380 });
  t(ctx.S.address ?? '', 122, H - 77, { size: 8.5, color: P.brown, max: 380 });
  const label = `TERM ${d.term.number} PROGRESS REPORT`, lw = w.width(label, 8.5, { bold: true }) + 24;
  rr(page, 122, H - 108, lw, 20, 10, { color: P.berry }); t(label, 134, H - 101, { bold: true, size: 8.5, color: C.white });
  t(`${d.term.academic_years.name} session`, 122 + lw + 10, H - 101, { size: 9, color: P.brown, bold: true });

  // hero card with the child
  const hy = H - 134 - 14 - 84;
  rr(page, 28, hy, W - 56, 84, 18, { color: P.skySoft, borderColor: P.sky, borderWidth: 1.4, borderDashArray: [4, 3], borderDashPhase: 0 });
  rect(W - 28 - 14 - 64, hy + 10, 64, 64, C.white, { borderColor: P.sun, borderWidth: 3 });
  if (d.photo) page.drawImage(d.photo, { x: W - 28 - 14 - 62, y: hy + 12, width: 60, height: 60 });
  else { page.drawCircle({ x: W - 28 - 14 - 32, y: hy + 52, size: 11, color: hex('#F6C27B') }); page.drawEllipse({ x: W - 28 - 14 - 32, y: hy + 22, xScale: 20, yScale: 17, color: hex('#F6C27B') }); }
  t(`${d.student.last_name} ${d.student.first_name} ${d.student.other_names ?? ''}`, 44, hy + 56, { serif: true, size: 18, max: 380 });
  const chips = [[d.cls.name, P.sky], [d.student.gender, P.berry], [`${d.student.age_years} years`, P.leaf], ...(d.student.admission_no ? [['Adm. ' + d.student.admission_no, P.sun]] : [])];
  let cx = 44; chips.forEach(([txt, col]) => { const cw = w.width(txt, 8, { bold: true }) + 18; rr(page, cx, hy + 33, cw, 15, 7.5, { color: col }); t(txt, cx + 9, hy + 37.5, { bold: true, size: 8, color: col === P.sun ? P.brown : C.white }); cx += cw + 6; });
  t(`Term ${fmtDate(d.term.starts_on)} to ${fmtDate(d.term.ends_on)}`, 44, hy + 18, { size: 8.5, color: C.muted });
  t(`Next term begins ${fmtDate(d.term.next_term_begins) || 'to be announced'}`, 44, hy + 7, { size: 8.5, color: C.muted });

  // four round badges
  const by = hy - 10 - 48, gap = 10, bw = (W - 56 - 3 * gap) / 4;
  const avgVal = f ? Number(cum ? f.cumulative_average : f.term_average) : null; const pct = d.dOpen ? Math.round((d.att / d.dOpen) * 100) : null;
  const badge = (i, col, big, label, sub, dark) => { const x = 28 + i * (bw + gap); rr(page, x, by - 3, bw, 48, 14, { color: hex('#000000'), opacity: 0.1 }); rr(page, x, by, bw, 48, 14, { color: col });
    const tc = dark ? P.brown : C.white; t(big, x + bw / 2, by + 22, { serif: true, size: 19, color: tc, align: 'center', max: bw - 8 }); t(label, x + bw / 2, by + 11, { bold: true, size: 6.5, color: tc, align: 'center' }); if (sub) t(sub, x + bw / 2, by + 2.5, { size: 6.5, color: tc, align: 'center' }); };
  badge(0, P.sky, avgVal != null ? avgVal.toFixed(1) : '-', cum ? 'CUMULATIVE AVERAGE' : 'TERM AVERAGE', avgVal != null ? 'Grade ' + gradeOf(avgVal) : '');
  badge(1, P.berry, f ? ord(f.class_position) : '-', 'POSITION', f ? 'of ' + f.class_size : '');
  badge(2, P.leaf, pct != null && d.att != null ? pct + '%' : '-', 'ATTENDANCE', d.att != null ? `${d.att} of ${d.dOpen} days` : '');
  if (third && f?.status) badge(3, f.status === 'Repeat' ? hex('#D13B35') : P.sun, f.status, 'END OF SESSION', '', f.status !== 'Repeat'); else badge(3, P.sun, String(d.rows.length), 'SUBJECTS', '', true);

  // bottom blocks, anchored from the page bottom (stamp is the lowest, at the right)
  const stampTop = M + 16 + 88, rowBTop = stampTop + 10 + 62, domTop = rowBTop + 10 + 104;
  // subject table
  const tableTop = by - 10, n = Math.max(1, d.rows.length), avail = tableTop - 18 - (domTop + 8);
  const rh = Math.max(7.4, Math.min(17, avail / n)), fs = rh < 8.6 ? 6.2 : rh < 9.6 ? 6.8 : rh < 12.5 ? 8 : 9, fit = Math.max(1, Math.floor(avail / rh)), shownRows = d.rows.slice(0, fit);
  const cx2 = { sub: 38, c1: 190, c2: 232, ex: 274, tot: 316, avg: 360, gr: 405, cm: 440 };
  rr(page, 28, tableTop - 18, W - 56, 18, 9, { color: P.sky });
  [['SUBJECT', cx2.sub], ['1ST TEST', cx2.c1], ['2ND TEST', cx2.c2], ['EXAM', cx2.ex], ['TOTAL', cx2.tot], ['CLASS AVG', cx2.avg], ['GRADE', cx2.gr], ['COMMENT', cx2.cm]].forEach(([h, x]) => t(h, x, tableTop - 12, { bold: true, size: 6.8, color: C.white }));
  let y = tableTop - 18;
  shownRows.forEach((r, i) => {
    y -= rh; if (i % 2 === 0) rr(page, 28, y + 0.5, W - 56, rh - 1, 5, { color: P.cream });
    const base = y + (rh - fs) / 2 + 1;
    t(r.subject_name, cx2.sub, base, { bold: true, size: fs, max: 146 }); t(r.ca1, cx2.c1 + 6, base, { size: fs }); t(r.ca2, cx2.c2 + 6, base, { size: fs }); t(r.exam, cx2.ex + 4, base, { size: fs });
    t(r.total, cx2.tot + 4, base, { bold: true, size: fs });
    const ca = d.classAvg?.[r.subject_id]; if (ca != null) t(ca.toFixed(0), cx2.avg + 12, base, { size: fs, color: C.muted });
    const rad = Math.min(7, rh / 2 - 0.5); page.drawCircle({ x: cx2.gr + 8, y: y + rh / 2, size: rad, color: chip(r.grade, PGRADE[r.grade] ?? P.sky), ...chipEdge() }); t(r.grade, cx2.gr + 8, y + rh / 2 - 2.6, { bold: true, size: 7.5, color: chipText(r.grade, r.grade === 'C' ? P.brown : C.white), align: 'center' });
    t(WORD[r.grade] ?? '', cx2.cm, base, { size: fs - 0.5, color: C.muted });
  });
  if (d.rows.length === 0) t(d.inactiveNote ?? 'No scores recorded for this term.', 40, y - 14, { size: 9, color: C.muted });
  if (d.rows.length > shownRows.length) t(`+ ${d.rows.length - shownRows.length} more subject(s) are on the online report`, 40, y - 8, { size: 6.5, color: C.muted });

  // character and skills, with stars
  const half = (W - 56 - 12) / 2;
  [['CHARACTER AND BEHAVIOUR', d.affective, 28], ['SKILLS AND ACTIVITIES', d.psychomotor, 28 + half + 12]].forEach(([title, list, x0]) => {
    rr(page, x0, domTop - 104, half, 104, 14, { color: C.white, borderColor: hex('#CFE6FF'), borderWidth: 1.4 });
    t(title, x0 + 12, domTop - 14, { bold: true, size: 7, color: P.sky });
    const step = Math.min(11.5, 80 / Math.max(1, list.length)); let yy = domTop - 18;
    for (const it of list) { yy -= step; t(it.name, x0 + 12, yy, { size: 8, max: 112 });
      for (let k = 1; k <= 5; k++) page.drawSvgPath(STAR, { x: x0 + 128 + (k - 1) * 11.5, y: yy + 9, scale: 0.46, color: it.score >= k ? P.sun : undefined, borderColor: P.sun, borderWidth: 1 });
      if (it.score) t(LEVELS[it.score], x0 + 190, yy, { size: 6.8, color: C.muted, max: 60 }); }
  });

  // progress + head's remark
  rr(page, 28, rowBTop - 62, half, 62, 14, { color: C.white, borderColor: hex('#CFE6FF'), borderWidth: 1.4 });
  t('MY PROGRESS THIS SESSION', 40, rowBTop - 13, { bold: true, size: 7, color: P.sky });
  const tr = (d.trend ?? []).slice(0, 3);
  tr.forEach((p, i) => { const bx = 46 + i * 54, bh = Math.max(2, (p.avg / 100) * 30); rr(page, bx, rowBTop - 54, 32, bh, 4, { color: p.n === d.term.number ? P.sky : hex('#BFD9F5') }); t(p.avg.toFixed(0), bx + 16, rowBTop - 54 + bh + 3, { size: 7, bold: true, align: 'center' }); t('T' + p.n, bx + 16, rowBTop - 61, { size: 6, color: C.muted, align: 'center' }); });
  if (!tr.length) t('No earlier terms recorded.', 40, rowBTop - 36, { size: 8, color: C.muted });
  const rx = 28 + half + 12; rr(page, rx, rowBTop - 62, half, 62, 14, { color: P.sunSoft, borderColor: P.sun, borderWidth: 1.4 });
  t(`${headTitle(d).toUpperCase()}'S REMARK`, rx + 12, rowBTop - 14, { bold: true, size: 6.8, color: hex('#8a5f00') });
  w.wrap(f?.remark ?? '', 10, half - 24, { bold: true }).slice(0, 3).forEach((ln, i) => t(ln, rx + 12, rowBTop - 29 - i * 12, { bold: true, size: 10 }));

  // legend (left) and stamp (bottom right)
  t('Stars: 5 Excellent, 4 Very good, 3 Good, 2 Average, 1 Poor.', 34, M + 52, { size: 6.8, color: C.muted });
  t(GRADE_KEY, 34, M + 42, { size: 6.8, color: C.muted });
  t(headLine(d), 34, M + 28, { size: 8.5, bold: true, color: C.muted, max: 300 });
  drawStamp(w, d, W - M - 100, M + 16, 100);
  footer(w, ctx);
}

// ======================= BASIC CA SHEET: one page per child, every subject of the term =======================
export function basicCaSheets(ctx, d) {
  const perPage = 24;
  d.children.forEach((kid) => {
    const pages = Math.max(1, Math.ceil(kid.subjects.length / perPage));
    for (let p = 0; p < pages; p++) {
      const page = ctx.doc.addPage([W, H]); const w = writer(page, ctx); const L = M + 6, tw = TW - 12;
      header(w, ctx, 'Continuous assessment sheet', `${d.term.academic_years.name}, Term ${d.term.number}`);
      let y = H - BAND - 56; const gap = 8, t3 = (tw - 2 * gap) / 3;
      tile(w, L, y, t3 * 1.5, 'CHILD', kid.name, { size: 13 }); tile(w, L + t3 * 1.5 + gap, y, t3 * 0.75 - gap / 2, 'CLASS', d.className, { size: 12 }); tile(w, L + t3 * 2.25 + gap * 1.5, y, t3 * 0.75 - gap / 2, 'SUBJECTS', String(kid.subjects.length), {});
      y -= 20; const cols = [L + 8, L + 40, L + 280, L + 340, L + 400, L + 460];
      w.rect(L, y - 16, tw, 16, C.deep); ['S/N', 'SUBJECT', '1ST TEST (15)', '2ND TEST (15)', 'EXAM (70)', 'TOTAL (100)'].forEach((h, i) => w.t(h, cols[i], y - 11, { bold: true, size: 6.8, color: C.white })); y -= 16;
      kid.subjects.slice(p * perPage, (p + 1) * perPage).forEach((s, i) => { y -= 24; w.rect(L, y, tw, 24, i % 2 ? C.white : C.soft, { borderColor: C.line, borderWidth: 0.5 });
        w.t(String(p * perPage + i + 1), cols[0], y + 8, { size: 8.5 }); w.t(s, cols[1], y + 8, { size: 9.5, bold: true, max: 235 });
        [cols[2], cols[3], cols[4], cols[5]].forEach((x) => w.page.drawLine({ start: { x: x - 6, y }, end: { x: x - 6, y: y + 24 }, thickness: 0.4, color: C.line })); });
      w.t('Class teacher: ________________________      Date: ______________', L, M + 36, { size: 9, color: C.muted });
      footer(w, ctx, `${kid.name}  |  Page ${p + 1} of ${pages}`);
    }
  });
}

// ======================= PAYMENT SCHEDULE =======================
export function schedulePage(ctx, d) {
  const page = ctx.doc.addPage([W, H]); const w = writer(page, ctx); const { t, rect } = w;
  header(w, ctx, 'Payment schedule', `${d.term.academic_years.name}, Term ${d.term.number}`);
  let y = H - BAND - 38;
  t(`${d.student.last_name} ${d.student.first_name}`, M, y, { serif: true, size: 17 });
  t(`${d.cls.name}   |   ${d.cls.section === 'secondary' ? 'Secondary' : 'Basic'} section${d.student.admission_no ? '   |   Adm. ' + d.student.admission_no : ''}`, M, y - 16, { size: 9, color: C.muted });
  const money = (v) => 'NGN ' + Number(v).toLocaleString('en-NG', { minimumFractionDigits: 2 });
  // total tile
  rect(W - M - 190, y - 22, 190, 46, C.deep); t('TOTAL DUE THIS TERM', W - M - 178, y + 10, { bold: true, size: 6.8, color: hex('#B4C3E6') });
  t(money(d.total), W - M - 178, y - 10, { serif: true, size: 15, color: C.white, max: 170 });
  y -= 60;
  const groups = [[0, 'Balance brought forward', 'PREVIOUS'], [1, 'School fees for the term', 'LEVEL 1'], [2, 'Section levies', 'LEVEL 2'], [3, 'Class levies', 'LEVEL 3']];
  const nGroups = groups.filter(([lv]) => d.items.some((i) => (i.level ?? 0) === lv)).length;
  const rowH = Math.max(13, Math.min(21, (y - (M + 212) - nGroups * 44) / Math.max(1, d.items.length)));      // many fee lines shrink the rows so the totals never reach the footer
  for (const [lv, title, tag] of groups) {
    const g = d.items.filter((i) => (i.level ?? 0) === lv); if (!g.length) continue;
    rect(M, y - 20, TW, 22, C.tint); rect(M, y - 20, 4, 22, C.teal);
    t(tag, M + 14, y - 12, { bold: true, size: 6.8, color: C.teal }); t(title, M + 58, y - 13, { bold: true, size: 10 });
    t(money(g.reduce((a, i) => a + Number(i.amount_ngn), 0)), W - M - 10, y - 13, { bold: true, size: 9.5, align: 'right' });
    y -= 22;
    g.forEach((i, k) => { y -= rowH; if (k % 2 === 0) rect(M, y - 5, TW, rowH, C.soft); t(i.title, M + 14, y + 2, { size: 9.5, max: 300 });
      if (i.status) { const lab = i.status === 'confirmed' ? 'PAID' : i.status === 'claimed' ? 'AWAITING' : 'UNPAID', col = i.status === 'confirmed' ? C.green : i.status === 'claimed' ? C.gold : C.red;
        rect(W - M - 190, y - 1, 54, 12, col); t(lab, W - M - 163, y + 2, { bold: true, size: 6.5, color: i.status === 'claimed' ? hex('#3a2600') : C.white, align: 'center' }); }
      t(money(i.amount_ngn), W - M - 10, y + 2, { size: 9.5, align: 'right' }); });
    y -= 20;
  }
  if (d.items.length === 0) t('No fees have been set for this term yet.', M, y, { size: 10, color: C.muted });
  y -= 6; rect(M, y - 34, TW, 38, C.deep); t('GRAND TOTAL', M + 16, y - 20, { bold: true, size: 9, color: hex('#B4C3E6') });
  t(money(d.total), W - M - 16, y - 22, { serif: true, size: 17, color: C.white, align: 'right' });
  if (d.items.some((i) => i.status)) { const paid = d.items.filter((i) => i.status === 'confirmed').reduce((a, i) => a + Number(i.amount_ngn), 0);
    y -= 68; const half = (TW - 8) / 2;
    rect(M, y - 8, half, 34, C.tint); rect(M, y - 8, 3, 34, C.green); t('PAID AND CONFIRMED', M + 12, y + 16, { bold: true, size: 6.8, color: C.muted }); t(money(paid), M + 12, y, { serif: true, size: 13, color: C.green });
    rect(M + half + 8, y - 8, half, 34, C.tint); rect(M + half + 8, y - 8, 3, 34, d.total - paid > 0 ? C.red : C.green); t('OUTSTANDING', M + half + 20, y + 16, { bold: true, size: 6.8, color: C.muted });
    t(d.total - paid > 0 ? money(d.total - paid) : 'No outstanding fee', M + half + 20, y, { serif: true, size: 13, color: d.total - paid > 0 ? C.red : C.green }); y += 14; }
  t('Please keep your payment receipt and present it when asked. Contact the school office with any question about this schedule.', M, Math.max(M + 24, y - 56 - (d.items.some((i) => i.status) ? 40 : 0)), { size: 8, color: C.muted, max: TW });
  footer(w, ctx);
}

// ======================= NEWSLETTER =======================
export function newsletterDoc(ctx, n) {
  let page = ctx.doc.addPage([W, H]); let w = writer(page, ctx); const L = M + 6, tw = TW - 12;
  header(w, ctx, 'Newsletter', n.fields?.issue ?? '');
  let y = H - BAND - 44;
  const next = () => { footer(w, ctx); page = ctx.doc.addPage([W, H]); w = writer(page, ctx); w.rect(0, H - 10, W, 10, C.deep); w.rect(0, H - 13, W, 3, C.gold); y = H - 50; };
  const need = (h) => { if (y - h < M + 28) next(); };
  for (const line of w.wrap(n.title, 21, tw, { serif: true })) { w.t(line, L, y, { serif: true, size: 21, color: C.deep }); y -= 26; }
  w.rect(L, y + 6, 54, 3, C.gold); y -= 14;
  const para = (s, size = 10.5, o = {}) => { for (const line of w.wrap(s, size, o.width ?? tw, o)) { need(size + 6); w.t(line, o.x ?? L, y, { size, bold: o.bold, color: o.color }); y -= size + 5; } y -= 2; };
  para(n.body);
  const box = (title, text) => { const lines = w.wrap(text, 10, tw - 28); need(lines.length * 15 + 34); const h = lines.length * 15 + 26;
    w.rect(L, y - h + 10, tw, h, C.goldSoft); w.rect(L, y - h + 10, 4, h, C.gold); w.t(title.toUpperCase(), L + 14, y - 4, { bold: true, size: 6.8, color: hex('#8a5f00') });
    let yy = y - 20; for (const ln of lines) { w.t(ln, L + 14, yy, { size: 10 }); yy -= 15; } y -= h + 8; };
  if (n.fields?.important_dates) { y -= 8; box('Important dates', n.fields.important_dates); }
  if (n.fields?.contact) { need(60); const lines = w.wrap(n.fields.contact, 10, tw - 28); const h = lines.length * 15 + 26;
    w.rect(L, y - h + 10, tw, h, C.tint); w.rect(L, y - h + 10, 4, h, C.teal); w.t('CONTACT', L + 14, y - 4, { bold: true, size: 6.8, color: C.teal });
    let yy = y - 20; for (const ln of lines) { w.t(ln, L + 14, yy, { size: 10 }); yy -= 15; } y -= h + 8; }
  if (n.fields?.signed_by) { need(60); y -= 34; w.page.drawLine({ start: { x: L, y }, end: { x: L + 160, y }, thickness: 0.7, color: C.ink }); w.t(n.fields.signed_by, L, y - 13, { serif: true, size: 11 }); }
  footer(w, ctx);
}


// ======================= OUTSTANDING FEES (DEBTORS) LIST =======================
// d: { scope, session, generatedFor, groups: [{ name, className, status, items: [{ title, amount, status }] }] }
export function debtorsDoc(ctx, d) {
  let page = ctx.doc.addPage([W, H]); let w = writer(page, ctx); const L = M + 6, tw = TW - 12;
  header(w, ctx, 'Outstanding fees', d.session);
  const money = (v) => 'NGN ' + Number(v).toLocaleString('en-NG', { minimumFractionDigits: 2 });
  const grand = d.groups.reduce((a, g) => a + g.items.reduce((b, i) => b + Number(i.amount), 0), 0);
  let y = H - BAND - 40;
  w.t(d.scope, L, y, { serif: true, size: 15, color: C.deep, max: tw });
  w.t(`Prepared for: ${d.generatedFor}`, L, y - 15, { size: 8.5, color: C.muted, max: tw });
  y -= 74; const gap = 8, tw3 = (tw - 2 * gap) / 3;
  tile(w, L, y, tw3, 'STUDENTS OWING', String(d.groups.length), {}); tile(w, L + tw3 + gap, y, tw3, 'ITEMS', String(d.groups.reduce((a, g) => a + g.items.length, 0)), {});
  tile(w, L + 2 * (tw3 + gap), y, tw3, 'TOTAL OUTSTANDING', money(grand), { accent: C.red, color: C.red, size: 12.5 });
  y -= 22;
  const newPage = () => { footer(w, ctx); page = ctx.doc.addPage([W, H]); w = writer(page, ctx); w.rect(0, H - 10, W, 10, C.deep); w.rect(0, H - 13, W, 3, C.gold); y = H - 40; };
  const head = () => { w.rect(L, y - 16, tw, 16, C.deep); [['STUDENT / ITEM', L + 8], ['CLASS', L + 250], ['STATUS', L + 320], ['AMOUNT', L + tw - 8]].forEach(([h, x], i) => w.t(h, x, y - 11, { bold: true, size: 6.8, color: C.white, align: i === 3 ? 'right' : 'left' })); y -= 16; };
  head();
  if (d.groups.length === 0) w.t('No student has an outstanding fee for this selection.', L + 8, y - 18, { size: 10, color: C.muted });
  for (const g of d.groups) {
    const need = 20 + g.items.length * 14; if (y - need < M + 30) { newPage(); head(); }
    y -= 18; w.rect(L, y - 4, tw, 18, C.tint); w.rect(L, y - 4, 3, 18, C.gold);
    w.t(g.name, L + 8, y + 2, { bold: true, size: 9.5, max: 235 }); w.t(g.className, L + 250, y + 2, { size: 8.5 });
    if (g.status && g.status !== 'active') w.t(g.status, L + 320, y + 2, { size: 8, color: C.orange });
    w.t(money(g.items.reduce((a, i) => a + Number(i.amount), 0)), L + tw - 8, y + 2, { bold: true, size: 9.5, align: 'right' });
    for (const it of g.items) { y -= 14; w.t(it.title, L + 18, y + 2, { size: 8.5, max: 220 });
      w.t(it.status === 'claimed' ? 'Awaiting confirmation' : 'Unpaid', L + 320, y + 2, { size: 7.5, color: it.status === 'claimed' ? hex('#8a5f00') : C.red }); w.t(money(it.amount), L + tw - 8, y + 2, { size: 8.5, align: 'right' }); }
    y -= 4;
  }
  if (y - 40 < M + 30) newPage();
  y -= 22; w.rect(L, y - 10, tw, 28, C.deep); w.t('GRAND TOTAL OUTSTANDING', L + 12, y, { bold: true, size: 9, color: hex('#B4C3E6') }); w.t(money(grand), L + tw - 12, y - 2, { serif: true, size: 14, color: C.white, align: 'right' });
  footer(w, ctx);
}

// ======================= CONTINUOUS ASSESSMENT FORM =======================
export function caFormPages(ctx, d) {
  // 26 rows of 21pt end well above the footer line (30 ran into it)
  const perPage = 26; const rows = d.students; const pages = Math.max(1, Math.ceil(rows.length / perPage));
  for (let p = 0; p < pages; p++) {
    const page = ctx.doc.addPage([W, H]); const w = writer(page, ctx); const L = M + 6, tw = TW - 12;
    header(w, ctx, d.filled ? 'Continuous assessment form (filled)' : 'Continuous assessment form', `${d.term.academic_years.name}, Term ${d.term.number}`);
    let y = H - BAND - 56; const gap = 8, t3 = (tw - 2 * gap) / 3;
    tile(w, L, y, t3, 'CLASS', d.className, {}); tile(w, L + t3 + gap, y, t3, 'SUBJECT', d.subject, { size: 12 }); tile(w, L + 2 * (t3 + gap), y, t3, 'STUDENTS', String(rows.length), {});
    y -= 20; const cols = [L + 8, L + 40, L + 290, L + 345, L + 400, L + 455];
    w.rect(L, y - 16, tw, 16, C.deep); ['S/N', 'NAME', '1ST CA (15)', '2ND CA (15)', 'EXAM (70)', 'TOTAL (100)'].forEach((h, i) => w.t(h, cols[i], y - 11, { bold: true, size: 6.8, color: C.white })); y -= 16;
    rows.slice(p * perPage, (p + 1) * perPage).forEach((s, i) => { y -= 21; w.rect(L, y, tw, 21, i % 2 ? C.white : C.soft, { borderColor: C.line, borderWidth: 0.5 });
      w.t(String(p * perPage + i + 1), cols[0], y + 7, { size: 8.5 }); w.t(s, cols[1], y + 7, { size: 9, max: 240 });
      const v = d.values?.[p * perPage + i]; if (v) [v.ca1, v.ca2, v.exam, v.total].forEach((n, k) => { if (n != null) w.t(String(Number(n)), cols[2 + k] + 6, y + 7, { size: 9, bold: k === 3 }); });
      [cols[2], cols[3], cols[4], cols[5]].forEach((x) => w.page.drawLine({ start: { x: x - 6, y }, end: { x: x - 6, y: y + 21 }, thickness: 0.4, color: C.line })); });
    footer(w, ctx, `Page ${p + 1} of ${pages}`);
  }
}


// ======================= RECEIPT (A4, two designs) =======================
// data = result of receipt_data(). Basic section: bright and rounded-feeling; Secondary: formal, navy, ruled.
export function receiptDoc(ctx, data) {
  const basic = data.student.section === 'basic';
  const money = (v) => 'NGN ' + Number(v).toLocaleString('en-NG', { minimumFractionDigits: 2 });
  const sun = hex('#FFB703'), sunSoft = hex('#FFE8A3'), cream = hex('#FFFDF5'), navy = C.deep;
  const kindTitle = { payment: 'Payment receipt', item: 'Receipt for item paid', term: 'Term fees receipt: fully paid' }[data.kind];
  const items = data.items ?? [];
  const FIRST = 15, NEXT = 30;                       // rows per page; the totals and signatures always fit under the last row
  const chunks = []; let i = 0; chunks.push(items.slice(0, FIRST)); i = FIRST; while (i < items.length) { chunks.push(items.slice(i, i + NEXT)); i += NEXT; }
  chunks.forEach((rows, pi) => {
    const page = ctx.doc.addPage([W, H]); const w = writer(page, ctx); const { t, rect } = w; const last = pi === chunks.length - 1;
    // frame
    if (basic) { rect(0, 0, W, H, cream); rect(14, 14, W - 28, H - 28, undefined, { borderColor: sun, borderWidth: 7 }); }
    else { rect(16, 16, W - 32, H - 32, undefined, { borderColor: navy, borderWidth: 2.4 }); rect(23, 23, W - 46, H - 46, undefined, { borderColor: navy, borderWidth: 0.6 }); }
    let y;
    if (pi === 0) {
      if (basic) {
        rect(21, H - 150, W - 42, 129, sun);
        rect(M + 4, H - 126, 72, 72, C.white); if (ctx.logo) page.drawImage(ctx.logo, { x: M + 8, y: H - 122, width: 64, height: 64 });
        t(ctx.S.school_name ?? 'Baptist Academy', M + 92, H - 78, { serif: true, size: 21, color: hex('#3a2600'), max: 330 });
        t(ctx.S.address ?? '', M + 92, H - 96, { size: 8.5, color: hex('#5a3b00'), max: 330 });
        rect(W - M - 100, H - 112, 92, 40, C.white, { borderColor: C.green, borderWidth: 3 }); t('PAID', W - M - 54, H - 100, { bold: true, size: 20, color: C.green, align: 'center' });
        t(kindTitle.toUpperCase(), M + 4, H - 178, { bold: true, size: 12, color: hex('#C2410C') });
      } else {
        if (ctx.logo) page.drawImage(ctx.logo, { x: (W - 56) / 2, y: H - 92, width: 56, height: 56 });
        t((ctx.S.school_name ?? 'Baptist Academy').toUpperCase(), W / 2, H - 112, { serif: true, size: 17, color: navy, align: 'center', max: 480 });
        t(ctx.S.address ?? '', W / 2, H - 126, { size: 8.5, color: C.muted, align: 'center', max: 480 });
        rect(M, H - 140, TW, 1.4, navy); rect(M, H - 143.5, TW, 0.5, navy);
        rect(M, H - 176, TW, 24, undefined, { borderColor: navy, borderWidth: 0.6 }); t(kindTitle.toUpperCase(), W / 2, H - 168, { bold: true, size: 11, color: navy, align: 'center' });
      }
      const cell = (label, value, x, yy, max = 230) => { t(label.toUpperCase(), x, yy + 11, { size: 6.8, color: C.muted }); t(value ?? '', x, yy, { bold: true, size: 10, max }); };
      const L = M + 4, R = M + 290; const base = H - 208;
      cell('Receipt no.', data.receipt_no, L, base); cell('Date', fmtDate(data.issued_at), R, base);
      cell('Received for', data.student.name, L, base - 32); cell('Class', data.student.class + (data.student.admission_no ? ' | Adm. ' + data.student.admission_no : ''), R, base - 32);
      if (data.term) cell('Session / term', `${data.term.year}, Term ${data.term.number}`, L, base - 64);
      if (data.reference) cell('Teller reference', data.reference, R, base - 64); else if (data.parent_name) cell('Paid by', data.parent_name, R, base - 64);
      y = H - 300;
    } else {
      t(`${kindTitle}  |  ${data.receipt_no}  |  ${data.student.name}  (continued)`, M + 4, H - 50, { bold: true, size: 9, color: basic ? hex('#C2410C') : navy, max: TW - 8 });
      y = H - 72;
    }
    // table
    const hdr = basic ? sunSoft : navy, hdrCol = basic ? hex('#3a2600') : C.white;
    rect(M, y - 18, TW, 18, hdr); t('ITEM', M + 10, y - 12, { bold: true, size: 7.5, color: hdrCol });
    if (data.kind === 'payment') t('TERM', M + 350, y - 12, { bold: true, size: 7.5, color: hdrCol });
    t('AMOUNT', W - M - 10, y - 12, { bold: true, size: 7.5, color: hdrCol, align: 'right' });
    y -= 18;
    rows.forEach((r, k) => { y -= 18; if (k % 2 === 1) rect(M, y, TW, 18, basic ? hex('#FFF6D6') : C.soft);
      t(r.title + (r.kind === 'brought_forward' ? ' (owed from before)' : ''), M + 10, y + 5, { size: 9.5, max: 330 });
      if (data.kind === 'payment') t(`${r.year}, T${r.term}`, M + 350, y + 5, { size: 8.5, color: C.muted, max: 110 });
      t(money(r.amount), W - M - 10, y + 5, { size: 9.5, align: 'right' }); });
    rect(M, y - 1, TW, 0.8, basic ? sun : navy);
    if (last) {
      y -= 12; rect(M, y - 30, TW, 30, basic ? hex('#E6F6EC') : undefined, basic ? {} : { borderColor: navy, borderWidth: 1 });
      t('TOTAL RECEIVED', M + 12, y - 20, { bold: true, size: 9, color: basic ? hex('#14532d') : navy }); t(money(data.total), W - M - 12, y - 21, { serif: true, size: 15, align: 'right', color: basic ? hex('#14532d') : navy });
      if (data.kind === 'term') t('All fees for this term, and any balance brought forward, have been paid and confirmed.', M + 4, y - 48, { size: 8.5, color: C.muted, max: TW - 8 });
      const sy = Math.max(M + 78, y - 100);
      page.drawLine({ start: { x: M + 4, y: sy }, end: { x: M + 214, y: sy }, thickness: 0.8, color: C.ink }); page.drawLine({ start: { x: W - M - 214, y: sy }, end: { x: W - M - 4, y: sy }, thickness: 0.8, color: C.ink });
      t(data.confirmed_by ? `Confirmed by ${data.confirmed_by}` : 'Bursar', M + 4, sy - 11, { size: 8.5, max: 210 }); t('Bursar', M + 4, sy - 22, { size: 7, color: C.muted });
      t('School stamp', W - M - 4, sy - 11, { size: 8.5, align: 'right' });
    }
    footer(w, ctx, `Valid only for payments confirmed by the bursar  |  Page ${pi + 1} of ${chunks.length}`);
  });
}

// ======================= STUDENT FINANCIAL RECORD (A4, all terms shown) =======================
// d = { student:{name,admission_no,class,section}, groups:[{label, cleared, total, lines:[{title,amount,status,ref}]}], paid, owing, filter }
export function recordDoc(ctx, d) {
  const money = (v) => 'NGN ' + Number(v).toLocaleString('en-NG', { minimumFractionDigits: 2 });
  let page = ctx.doc.addPage([W, H]); let w = writer(page, ctx); let { t, rect } = w;
  header(w, ctx, 'Financial record', d.filter || 'All sessions');
  let y = H - BAND - 38; let pageNo = 1;
  t(d.student.name, M, y, { serif: true, size: 17, max: 420 });
  t(`${d.student.class}   |   ${d.student.section === 'secondary' ? 'Secondary' : 'Basic'} section${d.student.admission_no ? '   |   Adm. ' + d.student.admission_no : ''}`, M, y - 16, { size: 9, color: C.muted });
  y -= 44;
  const next = () => { footer(w, ctx, `${d.student.name}  |  Page ${pageNo}`); pageNo++; page = ctx.doc.addPage([W, H]); w = writer(page, ctx); ({ t, rect } = w); rect(0, H - 10, W, 10, C.deep); rect(0, H - 13, W, 3, C.gold); y = H - 40; };
  const ST = { pending: ['UNPAID', C.red], claimed: ['AWAITING', C.gold], confirmed: ['PAID', C.green] };
  if (d.groups.length === 0) t('No fee lines were found for this selection.', M, y, { size: 10, color: C.muted });
  for (const g of d.groups) {
    if (y < M + 90) next();
    rect(M, y - 20, TW, 22, C.tint); rect(M, y - 20, 4, 22, C.teal);
    t(g.label + (g.cleared ? '  (cleared)' : ''), M + 14, y - 13, { bold: true, size: 10 }); t(money(g.total), W - M - 10, y - 13, { bold: true, size: 9.5, align: 'right' });
    y -= 22;
    g.lines.forEach((l, k) => {
      if (y < M + 70) next();
      y -= 18; if (k % 2 === 0) rect(M, y - 4, TW, 18, C.soft);
      t(l.title + (l.ref ? `  (ref ${l.ref})` : ''), M + 14, y + 2, { size: 9, max: 290 });
      const [lab, col] = ST[l.status] ?? ['', C.muted]; rect(W - M - 170, y - 1, 52, 12, col); t(lab, W - M - 144, y + 2, { bold: true, size: 6.5, color: l.status === 'claimed' ? hex('#3a2600') : C.white, align: 'center' });
      t(money(l.amount), W - M - 10, y + 2, { size: 9, align: 'right' });
    });
    y -= 12;
  }
  if (y < M + 100) next();
  y -= 4; const half = (TW - 8) / 2;
  rect(M, y - 34, half, 38, C.tint); rect(M, y - 34, 3, 38, C.green); t('PAID AND CONFIRMED', M + 12, y - 8, { bold: true, size: 6.8, color: C.muted }); t(money(d.paid), M + 12, y - 26, { serif: true, size: 13, color: C.green });
  rect(M + half + 8, y - 34, half, 38, C.tint); rect(M + half + 8, y - 34, 3, 38, d.owing > 0 ? C.red : C.green); t('OUTSTANDING', M + half + 20, y - 8, { bold: true, size: 6.8, color: C.muted });
  t(d.owing > 0 ? money(d.owing) : 'No outstanding fee', M + half + 20, y - 26, { serif: true, size: 13, color: d.owing > 0 ? C.red : C.green });
  footer(w, ctx, `${d.student.name}  |  Page ${pageNo}`);
}
