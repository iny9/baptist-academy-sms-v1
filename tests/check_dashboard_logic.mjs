// Offline test of the dashboard maths (no database needed).   Run: node tests/check_dashboard_logic.mjs
import { topThree, champions, promotionView, scopeOptions, fixFilter, ordinal, EMPTY_FILTER, studentMap, scatterView, histogram, subjectHue, heatmapView, heatHue, domainView } from '../lib/dash-logic.js';
let bad = 0;
const eq = (got, want, msg) => { if (JSON.stringify(got) !== JSON.stringify(want)) { bad++; console.log(`!! ${msg}\n   got  ${JSON.stringify(got)}\n   want ${JSON.stringify(want)}`); } };

const mk = (id, name, g, cls, cid, sec, sub, t, avg, merit, total, pos, status) => ({ student_id: id, student_name: name, gender: g, class_name: cls, class_id: cid, section: sec, sub_section: sub,
  term_no: t, average: avg, merit, total, class_pos: pos, class_size: 3, terms_counted: t === 0 ? 3 : 1, status });
const S = [
  mk('a', 'Ada One', 'Female', 'JSS 1', 'c1', 'secondary', 'junior', 1, 90, 50, 900, 1), mk('b', 'Bayo Two', 'Male', 'JSS 1', 'c1', 'secondary', 'junior', 1, 80, 45, 800, 2),
  mk('c', 'Chi Three', 'Female', 'JSS 1', 'c1', 'secondary', 'junior', 1, 40, 20, 400, 3),
  mk('d', 'Dan Four', 'Male', 'SSS 1', 'c2', 'secondary', 'senior', 1, 90, 55, 950, 1), mk('e', 'Eze Five', 'Male', 'Nursery 1', 'c3', 'basic', 'nursery', 1, 70, 30, 700, 1),
  mk('a', 'Ada One', 'Female', 'JSS 1', 'c1', 'secondary', 'junior', 0, 88, 150, 2700, 1, 'Promoted'), mk('b', 'Bayo Two', 'Male', 'JSS 1', 'c1', 'secondary', 'junior', 0, 78, 140, 2400, 2, 'Promoted'),
  mk('c', 'Chi Three', 'Female', 'JSS 1', 'c1', 'secondary', 'junior', 0, 38, 60, 1200, 3, 'Repeat'), mk('d', 'Dan Four', 'Male', 'SSS 1', 'c2', 'secondary', 'senior', 0, 60, 120, 2800, 1, 'Promoted'),
  mk('e', 'Eze Five', 'Male', 'Nursery 1', 'c3', 'basic', 'nursery', 0, 45, 90, 2100, 1, 'Repeat'),
];
const f = (o = {}) => ({ ...EMPTY_FILTER, ...o });

// top three: highest CUMULATIVE AVERAGE first, merit score second.
// Term 1: Dan and Ada are level on 90; merit (55 against 50) puts Dan first. Bayo (80) is third.
const t = topThree(S, f({ term: 1 }));
eq(t.map((x) => x.student_id), ['d', 'a', 'b'], 'top three order (cumulative average, then merit)');
eq(t.map((x) => x.tie), ['average', 'average', ''], 'Dan and Ada are level on the average and separated by merit');
eq(topThree(S, f({ term: 1, section: 'basic' })).map((x) => x.student_id), ['e'], 'section filter leaves one student');
eq(topThree(S, f({ term: 1, section: 'secondary', sub: 'junior' })).map((x) => x.student_id), ['a', 'b', 'c'], 'sub-section filter');
eq(topThree(S, f({ term: 1, cls: 'c1' })).map((x) => x.student_id), ['a', 'b', 'c'], 'class filter');
eq(topThree(S, f({ term: 0 }))[0].student_id, 'a', 'whole session uses term 0 rows (average 88 beats 78 and 60)');
eq(topThree(S, f({ term: 2 })), [], 'a term with no rows gives no cards');
// a higher average beats more merit; a tie on the average is broken by merit, then the term average
const M = [mk('p', 'Pat', 'Male', 'JSS 2', 'c9', 'secondary', 'junior', 1, 95, 40, 900, 1), mk('q', 'Quin', 'Female', 'JSS 2', 'c9', 'secondary', 'junior', 1, 70, 55, 700, 2),
  mk('r', 'Ruth', 'Female', 'JSS 2', 'c9', 'secondary', 'junior', 1, 72, 55, 720, 3), mk('s', 'Sam', 'Male', 'JSS 2', 'c9', 'secondary', 'junior', 1, 72, 55, 720, 3)];
const mt = topThree(M, f({ term: 1 }), 4);
eq(mt.map((x) => x.student_id), ['p', 'r', 's', 'q'], 'average first: Pat has the best average although the least merit; Ruth and Sam tie on both, Quin has the lowest average');
eq(mt.map((x) => x.tie), ['', 'both', 'both', ''], 'tie flags: level on average and merit');
eq(topThree(M, f({ term: 1 }), 2).map((x) => x.student_id), ['p', 'r'], 'count limits the list (top four bars and top ten heatmap use this)');
// cumulative average: Term 2 rows carry the mean of Terms 1 and 2 and that, not the Term 2 average, decides
const C = [{ ...mk('u', 'Uzo', 'Male', 'JSS 3', 'c8', 'secondary', 'junior', 2, 60, 30, 600, 1), cum_average: 80 }, { ...mk('v', 'Vera', 'Female', 'JSS 3', 'c8', 'secondary', 'junior', 2, 75, 30, 750, 2), cum_average: 70 }];
eq(topThree(C, f({ term: 2 })).map((x) => x.student_id), ['u', 'v'], 'cumulative average decides, not the single-term average');
// merit decides only between equal cumulative averages
const E = [{ ...mk('w', 'Wale', 'Male', 'JSS 3', 'c8', 'secondary', 'junior', 2, 60, 20, 600, 1), cum_average: 70 }, { ...mk('x', 'Xena', 'Female', 'JSS 3', 'c8', 'secondary', 'junior', 2, 70, 35, 700, 2), cum_average: 70 }];
eq(topThree(E, f({ term: 2 })).map((x) => x.student_id), ['x', 'w'], 'equal cumulative average: merit score is the second criterion');

// champions
const L = [
  { class_id: 'c1', class_name: 'JSS 1', section: 'secondary', sub_section: 'junior', subject_id: 'm', subject_name: 'Maths', term_no: 1, student_id: 'a', student_name: 'Ada One', average: 95, tied: 1 },
  { class_id: 'c2', class_name: 'SSS 1', section: 'secondary', sub_section: 'senior', subject_id: 'm', subject_name: 'Maths', term_no: 1, student_id: 'd', student_name: 'Dan Four', average: 97, tied: 2 },
  { class_id: 'c2', class_name: 'SSS 1', section: 'secondary', sub_section: 'senior', subject_id: 'e', subject_name: 'English', term_no: 1, student_id: 'd', student_name: 'Dan Four', average: 70, tied: 1 },
];
eq(champions(L, f({ term: 1 })).map((x) => [x.subject_name, x.student_id, x.sharing]), [['English', 'd', 1], ['Maths', 'd', 2]], 'best of the class bests, sharing counted');
eq(champions(L, f({ term: 1, cls: 'c1' })).map((x) => x.student_id), ['a'], 'champion within one class');
eq(champions(L, f({ term: 1 }), 'e').length, 1, 'subject filter');
eq(champions(L, f({ term: 0 })), [], 'no session rows -> nothing');

// promotion donut
const P = [{ class_id: 'c1', gender: 'Female', subject_id: 'm', subject_name: 'Maths', term_no: 0, passed: 1, below: 1 }, { class_id: 'c1', gender: 'Male', subject_id: 'm', subject_name: 'Maths', term_no: 0, passed: 1, below: 0 },
  { class_id: 'c2', gender: 'Male', subject_id: 'm', subject_name: 'Maths', term_no: 0, passed: 0, below: 1 },
  { class_id: 'c1', gender: 'Female', subject_id: 'm', subject_name: 'Maths', term_no: 1, passed: 2, below: 0 }];
let p = promotionView(S, P, f(), { gender: '', subject: '', by: 'class' });
eq([p.a, p.b, p.total], [3, 2, 5], 'overall promoted/repeat');
eq(p.groups.map((g) => [g.label, g.a, g.b]), [['JSS 1', 2, 1], ['Nursery 1', 0, 1], ['SSS 1', 1, 0]], 'breakdown by class');
p = promotionView(S, P, f({ section: 'secondary' }), { gender: 'Female', subject: '', by: 'gender' });
eq([p.a, p.b], [1, 1], 'section + gender filters');
p = promotionView(S, P, f(), { gender: '', subject: 'm', by: 'class' });
eq([p.a, p.b, p.mode], [2, 2, 'subject'], 'subject mode counts the subject table');
p = promotionView(S, P, f(), { gender: '', subject: '', by: 'subject' });
eq([p.a, p.b, p.groups.map((g) => g.label)], [3, 2, ['Maths']], 'by subject keeps the overall donut but lists subjects');
p = promotionView(S, P, f(), { gender: '', subject: '', by: 'sub' });
eq(p.groups.map((g) => g.label), ['Junior secondary', 'Nursery', 'Senior secondary'], 'by sub-section labels');
eq(promotionView(S, P, f(), { gender: '', subject: '', by: 'class' }).partial, 0, 'all three terms counted -> no provisional note');

// donut follows the term slicer: term 1 rows carry their own Promoted / Repeat status, split by gender
const T1 = S.map((r) => (r.term_no === 1 ? { ...r, status: r.average >= 50 ? 'Promoted' : 'Repeat' } : r));
p = promotionView(T1, P, f({ term: 1 }), { gender: '', subject: '', by: 'gender' });
eq([p.a, p.b, p.total, p.partial], [4, 1, 5, 0], 'donut: term 1 slicer uses the term 1 rows (no provisional note for a term)');
eq(p.groups.map((g) => [g.label, g.a, g.b]), [['Female', 1, 1], ['Male', 3, 0]], 'donut: drilled down by gender');
p = promotionView(T1, P, f({ term: 1, cls: 'c1' }), { gender: 'Female', subject: '', by: 'gender' });
eq([p.a, p.b], [1, 1], 'donut: term + class + gender slicers together');
p = promotionView(T1, P, f({ term: 1 }), { gender: '', subject: 'm', by: 'gender' });
eq([p.a, p.b], [2, 0], 'donut: subject counts for the chosen term only');
eq(promotionView(T1, P, f({ term: 2 }), { gender: '', subject: '', by: 'gender' }).total, 0, 'donut: a term with no rows is empty');

// cascading filters
eq(scopeOptions(S, f({ section: 'basic' })).classes.map((c) => c.name), ['Nursery 1'], 'class list follows section');
eq(fixFilter({ ...f({ section: 'basic', sub: 'junior', cls: 'c1' }) }, S), f({ section: 'basic' }), 'invalid child filters are cleared');
eq(['1', '2', '3', '4', '11', '12', '13', '21', '22'].map((n) => ordinal(+n)), ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd'], 'ordinals');

// ---- class level: scatter ----
const meta = studentMap(S);
const SC = { subjects: [{ id: 'm', name: 'Maths' }, { id: 'e', name: 'English' }], students: ['a', 'b', 'c', 'd', 'e'],
  rows: [[0, 0, 90], [0, 1, 80], [1, 0, 70], [1, 1, 60], [2, 0, 30], [3, 0, 99], [3, 1, 95], [4, 0, 10]] };
let sv = scatterView(SC, meta, f({ term: 0 }));
eq([sv.n, sv.points.length], [5, 8], 'scatter: everything in scope');
eq(sv.students.map((x) => x.id), ['d', 'a', 'b', 'c', 'e'], 'scatter: students ranked by mean score');
eq(sv.points.filter((p) => p.sid === 'd').map((p) => p.x), [0, 0], 'scatter: best student sits at x=0');
sv = scatterView(SC, meta, f({ cls: 'c1' }));
eq([sv.n, sv.points.length], [3, 5], 'scatter: class filter');
sv = scatterView(SC, meta, f(), { gender: 'Female' });
eq(sv.students.map((x) => x.id), ['a', 'c'], 'scatter: gender filter');
sv = scatterView(SC, meta, f(), { subject: 'e' });
eq([sv.n, sv.points.length], [3, 3], 'scatter: one subject only shows students who have it');
eq(scatterView(null, meta, f()).n, 0, 'scatter: no data yet');
eq(new Set([0, 1, 2, 3, 4, 5, 6, 7].map(subjectHue)).size, 8, 'subject hues are all different');

// ---- class level: histogram ----
const H = [40, 49.9, 50, 69.99, 70, 100, 0].map((a, i) => ({ student_id: 'h' + i, student_name: 'H' + i, class_id: 'c1', section: 'secondary', sub_section: 'junior', term_no: 1, average: a }));
let h = histogram(H, f({ term: 1 }), 10);
eq(h.bins.map((b) => b.count), [1, 0, 0, 0, 2, 1, 1, 1, 0, 1], 'histogram: 10-wide bins, 100 lands in the last bin');
eq([h.n, h.median], [7, 50], 'histogram: count and median');
eq(histogram(H, f({ term: 1 }), 10, 50).above, 4, 'histogram: students at or above the target');
eq(histogram(H, f({ term: 1 }), 20).bins.length, 5, 'histogram: 20-wide bins');
eq(histogram(H, f({ term: 1, cls: 'zzz' }), 10).n, 0, 'histogram: class filter with nobody');
eq(histogram(H, f({ term: 1 }), 10).bins[5].students[0].student_id, 'h2', 'histogram: students listed best first');

// ---- student level: heatmap ----
const SC1 = { subjects: [{ id: 'm', name: 'Maths' }, { id: 'e', name: 'English' }], students: ['a', 'b', 'c', 'd', 'e'], rows: [[0, 0, 80], [0, 1, 60], [1, 0, 50], [3, 0, 99], [4, 0, 10]] };
const SC2 = { subjects: SC1.subjects, students: SC1.students, rows: [[0, 0, 100], [0, 1, 80], [1, 0, 70]] };
const hm = heatmapView({ 1: SC1 }, meta, f({ term: 1 }), { mode: 'subjects' });
eq(hm.cols.map((c) => c.label), ['Maths', 'English'], 'heatmap: subject columns');
eq(hm.rows.map((r) => r.id), ['d', 'a', 'b', 'e'], 'heatmap: rows by mean, best first');
eq(hm.rows.find((r) => r.id === 'a').cells, [80, 60], 'heatmap: cells');
eq(hm.rows.find((r) => r.id === 'b').cells, [50, null], 'heatmap: missing score stays empty');
eq(heatmapView({ 1: SC1 }, meta, f({ term: 1, cls: 'c1' }), { mode: 'subjects' }).rows.map((r) => r.id), ['a', 'b'], 'heatmap: class filter');
eq(heatmapView({ 1: SC1 }, meta, f({ term: 1 }), { mode: 'subjects', subject: 'e' }).rows.map((r) => r.id), ['a'], 'heatmap: subject drill');
eq(heatmapView({ 1: SC1 }, meta, f({ term: 1 }), { mode: 'subjects', sort: 'name' }).rows.map((r) => r.id), ['a', 'b', 'd', 'e'], 'heatmap: sort by name');
eq(heatmapView({ 1: SC1 }, meta, f({ term: 1 }), { mode: 'subjects', sort: 'class' }).rows.map((r) => r.cls), ['JSS 1', 'JSS 1', 'Nursery 1', 'SSS 1'], 'heatmap: sort by class');
const ht = heatmapView({ 1: SC1, 2: SC2 }, meta, f(), { mode: 'terms' });
eq(ht.cols.map((c) => c.label), ['Term 1', 'Term 2'], 'heatmap terms: only terms that have data');
eq(ht.rows.find((r) => r.id === 'a').cells, [70, 90], 'heatmap terms: mean over subjects per term');
eq(heatmapView({ 1: SC1, 2: SC2 }, meta, f(), { mode: 'terms', subject: 'm' }).rows.find((r) => r.id === 'a').cells, [80, 100], 'heatmap terms: one subject');
eq(heatmapView({}, meta, f(), { mode: 'subjects' }).rows, [], 'heatmap: no data yet');
eq([heatHue(0) < heatHue(50), heatHue(50) < heatHue(100)], [true, true], 'heat colour rises with score');

// ---- student level: radar ----
const DOM = { traits: [{ id: 't1', domain: 'affective', name: 'Neatness' }, { id: 't2', domain: 'affective', name: 'Honesty' }, { id: 't3', domain: 'psychomotor', name: 'Games' }],
  students: ['a', 'b', 'd'], rows: [[0, 0, 5], [0, 1, 4], [0, 2, 3], [1, 0, 3], [1, 1, 2], [2, 0, 1], [2, 2, 5]] };
const dv = domainView(DOM, meta, f(), 'a');
eq(dv.affective.axes, ['Neatness', 'Honesty'], 'radar: affective axes');
eq(dv.affective.student, [5, 4], 'radar: student values');
eq(dv.affective.cls, [4, 3], 'radar: class average (a and b)');
eq(dv.affective.scope, [3, 3], 'radar: selection average (everyone in scope)');
eq(dv.psychomotor.student, [3], 'radar: psychomotor student');
eq(domainView(DOM, meta, f({ section: 'basic' }), 'a').affective.scope, [null, null], 'radar: nobody in scope -> no average');
eq(domainView(DOM, meta, f(), '').affective.student, [null, null], 'radar: nobody followed');
eq(domainView(null, meta, f(), 'a').n, 0, 'radar: no data yet');

// heatmap: only the chosen (top ten by merit) students
eq(heatmapView({ 1: SC1 }, meta, f({ term: 1 }), { mode: 'subjects', only: new Set(['a', 'd']) }).rows.map((r) => r.id).sort(), ['a', 'd'], 'heatmap: only the ranked students');
eq(heatmapView({ 1: SC1 }, meta, f({ term: 1 }), { mode: 'subjects', only: new Set(topThree(S, f({ term: 1 }), 2).map((r) => r.student_id)) }).rows.length, 2, 'heatmap: top-N ids from topThree');

console.log(bad ? `\n${bad} problem(s)` : 'Dashboard logic: all checks pass.');
process.exit(bad ? 1 : 0);
