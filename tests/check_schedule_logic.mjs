// Offline test of the schedule helpers.   Run: node tests/check_schedule_logic.mjs
import { filterRows, totals, byStudent, canIgnoreHint, scheduleCsv, reminderStudents, naira } from '../lib/schedule-logic.js';
let bad = 0;
const eq = (got, want, msg) => { if (JSON.stringify(got) !== JSON.stringify(want)) { bad++; console.log(`!! ${msg}\n   got  ${JSON.stringify(got)}\n   want ${JSON.stringify(want)}`); } };
const R = (o) => ({ year_name: '2026/2027', term_number: 1, section: 'secondary', sub_section: 'junior', gender: 'Female', parents: 'Mrs Bello', kind: 'fee', level: 1, variant: '1', origin_level: 1, confirmed_at: null, ...o });
const rows = [
  R({ line_id: 'l1', student_id: 's1', student_name: 'Bello Ada', admission_no: 'A1', class_id: 'c1', class_name: 'JSS 1', title: 'School fees', amount_ngn: 50000, state: 'outstanding' }),
  R({ line_id: 'l2', student_id: 's1', student_name: 'Bello Ada', admission_no: 'A1', class_id: 'c1', class_name: 'JSS 1', title: 'Excursion', amount_ngn: 3000, level: 3, variant: '3B', origin_level: 3, state: 'cleared', confirmed_at: '2026-10-02T10:00:00Z' }),
  R({ line_id: 'l3', student_id: 's2', student_name: 'Musa Bayo', admission_no: 'A2', class_id: 'c1', class_name: 'JSS 1', gender: 'Male', parents: 'Mr Musa', title: 'School fees', amount_ngn: 50000, state: 'awaiting' }),
  R({ line_id: 'l4', student_id: 's3', student_name: 'Eze Chi', admission_no: 'A3', class_id: 'c2', class_name: 'SSS 1', sub_section: 'senior', gender: 'Male', parents: 'Dr Eze', title: 'Lab levy', amount_ngn: 8000, level: 2, variant: '2B', origin_level: 2, state: 'ignored' }),
  R({ line_id: 'l5', student_id: 's3', student_name: 'Eze Chi', admission_no: 'A3', class_id: 'c2', class_name: 'SSS 1', sub_section: 'senior', gender: 'Male', parents: 'Dr Eze', kind: 'brought_forward', level: null, variant: 'B/F', origin_level: 3, title: 'B/F: Trip', amount_ngn: 2000, state: 'outstanding' }),
  R({ line_id: 'l6', student_id: 's3', student_name: 'Eze Chi', admission_no: 'A3', class_id: 'c2', class_name: 'SSS 1', sub_section: 'senior', gender: 'Male', parents: 'Dr Eze', title: 'Old fee', amount_ngn: 9000, state: 'carried' })];

eq(filterRows(rows, { state: 'open' }).map((r) => r.line_id), ['l1', 'l3', 'l5'], 'open = outstanding + awaiting');
eq(filterRows(rows, { state: 'cleared' }).map((r) => r.line_id), ['l2'], 'cleared excludes ignored (shown separately)');
eq(filterRows(rows, { sub: 'senior', gender: 'Male' }).map((r) => r.line_id), ['l4', 'l5', 'l6'], 'sub-section + gender slicers');
eq(filterRows(rows, { cls: 'c1', q: 'musa' }).map((r) => r.line_id), ['l3'], 'class + search by parent or student');
eq(filterRows(rows, { level: 'bf' }).map((r) => r.line_id), ['l5'], 'brought-forward filter');
eq(filterRows(rows, { level: '3' }).map((r) => r.line_id), ['l2', 'l5'], 'level 3 includes brought-forward lines that came from level 3');
const t = totals(rows);
eq([t.outstanding, t.awaiting, t.cleared, t.ignored, t.carried, t.owed, t.all], [52000, 50000, 3000, 8000, 9000, 102000, 122000], 'totals by state');
eq(byStudent(rows).map((s) => [s.student_name, s.lines, s.owed, s.cleared, s.carried]), [['Bello Ada', 2, 50000, 3000, 0], ['Musa Bayo', 1, 50000, 0, 0], ['Eze Chi', 3, 2000, 8000, 9000]].sort((a, b) => 0), 'per-student summary');
const roles = (...r) => r.map(([role, section]) => ({ role, section }));
eq(canIgnoreHint(rows[0], roles(['bursar'])), false, 'bursar cannot ignore a level 1 line');
eq(canIgnoreHint(rows[4], roles(['bursar'])), true, 'bursar can ignore a brought-forward line that came from level 3');
eq(canIgnoreHint(rows[0], roles(['principal', 'secondary'])), true, 'section head can ignore level 1 in own section');
eq(canIgnoreHint(rows[0], roles(['principal', 'basic'])), false, 'but not in another section');
eq(canIgnoreHint(rows[0], roles(['class_teacher']), new Set(['c1'])), true, 'class teacher can ignore level 1 for own class');
eq(canIgnoreHint(rows[0], roles(['class_teacher']), new Set(['c9'])), false, 'not for another class');
eq(canIgnoreHint(rows[1], roles(['admin'])), false, 'a cleared line cannot be ignored');
eq(canIgnoreHint(rows[2], roles(['admin'])), false, 'a line awaiting the bursar must be decided first');
eq(reminderStudents(rows), ['s1', 's3'], 'reminders reach only students with outstanding (not awaiting) lines');
const csv = scheduleCsv(filterRows(rows, { cls: 'c1' }));
eq(csv.split('\n').length, 4, 'csv has a header and one row per line');
eq(csv.split('\n')[2].includes('Cleared'), true, 'csv shows the status word');
eq(naira(1234.5), '₦1,234.50', 'naira format');
console.log(bad ? `Schedule logic: ${bad} problem(s).` : 'Schedule logic: all checks pass.'); process.exit(bad ? 1 : 0);
