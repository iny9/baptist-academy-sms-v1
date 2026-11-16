// Pure schedule helpers shared by the schedule board, the builder and the bursar pages (testable offline: node tests/check_schedule_logic.mjs).
// A row is one line returned by fee_schedule(): state is outstanding | awaiting | cleared | ignored | carried.
export const STATE = { outstanding: ['Outstanding', 'red'], awaiting: ['Awaiting bursar', 'gold'], cleared: ['Cleared', 'green'], ignored: ['Cleared (ignored)', 'green'], carried: ['Brought forward', 'gold'] };
export const VARIANT = { 1: 'Level 1 · whole section', '2A': 'Level 2A · whole section', '2B': 'Level 2B · one sub-section', '3A': 'Level 3A · whole class', '3B': 'Level 3B · chosen students', 'B/F': 'Brought forward' };
export const SUBS = { nursery: 'Nursery', primary: 'Primary', junior: 'Junior secondary', senior: 'Senior secondary' };
export const naira = (n) => '₦' + Number(n ?? 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const norm = (s) => String(s ?? '').toLowerCase();

// f = { section, sub, cls, gender, state ('' | 'open' | state name), level, q }
export function filterRows(rows, f) {
  const q = norm(f.q).trim();
  return rows.filter((r) => (!f.section || r.section === f.section) && (!f.sub || r.sub_section === f.sub) && (!f.cls || r.class_id === f.cls) && (!f.gender || r.gender === f.gender)
    && (!f.level || String(r.level ?? r.origin_level ?? '') === String(f.level) || (f.level === 'bf' && r.kind === 'brought_forward'))
    && (!f.state || (f.state === 'open' ? r.state === 'outstanding' || r.state === 'awaiting' : r.state === f.state))
    && (!q || norm(r.student_name).includes(q) || norm(r.admission_no).includes(q) || norm(r.parents).includes(q)));
}
export function totals(rows) {
  const t = { outstanding: 0, awaiting: 0, cleared: 0, ignored: 0, carried: 0, all: 0, lines: rows.length };
  for (const r of rows) { t[r.state] += Number(r.amount_ngn); t.all += Number(r.amount_ngn); }
  t.owed = t.outstanding + t.awaiting;
  return t;
}
export function byStudent(rows) {
  const m = new Map();
  for (const r of rows) {
    const o = m.get(r.student_id) ?? { student_id: r.student_id, student_name: r.student_name, admission_no: r.admission_no, class_name: r.class_name, gender: r.gender, parents: r.parents, lines: 0, owed: 0, cleared: 0, carried: 0, total: 0 };
    o.lines++; o.total += Number(r.amount_ngn);
    if (r.state === 'outstanding' || r.state === 'awaiting') o.owed += Number(r.amount_ngn); else if (r.state === 'carried') o.carried += Number(r.amount_ngn); else o.cleared += Number(r.amount_ngn);
    m.set(r.student_id, o);
  }
  return [...m.values()].sort((a, b) => a.class_name.localeCompare(b.class_name) || a.student_name.localeCompare(b.student_name));
}
// Mirrors can_ignore_line() in the database, only to grey out buttons; the database decides. roles = [{ role, section }], leads = Set of class ids the user leads.
export function canIgnoreHint(row, roles, leads = new Set()) {
  if (row.state !== 'outstanding') return false;
  const lv = row.origin_level ?? row.level ?? null, has = (r, s) => roles.some((x) => x.role === r && (s === undefined || x.section === s));
  return has('admin') || ((lv === 3 || lv == null) && has('bursar')) || ((lv === 1 || lv === 2) && (has('principal', row.section) || has('headmaster', row.section))) || (lv === 1 && leads.has(row.class_id));
}
export function scheduleCsv(rows) {
  const q = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const head = ['Session', 'Term', 'Class', 'Section', 'Sub-section', 'Student', 'Admission no', 'Gender', 'Parent/guardian', 'Item', 'Level', 'Amount (NGN)', 'Status', 'Cleared on'];
  return [head.map(q).join(','), ...rows.map((r) => [r.year_name, r.term_number, r.class_name, r.section, r.sub_section ?? '', r.student_name, r.admission_no, r.gender, r.parents ?? '', r.title, r.variant ?? '', Number(r.amount_ngn).toFixed(2), STATE[r.state]?.[0] ?? r.state, r.confirmed_at ? r.confirmed_at.slice(0, 10) : ''].map(q).join(','))].join('\n');
}
// Which parents' students would a reminder reach: rows that are outstanding (not awaiting, not cleared, not brought forward)
export const reminderStudents = (rows) => [...new Set(rows.filter((r) => r.state === 'outstanding').map((r) => r.student_id))];
