// Offline test of the "View as" rule: a role picked in one module must never block a page that role cannot open.
// Run: node tests/check_view_scope.mjs
import { navFor } from '../lib/nav.js';
import { viewAllows, resolveView } from '../lib/active-role.js';
const ROLES = ['admin', 'exam_officer', 'class_teacher', 'subject_teacher', 'principal', 'headmaster', 'board_member', 'bursar', 'parent'];
let bad = 0;
const fail = (m) => { bad++; console.log('!! ' + m); };
for (const r of ROLES) for (const g of navFor([r])) for (const i of g.items) if (!viewAllows(r, i.href)) fail(`${r} is shown ${i.href} but "view as ${r}" would not open it`);
for (const [r, p] of [['class_teacher', '/admin/students/match'], ['parent', '/admin/bursar/records'], ['subject_teacher', '/admin/results'], ['class_teacher', '/admin/bursar']])
  if (viewAllows(r, p)) fail(`${r} should not be narrowed into ${p}`);
for (const [map, scope, want] of [[{ '/admin/students': 'class_teacher' }, '/admin/students/match', null], [{ '/admin/students': 'class_teacher' }, '/admin/students', 'class_teacher'], [{ '*': 'parent' }, '/admin/payments', 'parent'], [{ '*': 'parent' }, '/admin/users', null]])
  if (resolveView(map, scope) !== want) fail(`resolveView(${JSON.stringify(map)}, ${scope}) should be ${want}`);
console.log(bad ? `\n${bad} problem(s)` : 'View-as scope rules hold for every role and menu page.');
process.exit(bad ? 1 : 0);
