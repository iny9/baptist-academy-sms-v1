// Pure functions behind the dashboard (no React, no database): easy to test with `node tests/check_dashboard_logic.mjs`.
// Row shapes come from supabase/migrations/002_dashboard_overview.sql: dash_students, dash_subject_leaders, dash_pass_counts.

export const SECTION_LABEL = { basic: 'Basic', secondary: 'Secondary' };
export const SUB_LABEL = { nursery: 'Nursery', primary: 'Primary', junior: 'Junior secondary', senior: 'Senior secondary' };
export const TERM_LABEL = { 0: 'Whole session', 1: 'First term', 2: 'Second term', 3: 'Third term' };
export const EMPTY_FILTER = { term: 0, section: '', sub: '', cls: '' };

export const num = (v) => Number(v) || 0;
export const one = (v) => num(v).toFixed(1);
export const ordinal = (n) => { const v = n % 100, s = ['th', 'st', 'nd', 'rd']; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
export const byName = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
export const initials = (name) => String(name ?? '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

// Anything with section / sub_section / class_id is "in scope" when it matches every filter that is set
export const inScope = (r, f) => (!f.section || r.section === f.section) && (!f.sub || r.sub_section === f.sub) && (!f.cls || r.class_id === f.cls);

// Section -> sub-section -> class: each list only offers what the one above leaves
export function scopeOptions(rows, f) {
  const sections = [...new Set(rows.map((r) => r.section))].sort();
  const inSec = rows.filter((r) => !f.section || r.section === f.section);
  const subs = [...new Set(inSec.map((r) => r.sub_section))].sort();
  const inSub = inSec.filter((r) => !f.sub || r.sub_section === f.sub);
  const classes = [...new Map(inSub.map((r) => [r.class_id, r.class_name]))].map(([id, name]) => ({ id, name })).sort((a, b) => byName(a.name, b.name));
  return { sections, subs, classes };
}

// Changing a parent filter clears a child filter that no longer exists under it
export function fixFilter(f, rows) {
  const o = scopeOptions(rows, { ...f, sub: '', cls: '' });
  const sub = f.sub && o.subs.includes(f.sub) ? f.sub : '';
  const o2 = scopeOptions(rows, { ...f, sub, cls: '' });
  const cls = f.cls && o2.classes.some((c) => c.id === f.cls) ? f.cls : '';
  return { ...f, sub, cls };
}

// ---------- Top students ----------
// ONE ranking rule for the dashboard (and, in the database, for report-card positions):
//   1st criterion: the highest CUMULATIVE AVERAGE for the selected session and term (the mean of the term averages from Term 1 up to the chosen term;
//                  on the whole-session row it is the session average). `cum_average` comes from dash_students(); older rows fall back to `average`.
//   2nd criterion: the MERIT SCORE (sum of grade points A=5 ... F=0 over every subject; a term row = that term, the session row = all terms).
//   then: the average of that term, the total score, the name.
// `tie` says how close a neighbour is: 'average' = level on cumulative average, separated by merit; 'both' = level on both (a true tie).
export const cumOf = (r) => num(r.cum_average ?? r.average);
export const byRank = (a, b) => cumOf(b) - cumOf(a) || num(b.merit) - num(a.merit) || num(b.average) - num(a.average) || num(b.total) - num(a.total) || byName(a.student_name, b.student_name);
export function topThree(students, f, count = 3) {
  const t = num(f.term);
  const rows = students.filter((r) => num(r.term_no) === t && inScope(r, f)).sort(byRank);
  const same = (x, y) => x && y && cumOf(x) === cumOf(y);
  const both = (x, y) => same(x, y) && num(x.merit) === num(y.merit);
  return rows.slice(0, count).map((r, i) => {
    const prev = rows[i - 1], next = rows[i + 1];
    const tie = both(prev, r) || both(r, next) ? 'both' : same(prev, r) || same(r, next) ? 'average' : '';
    return { ...r, rank: i + 1, tie, tied: !!tie };
  });
}

// ---------- Subject champions ----------
// leaders hold the best student of every class in every subject; the best of the chosen classes is the best of those bests.
export function champions(leaders, f, subjectId = '') {
  const t = num(f.term), best = new Map();
  for (const r of leaders) {
    if (num(r.term_no) !== t || !inScope(r, f) || (subjectId && r.subject_id !== subjectId)) continue;
    const cur = best.get(r.subject_id);
    const avg = num(r.average);
    if (!cur || avg > cur.avg) best.set(r.subject_id, { row: r, avg, sharing: num(r.tied) || 1 });
    else if (avg === cur.avg) cur.sharing += num(r.tied) || 1;
  }
  return [...best.values()].map(({ row, sharing }) => ({ ...row, sharing })).sort((a, b) => byName(a.subject_name, b.subject_name));
}
export const subjectList = (leaders) => [...new Map(leaders.map((r) => [r.subject_id, r.subject_name]))].map(([id, name]) => ({ id, name })).sort((a, b) => byName(a.name, b.name));

// ---------- Promoted / repeat ----------
// d = { gender, subject, by }. The donut follows the term in the filter bar (0 = whole session, the real promotion decision) as well as section, sub-section and class.
// Without a subject: a student is "promoted" when the average of that term / session reaches the target (status from the database).
// With a subject: a student counts as "at or above target" when the score in THAT subject for that term / session reaches the target.
export const BY_OPTIONS = [['class', 'Class'], ['section', 'Section'], ['sub', 'Sub-section'], ['gender', 'Gender'], ['subject', 'Subject']];

export function promotionView(students, pass, f, d) {
  const t = num(f.term);
  const classInfo = new Map(); for (const r of students) if (!classInfo.has(r.class_id)) classInfo.set(r.class_id, r);
  const scoped = (c) => inScope(c, f) && (!d.gender || c.gender === d.gender);
  // one cell per class, gender (and subject)
  const studentCells = new Map();
  for (const r of students) {
    if (num(r.term_no) !== t || !scoped(r)) continue;
    const k = r.class_id + '|' + r.gender;
    const c = studentCells.get(k) ?? { ...pick(r), gender: r.gender, subject_id: '', subject_name: '', a: 0, b: 0 };
    if (r.status === 'Promoted') c.a += 1; else c.b += 1;
    studentCells.set(k, c);
  }
  const subjectCells = [];
  for (const p of pass) {
    if (num(p.term_no) !== t) continue;
    const ci = classInfo.get(p.class_id); if (!ci) continue;
    const c = { ...pick(ci), gender: p.gender, subject_id: p.subject_id, subject_name: p.subject_name, a: num(p.passed), b: num(p.below) };
    if (scoped(c) && (!d.subject || c.subject_id === d.subject)) subjectCells.push(c);
  }
  const forTotal = d.subject ? subjectCells : [...studentCells.values()];
  const a = forTotal.reduce((s, c) => s + c.a, 0), b = forTotal.reduce((s, c) => s + c.b, 0);
  const forGroups = d.subject || d.by === 'subject' ? subjectCells : [...studentCells.values()];
  const key = { class: (c) => [c.class_id, c.class_name], section: (c) => [c.section, SECTION_LABEL[c.section] ?? c.section], sub: (c) => [c.sub_section, SUB_LABEL[c.sub_section] ?? c.sub_section],
    gender: (c) => [c.gender, c.gender], subject: (c) => [c.subject_id, c.subject_name] }[d.by] ?? ((c) => [c.class_id, c.class_name]);
  const g = new Map();
  for (const c of forGroups) { const [id, label] = key(c); const x = g.get(id) ?? { id, label, a: 0, b: 0 }; x.a += c.a; x.b += c.b; g.set(id, x); }
  const groups = [...g.values()].map((x) => ({ ...x, total: x.a + x.b, pct: x.a + x.b ? (x.a / (x.a + x.b)) * 100 : 0 })).sort((p, q) => byName(p.label, q.label));
  const partial = t === 0 ? students.filter((r) => num(r.term_no) === 0 && scoped(r) && num(r.terms_counted) < 3).length : 0;
  return { a, b, total: a + b, pct: a + b ? (a / (a + b)) * 100 : 0, groups, partial, mode: d.subject ? 'subject' : 'overall' };
}
const pick = (r) => ({ class_id: r.class_id, class_name: r.class_name, section: r.section, sub_section: r.sub_section });

// ================= Class level =================

// student_id -> who they are (name, gender, class, section, sub-section), from any dash_students row
export const studentMap = (students) => { const m = new Map(); for (const r of students) if (!m.has(r.student_id)) m.set(r.student_id, r); return m; };
// One hue per subject, spread by the golden angle so neighbours in the list look different. `index` comes from the whole subject list, so a colour never moves.
export const subjectHue = (index) => (index * 137.508 + 18) % 360;

// ---------- Scatter ----------
// scores = { subjects:[{id,name}], students:[id], rows:[[studentNo, subjectNo, total]] } from dash_scores.
// x = students ranked by their mean score (best on the left), y = the score, one colour per subject.
// local = { gender, subject, student }. The student is only highlighted, never removed, so you can see where they sit.
export function scatterView(scores, meta, f, local = {}) {
  if (!scores) return { points: [], students: [], n: 0, subjects: [] };
  const ok = scores.students.map((id) => { const m = meta.get(id); return !!m && inScope(m, f) && (!local.gender || m.gender === local.gender); });
  const subjIx = local.subject ? scores.subjects.findIndex((s) => s.id === local.subject) : -1;
  const sum = new Map(), cnt = new Map(), rows = [];
  for (const r of scores.rows) {
    const [si, ji, v] = r;
    if (!ok[si] || (local.subject && ji !== subjIx)) continue;
    rows.push(r); sum.set(si, (sum.get(si) ?? 0) + Number(v)); cnt.set(si, (cnt.get(si) ?? 0) + 1);
  }
  const order = [...sum.keys()].map((si) => ({ si, id: scores.students[si], mean: sum.get(si) / cnt.get(si) }))
    .sort((a, b) => b.mean - a.mean || byName(meta.get(a.id).student_name, meta.get(b.id).student_name));
  const x = new Map(order.map((o, i) => [o.si, i]));
  const points = rows.map(([si, ji, v]) => ({ x: x.get(si), y: Number(v), ji, sid: scores.students[si] }));
  const students = order.map((o) => { const m = meta.get(o.id); return { id: o.id, name: m.student_name, cls: m.class_name, gender: m.gender, mean: o.mean }; });
  return { points, students, n: students.length, subjects: scores.subjects };
}

// ---------- Histogram ----------
// Distribution of the students' averages (the term chosen in the filter bar, or the whole session). Bins are [lo, hi); the last one includes 100.
export function histogram(students, f, width = 10, target = 0) {
  const t = num(f.term), rows = students.filter((r) => num(r.term_no) === t && inScope(r, f));
  const nb = Math.ceil(100 / width), bins = Array.from({ length: nb }, (_, i) => ({ lo: i * width, hi: Math.min(100, (i + 1) * width), count: 0, students: [] }));
  for (const r of rows) { const a = Math.min(100, Math.max(0, num(r.average))); bins[Math.min(nb - 1, Math.floor(a / width))].students.push(r); }
  for (const b of bins) { b.students.sort((p, q) => num(q.average) - num(p.average) || byName(p.student_name, q.student_name)); b.count = b.students.length; }
  const vals = rows.map((r) => num(r.average)).sort((a, b) => a - b), n = vals.length;
  const mean = n ? vals.reduce((s, v) => s + v, 0) / n : 0, median = n ? (n % 2 ? vals[(n - 1) / 2] : (vals[n / 2 - 1] + vals[n / 2]) / 2) : 0;
  return { bins, n, mean, median, above: vals.filter((v) => v >= target).length, max: Math.max(1, ...bins.map((b) => b.count)) };
}

// ================= Student level =================

// ---------- Heatmap ----------
// sets = { [termNo]: dash_scores answer }. opts = { mode: 'subjects' | 'terms', subject, sort: 'mean' | 'name' | 'class' }.
//  'subjects': columns are subjects, cells are the totals for the filter bar's term (whole session = average per subject).
// opts.only (a Set of student ids) keeps just those students: the dashboard passes the top ten by merit score.
//  'terms'   : columns are Term 1-3 (and the session average), cells are the chosen subject's total, or the student's mean over all subjects.
export function heatmapView(sets, meta, f, opts = {}) {
  const mode = opts.mode ?? 'subjects', sort = opts.sort ?? 'mean';
  const termKeys = mode === 'terms' ? [1, 2, 3, 0].filter((t) => sets[t]) : [num(f.term)];
  const cols = [], acc = new Map(); // student id -> array per column of {sum,n}
  const ensure = (id) => { let a = acc.get(id); if (!a) { a = []; acc.set(id, a); } return a; };
  const inView = (id) => { const m = meta.get(id); return !!m && inScope(m, f) && (!opts.only || opts.only.has(id)); };
  if (mode === 'subjects') {
    const d = sets[termKeys[0]]; if (!d) return { cols: [], rows: [], mode };
    const ix = d.subjects.map((s, i) => ({ ...s, i })).filter((s) => !opts.subject || s.id === opts.subject);
    const colOf = new Map(ix.map((s, c) => [s.i, c]));
    for (const s of ix) cols.push({ key: s.id, label: s.name });
    for (const [si, ji, v] of d.rows) { const c = colOf.get(ji), id = d.students[si]; if (c === undefined || !inView(id)) continue; const a = ensure(id); a[c] = { sum: Number(v), n: 1 }; }
  } else {
    termKeys.forEach((t, c) => {
      cols.push({ key: 't' + t, label: t === 0 ? 'Session' : 'Term ' + t });
      const d = sets[t]; const sj = opts.subject ? d.subjects.findIndex((s) => s.id === opts.subject) : -1;
      if (opts.subject && sj < 0) return;
      for (const [si, ji, v] of d.rows) { const id = d.students[si]; if ((opts.subject && ji !== sj) || !inView(id)) continue; const a = ensure(id); const x = a[c] ?? (a[c] = { sum: 0, n: 0 }); x.sum += Number(v); x.n += 1; }
    });
  }
  const rows = [...acc.entries()].map(([id, a]) => {
    const m = meta.get(id), cells = cols.map((_, c) => (a[c] && a[c].n ? a[c].sum / a[c].n : null)), got = cells.filter((v) => v !== null);
    return { id, name: m.student_name, cls: m.class_name, gender: m.gender, cells, mean: got.length ? got.reduce((s, v) => s + v, 0) / got.length : 0 };
  }).sort(sort === 'name' ? (p, q) => byName(p.name, q.name) : sort === 'class' ? (p, q) => byName(p.cls, q.cls) || q.mean - p.mean || byName(p.name, q.name) : (p, q) => q.mean - p.mean || byName(p.name, q.name));
  return { cols, rows, mode };
}
// Low scores warm, high scores green. t in 0..100.
export const heatHue = (v) => 4 + 138 * Math.pow(Math.min(100, Math.max(0, v)) / 100, 1.15);

// ---------- Radar (psychomotor and affective ratings) ----------
// dom = { traits:[{id,domain,name}], students:[id], rows:[[studentNo, traitNo, rating 1-5]] } from dash_domains.
// For each domain: the followed student, their class average, and the average of everyone in the current selection.
export function domainView(dom, meta, f, studentId) {
  const out = { psychomotor: null, affective: null, classLabel: '', n: 0 };
  if (!dom) return out;
  const who = studentId ? meta.get(studentId) : null; out.classLabel = who?.class_name ?? '';
  const sIx = new Map(dom.students.map((id, i) => [i, id]));
  const sums = (pred) => { const m = new Map(); for (const [si, ti, v] of dom.rows) { const id = sIx.get(si), mm = meta.get(id); if (!mm || !pred(id, mm)) continue; const c = m.get(ti) ?? { s: 0, n: 0 }; c.s += Number(v); c.n += 1; m.set(ti, c); } return m; };
  const mine = sums((id) => id === studentId), cls = who ? sums((id, mm) => mm.class_id === who.class_id) : new Map(), scope = sums((id, mm) => inScope(mm, f));
  const val = (m, ti) => { const c = m.get(ti); return c ? c.s / c.n : null; };
  dom.traits.forEach((t, ti) => {
    const d = out[t.domain] ?? (out[t.domain] = { axes: [], student: [], cls: [], scope: [] });
    d.axes.push(t.name); d.student.push(val(mine, ti)); d.cls.push(val(cls, ti)); d.scope.push(val(scope, ti));
  });
  out.n = new Set(dom.rows.map((r) => r[0])).size;
  return out;
}
