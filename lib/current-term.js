// "Which term is it now?" One rule for the whole system, so every picker opens on the same session and term.
//   1. Among the active terms (every term if none is active), the one that has begun and began most recently.
//      That is the term running today, and during the holiday it is the term that just ended.
//   2. If no term has begun yet, the earliest one.
// Dates are compared as plain YYYY-MM-DD in Nigerian time, so the answer does not change with the visitor's own clock.
export const todayLagos = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date());

export function pickCurrentTerm(terms, today = todayLagos()) {
  const list = (terms ?? []).filter((t) => t && t.id && t.starts_on);
  if (list.length === 0) return null;
  const live = list.filter((t) => t.is_active !== false);
  const pool = live.length ? live : list;
  const byStart = (a, b) => String(a.starts_on).localeCompare(String(b.starts_on));
  const begun = pool.filter((t) => String(t.starts_on) <= today).sort(byStart);
  return begun.length ? begun[begun.length - 1] : pool.slice().sort(byStart)[0];
}

// For a list that only holds ids (a session picker): the id to open on, falling back to the first entry.
export const pickId = (items, wanted, fallback = '') => ((items ?? []).some((i) => i.id === wanted) ? wanted : (items ?? [])[0]?.id ?? fallback);
