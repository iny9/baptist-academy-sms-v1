// Every list of people is ordered by surname, then first name; subjects and classes by name.
const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });
export const cmp = (a, b) => collator.compare(String(a ?? ''), String(b ?? ''));
export const bySurname = (a, b) => cmp(a.last_name, b.last_name) || cmp(a.first_name, b.first_name) || cmp(a.other_names, b.other_names);
export const byName = (a, b) => cmp(a.name ?? a.subject_name, b.name ?? b.subject_name);
export const fullName = (s) => `${s.last_name} ${s.first_name}`.trim();
