// Pure attendance maths shared by the heads' reports, the class teacher's register and the parents' view (no network, so it is testable offline:
// node tests/check_attendance_logic.mjs). Dates are ISO strings 'YYYY-MM-DD'; a sheet row is
// [class_id, day, half, saved_at, n_m, n_f, p_m, p_f] exactly as att_sheets() returns it (n = on the register, p = present).
export const pct = (p, n) => (n > 0 ? Math.round((p * 10000) / n) / 100 : null);
export const mondayOf = (iso) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
export const monthOf = (iso) => iso.slice(0, 7);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const monthLabel = (ym) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
export const dayLabel = (iso) => { const d = new Date(iso + 'T00:00:00Z'); return `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; };

// f = { section, sub, cls, gender ('' | 'Male' | 'Female'), from, to }
export function classesIn(classes, f) {
  return classes.filter((c) => (!f.section || c.section === f.section) && (!f.sub || c.sub_section === f.sub) && (!f.cls || c.id === f.cls));
}
const share = (gender, a, b) => (gender === 'Male' ? a : gender === 'Female' ? b : a + b);

// Day, week or month totals from the saved registers of one term.
export function rollupSheets(sheets, classes, f, grain = 'week') {
  const ids = new Set(classesIn(classes, f).map((c) => c.id)), g = f.gender ?? '', out = new Map();
  for (const [cid, day, , , nm, nf, pm, pf] of sheets) {
    if (!ids.has(cid) || (f.from && day < f.from) || (f.to && day > f.to)) continue;
    const key = grain === 'day' ? day : grain === 'month' ? monthOf(day) : mondayOf(day);
    const o = out.get(key) ?? { key, possible: 0, present: 0, days: new Set() };
    o.possible += share(g, nm, nf); o.present += share(g, pm, pf); o.days.add(day); out.set(key, o);
  }
  return [...out.values()].sort((a, b) => (a.key < b.key ? -1 : 1)).map((o) => ({
    key: o.key, label: grain === 'month' ? monthLabel(o.key) : grain === 'week' ? 'Wk of ' + dayLabel(o.key) : dayLabel(o.key),
    possible: o.possible, present: o.present, absent: o.possible - o.present, pct: pct(o.present, o.possible), days: o.days.size }));
}

// Month-on-month, term-on-term or whole-session totals from att_rollups(). Rows: [class_id, month|term_id, n_m, n_f, p_m, p_f, days]
export function rollupTotals(r, f, grain) {
  const ids = new Set(classesIn(r.classes, f).map((c) => c.id)), g = f.gender ?? '', out = new Map();
  const termNo = new Map(r.terms.map((t) => [t.id, t.number]));
  const rows = grain === 'month' ? r.by_month : r.by_term;
  for (const [cid, k, nm, nf, pm, pf, days] of rows) {
    if (!ids.has(cid)) continue;
    const key = grain === 'month' ? k : grain === 'term' ? 'T' + termNo.get(k) : 'S';
    const o = out.get(key) ?? { key, possible: 0, present: 0, days: 0 };
    o.possible += share(g, Number(nm), Number(nf)); o.present += share(g, Number(pm), Number(pf)); o.days += Number(days); out.set(key, o);
  }
  return [...out.values()].sort((a, b) => (a.key < b.key ? -1 : 1)).map((o) => ({
    ...o, label: grain === 'month' ? monthLabel(o.key) : grain === 'term' ? 'Term ' + o.key.slice(1) : 'Whole session',
    absent: o.possible - o.present, pct: pct(o.present, o.possible) }));
}

// The list heads see: for each class and day, when the morning and afternoon registers were uploaded.
export function dailyUploads(sheets, classes, f) {
  const byId = new Map(classesIn(classes, f).map((c) => [c.id, c])), m = new Map();
  for (const [cid, day, half, at, nm, nf, pm, pf] of sheets) {
    const c = byId.get(cid); if (!c || (f.from && day < f.from) || (f.to && day > f.to)) continue;
    const o = m.get(cid + day) ?? { class_id: cid, class_name: c.name, section: c.section, day, am_at: null, pm_at: null, possible: 0, present: 0 };
    if (half === 'M') o.am_at = at; else o.pm_at = at;
    const g = f.gender ?? ''; o.possible += share(g, nm, nf); o.present += share(g, pm, pf); m.set(cid + day, o);
  }
  return [...m.values()].sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : a.class_name < b.class_name ? -1 : 1))
    .map((o) => ({ ...o, pct: pct(o.present, o.possible) }));
}

// Weekly completion per class: closed weeks / weeks expected, plus the term and session state, from att_completion().
export function termStatus(r) {
  if (r.exam_end_on == null) return 'No calendar';
  if (r.term_closed) return 'Closed';
  return r.days_saved > 0 ? 'In progress' : 'Not started';
}
export function completionByClass(rows, f = {}) {
  const by = new Map();
  for (const r of rows) {
    if ((f.section && r.section !== f.section) || (f.sub && r.sub_section !== f.sub) || (f.cls && r.class_id !== f.cls)) continue;
    const o = by.get(r.class_id) ?? { class_id: r.class_id, class_name: r.class_name, section: r.section, terms: [] };
    o.terms.push({ ...r, status: termStatus(r), weeksDone: r.weeks_total != null && r.weeks_total > 0 && r.weeks_closed >= r.weeks_total });
    by.set(r.class_id, o);
  }
  return [...by.values()].map((o) => ({ ...o, sessionDone: o.terms.length > 0 && o.terms.every((t) => t.status === 'Closed') }));
}

// A child's attendance: per day, month, term and session, counting only days up to `today`. child = att_child() result.
export function childSummary(child, today) {
  const marks = new Map(child.marks.map(([d, m]) => [d, m]));
  let sp = 0, so = 0;
  const terms = child.terms.map((t) => {
    const days = t.days.filter((d) => d <= today).map((d) => { const m = marks.get(d) ?? 0; return { day: d, am: !!(m & 1), pm: !!(m & 2), present: (m & 1 ? 1 : 0) + (m & 2 ? 1 : 0) }; });
    const open = days.length * 2, present = days.reduce((s, x) => s + x.present, 0), mm = new Map();
    for (const x of days) { const k = monthOf(x.day), o = mm.get(k) ?? { month: k, label: monthLabel(k), open: 0, present: 0 }; o.open += 2; o.present += x.present; mm.set(k, o); }
    sp += present; so += open;
    return { number: t.number, closed: t.closed, exam_end_on: t.exam_end_on, times_open_total: t.times_open, open, present, absent: open - present, pct: pct(present, open), days,
      months: [...mm.values()].map((o) => ({ ...o, absent: o.open - o.present, pct: pct(o.present, o.open) })) };
  });
  return { terms, session: { open: so, present: sp, absent: so - sp, pct: pct(sp, so) } };
}

export function toCsv(headers, rows) {
  const q = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return [headers.map(q).join(','), ...rows.map((r) => r.map(q).join(','))].join('\n');
}
export const fmtTime = (iso) => (iso ? new Date(iso).toLocaleString('en-GB', { timeZone: 'Africa/Lagos', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
