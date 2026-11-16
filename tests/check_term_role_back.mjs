// Offline test of the current-term, default-role and Back-link rules (no database): the running term, the parent default role, the safe Back link.   Run: node tests/check_term_role_back.mjs
import { pickCurrentTerm } from '../lib/current-term.js';
import { parentMix } from '../lib/active-role.js';
import { safeFrom, fromQuery } from '../lib/back.js';
let bad = 0;
const eq = (got, want, msg) => { if (JSON.stringify(got) !== JSON.stringify(want)) { bad++; console.log(`!! ${msg}\n   got  ${JSON.stringify(got)}\n   want ${JSON.stringify(want)}`); } };

const T = [
  { id: 'a1', number: 1, year_id: 'y1', starts_on: '2025-09-08', is_active: true }, { id: 'a2', number: 2, year_id: 'y1', starts_on: '2026-01-12', is_active: true }, { id: 'a3', number: 3, year_id: 'y1', starts_on: '2026-04-27', is_active: true },
  { id: 'b1', number: 1, year_id: 'y2', starts_on: '2026-09-14', is_active: true }, { id: 'b2', number: 2, year_id: 'y2', starts_on: '2027-01-11', is_active: true }, { id: 'b3', number: 3, year_id: 'y2', starts_on: '2027-04-26', is_active: false }];
eq(pickCurrentTerm(T, '2026-11-15').id, 'b1', 'mid first term: that term');
eq(pickCurrentTerm(T, '2027-01-11').id, 'b2', 'first day of a term counts');
eq(pickCurrentTerm(T, '2026-08-20').id, 'a3', 'holiday: the term that just ended');
eq(pickCurrentTerm(T, '2027-06-01').id, 'b2', 'an inactive term is never "current" while an active one has begun');
eq(pickCurrentTerm(T, '2025-01-01').id, 'a1', 'nothing begun yet: the earliest term');
eq(pickCurrentTerm([], '2026-11-15'), null, 'no terms');
eq(pickCurrentTerm(T.map((t) => ({ ...t, is_active: false })), '2026-11-15').id, 'b1', 'all inactive: still answers');

eq([parentMix(['parent']), parentMix(['parent', 'class_teacher']), parentMix(['class_teacher', 'exam_officer']), parentMix([])], [false, true, false, false], 'a parent who holds another role acts as a parent first');

eq(safeFrom('/admin/results?term=1&class=2'), '/admin/results?term=1&class=2', 'portal path accepted');
eq([safeFrom('https://evil.example'), safeFrom('//evil.example'), safeFrom('/admin//x'), safeFrom('/login'), safeFrom(null)], [null, null, null, null, null], 'anything else is refused');
eq(fromQuery('/admin/payments?term=9'), 'from=%2Fadmin%2Fpayments%3Fterm%3D9', 'from= is encoded');
console.log(bad ? `\n${bad} problem(s)` : 'Term, role and Back-link logic: all checks pass.');
process.exit(bad ? 1 : 0);
