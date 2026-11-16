// Offline test of the attendance maths.   Run: node tests/check_attendance_logic.mjs
import { pct, mondayOf, rollupSheets, rollupTotals, dailyUploads, completionByClass, childSummary, toCsv, classesIn } from '../lib/attendance-logic.js';
let bad = 0;
const eq = (got, want, msg) => { if (JSON.stringify(got) !== JSON.stringify(want)) { bad++; console.log(`!! ${msg}\n   got  ${JSON.stringify(got)}\n   want ${JSON.stringify(want)}`); } };

eq(pct(1, 3), 33.33, 'pct rounds to 2 places'); eq(pct(0, 0), null, 'pct of nothing is null');
eq([mondayOf('2026-11-14'), mondayOf('2026-11-16'), mondayOf('2026-11-15')], ['2026-11-09', '2026-11-16', '2026-11-09'], 'Saturday and Sunday belong to the Monday before; Monday is itself');

const classes = [{ id: 'a', name: 'JSS 1', section: 'secondary', sub_section: 'junior' }, { id: 'b', name: 'SSS 1', section: 'secondary', sub_section: 'senior' }, { id: 'c', name: 'Primary 1', section: 'basic', sub_section: 'primary' }];
// Mon 9 Nov and Tue 10 Nov 2026, both halves for class a (10 boys, 10 girls); only the morning for class b; class c on Wed 11 Nov
const S = [
  ['a', '2026-11-09', 'M', '2026-11-09T07:40:00Z', 10, 10, 9, 8], ['a', '2026-11-09', 'A', '2026-11-09T12:10:00Z', 10, 10, 8, 8],
  ['a', '2026-11-10', 'M', '2026-11-10T07:41:00Z', 10, 10, 10, 10], ['a', '2026-11-10', 'A', '2026-11-10T12:11:00Z', 10, 10, 10, 9],
  ['b', '2026-11-09', 'M', '2026-11-09T07:55:00Z', 5, 5, 5, 4], ['c', '2026-11-11', 'M', '2026-11-11T07:30:00Z', 4, 6, 4, 6]];
eq(rollupSheets(S, classes, { section: 'secondary' }, 'day').map((r) => [r.key, r.possible, r.present, r.pct]),
  [['2026-11-09', 50, 42, 84], ['2026-11-10', 40, 39, 97.5]], 'day totals for the secondary section');
eq(rollupSheets(S, classes, { section: 'secondary', gender: 'Male' }, 'day').map((r) => [r.key, r.possible, r.present]), [['2026-11-09', 25, 22], ['2026-11-10', 20, 20]], 'by gender: boys only');
eq(rollupSheets(S, classes, { section: 'secondary', gender: 'Female' }, 'day').map((r) => r.present), [20, 19], 'by gender: girls only');
eq(rollupSheets(S, classes, {}, 'week').map((r) => [r.key, r.possible, r.present, r.days]), [['2026-11-09', 100, 91, 3]], 'one week across all sections, three distinct days');
eq(rollupSheets(S, classes, { cls: 'b' }, 'month').map((r) => [r.label, r.present]), [['Nov 2026', 9]], 'class slicer + month grain');
eq(rollupSheets(S, classes, { from: '2026-11-10', to: '2026-11-10' }, 'day').length, 1, 'date range');
eq(classesIn(classes, { sub: 'senior' }).map((c) => c.id), ['b'], 'sub-section slicer');

const U = dailyUploads(S, classes, { section: 'secondary' });
eq(U.map((u) => [u.class_name, u.day, !!u.am_at, !!u.pm_at]), [['JSS 1', '2026-11-10', true, true], ['JSS 1', '2026-11-09', true, true], ['SSS 1', '2026-11-09', true, false]],
  'daily upload list: newest day first, morning and afternoon timestamps, missing afternoon shows empty');

const R = { terms: [{ id: 't1', number: 1 }, { id: 't2', number: 2 }], classes,
  by_term: [['a', 't1', 100, 100, 90, 85, 10], ['a', 't2', 100, 100, 80, 80, 10], ['b', 't1', 50, 50, 40, 40, 10]],
  by_month: [['a', '2026-09', 60, 60, 50, 50, 6], ['a', '2026-10', 140, 140, 120, 115, 14]] };
eq(rollupTotals(R, { section: 'secondary' }, 'term').map((r) => [r.label, r.possible, r.present, r.pct]), [['Term 1', 300, 255, 85], ['Term 2', 200, 160, 80]], 'term on term');
eq(rollupTotals(R, { cls: 'a', gender: 'Female' }, 'term').map((r) => r.present), [85, 80], 'term on term, girls');
eq(rollupTotals(R, {}, 'session').map((r) => [r.label, r.pct]), [['Whole session', 83]], 'whole session');
eq(rollupTotals(R, {}, 'month').map((r) => r.label), ['Sep 2026', 'Oct 2026'], 'month on month');

const comp = completionByClass([
  { class_id: 'a', class_name: 'JSS 1', section: 'secondary', sub_section: 'junior', term_no: 1, exam_end_on: '2026-12-11', weeks_total: 3, weeks_closed: 3, days_saved: 15, term_closed: true },
  { class_id: 'a', class_name: 'JSS 1', section: 'secondary', sub_section: 'junior', term_no: 2, exam_end_on: null, weeks_total: null, weeks_closed: 0, days_saved: 0, term_closed: false },
  { class_id: 'b', class_name: 'SSS 1', section: 'secondary', sub_section: 'senior', term_no: 1, exam_end_on: '2026-12-11', weeks_total: 3, weeks_closed: 1, days_saved: 7, term_closed: false }]);
eq(comp.map((c) => [c.class_name, c.terms.map((t) => t.status), c.terms.map((t) => t.weeksDone), c.sessionDone]),
  [['JSS 1', ['Closed', 'No calendar'], [true, false], false], ['SSS 1', ['In progress'], [false], false]], 'completion: weekly, termly, session state');

// parent view: Mon-Wed school days, Tuesday absent in the morning, Wednesday absent all day; "today" is Wednesday so later days do not count
const child = { terms: [{ number: 1, closed: false, exam_end_on: '2026-12-11', times_open: 10, days: ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12'] }], marks: [['2026-11-09', 3], ['2026-11-10', 2]] };
const cs = childSummary(child, '2026-11-11');
eq([cs.terms[0].open, cs.terms[0].present, cs.terms[0].absent, cs.terms[0].pct], [6, 3, 3, 50], 'child: counts only days up to today');
eq(cs.terms[0].days.map((d) => [d.am, d.pm]), [[true, true], [false, true], [false, false]], 'child: daily morning / afternoon ticks');
eq(cs.session, { open: 6, present: 3, absent: 3, pct: 50 }, 'child: session total');
eq(cs.terms[0].months.map((m) => [m.label, m.pct]), [['Nov 2026', 50]], 'child: monthly');

eq(toCsv(['a', 'b'], [['x,y', 'say "hi"'], [1, null]]), 'a,b\n"x,y","say ""hi"""\n1,', 'CSV quoting');
console.log(bad ? `Attendance logic: ${bad} problem(s).` : 'Attendance logic: all checks pass.'); process.exit(bad ? 1 : 0);
