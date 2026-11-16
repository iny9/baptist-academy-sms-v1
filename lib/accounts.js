// Accounts for everyone except administrators.
// Supabase Auth needs an email-shaped sign-in name, so a person with a username gets an internal alias  <username>@<LOGIN_DOMAIN>.
// The alias is never shown or emailed. Their real email is OPTIONAL and kept separately in profiles.contact_email; it is used only
// to send a link where they set a new password if they forget it.
// Cleaned so a stray space, quote, "https://", "@" or trailing slash in the setting cannot break every sign-in address.
const cleanDomain = (v) => String(v ?? '').trim().toLowerCase().replace(/^["']|["']$/g, '').replace(/^https?:\/\//, '').replace(/^@+/, '').replace(/[\/\s].*$/, '').replace(/\.+$/, '');
export const LOGIN_DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(cleanDomain(process.env.NEXT_PUBLIC_LOGIN_DOMAIN)) ? cleanDomain(process.env.NEXT_PUBLIC_LOGIN_DOMAIN) : 'login.baptistacademy.ng';
// A username the administrator chooses: 4-30 characters, lower-case letters and digits, with single dots, dashes or underscores between them. It becomes the local part of an email-shaped sign-in name, so it must be a valid one.
export const USERNAME_RE = /^(?=.{4,30}$)[a-z0-9]+(?:[._-][a-z0-9]+)*$/;   // letters/digits, with single . _ - between them (never at the start or end, never doubled)
export const aliasEmail = (username) => `${username}@${LOGIN_DOMAIN}`;
export const cleanUsername = (v) => { const u = String(v ?? '').trim().toLowerCase(); return USERNAME_RE.test(u) ? u : null; };

// Passwords the administrator types: 8-72 characters (72 is the most the sign-in system reads), at least one letter and one digit, not the username.
export function passwordProblem(pw, username) {
  const v = String(pw ?? '');
  if (v.length < 8) return 'The password must be at least 8 characters.';
  if (v.length > 72) return 'The password must be 72 characters or fewer.';
  if (!/[A-Za-z]/.test(v) || !/\d/.test(v)) return 'The password needs at least one letter and one number.';
  if (username && v.toLowerCase() === String(username).toLowerCase()) return 'The password must not be the same as the username.';
  return null;
}

// What a person types on the sign-in page: an email (administrators) or a username (everyone else)
export function loginIdentity(raw) {
  const v = String(raw ?? '').trim().toLowerCase().slice(0, 254);
  if (v.includes('@')) return /^[^@\s]{1,64}@[^@\s]{1,255}\.[^@\s]{2,}$/.test(v) ? { email: v, kind: 'email' } : null;
  return USERNAME_RE.test(v) ? { email: aliasEmail(v), kind: 'username', username: v } : null;
}

// Letters taken from the name (accents and titles removed) + three digits: used only to SUGGEST a username (the administrator can change it).
export function nameLetters(fullName) {
  const TITLES = new Set(['mr', 'mrs', 'miss', 'ms', 'dr', 'prof', 'chief', 'engr', 'pastor', 'rev', 'alhaji', 'alhaja', 'hajia', 'barr', 'sir', 'madam', 'mal']);
  let words = String(fullName ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(/[^a-z]+/).filter(Boolean);
  if (words.filter((w) => !TITLES.has(w)).length) words = words.filter((w) => !TITLES.has(w));   // "Mrs. Eze" -> eze...
  return (words.join('') + 'xxxx').slice(0, 4);
}
export function makeUsername(fullName, randomInt) {
  return nameLetters(fullName) + String(randomInt(100, 1000));
}

export const ROLE_LABEL_SHORT = { exam_officer: 'Exam officer', class_teacher: 'Class teacher / form master', subject_teacher: 'Subject teacher', principal: 'Principal', headmaster: 'Headmaster / headmistress', board_member: 'Board member', bursar: 'Bursar', parent: 'Parent / guardian' };
// The admin never creates other administrators here (an administrator keeps an email and is added from the "Administrators" box)
export const CREATABLE = Object.keys(ROLE_LABEL_SHORT);
export const SECTIONAL = ['exam_officer', 'class_teacher', 'subject_teacher', 'principal', 'headmaster'];
export const FIXED_SECTION = { principal: 'secondary', headmaster: 'basic' };

const ROLE_WORDS = {
  'exam officer': 'exam_officer', 'exam_officer': 'exam_officer', 'examofficer': 'exam_officer',
  'class teacher': 'class_teacher', 'class_teacher': 'class_teacher', 'form master': 'class_teacher', 'form mistress': 'class_teacher', 'form teacher': 'class_teacher',
  'subject teacher': 'subject_teacher', 'subject_teacher': 'subject_teacher',
  'principal': 'principal', 'headmaster': 'headmaster', 'headmistress': 'headmaster', 'head master': 'headmaster',
  'board member': 'board_member', 'board_member': 'board_member', 'board': 'board_member', 'bursar': 'bursar',
  'parent': 'parent', 'guardian': 'parent', 'parent/guardian': 'parent',
};
export const parseRole = (s) => ROLE_WORDS[String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')] ?? null;
export const parseSection = (s) => { const v = String(s ?? '').trim().toLowerCase(); return ['basic', 'primary', 'nursery'].includes(v) ? 'basic' : ['secondary', 'junior', 'senior', 'jss', 'sss'].includes(v) ? 'secondary' : null; };

export const EMAIL_RE = /^[^@\s]{1,64}@[^@\s]{1,255}\.[^@\s]{2,}$/;
export const cleanEmail = (v) => { const e = String(v ?? '').trim().toLowerCase(); return e && EMAIL_RE.test(e) && e.length <= 254 ? e : null; };

// ----- roles: one person may hold several -----
const TEACHING_ROLES = ['class_teacher', 'subject_teacher'];   // a teacher works in one section only
// Checks a list of { role, section } and returns { roles } (cleaned, no duplicates, fixed sections filled in) or { error }.
export function normalizeRoles(list) {
  const out = [], seen = new Set();
  if (!Array.isArray(list) || !list.length) return { error: 'Choose at least one role.' };
  for (const it of list) {
    const role = it?.role;
    if (!CREATABLE.includes(role)) return { error: `Unknown role “${role ?? ''}”.` };
    let section = it?.section || null;
    if (section && !['basic', 'secondary'].includes(section)) return { error: `Unknown section “${section}” (use Basic or Secondary).` };
    if (FIXED_SECTION[role]) { if (section && section !== FIXED_SECTION[role]) return { error: `${ROLE_LABEL_SHORT[role]} belongs to ${FIXED_SECTION[role]} only.` }; section = FIXED_SECTION[role]; }
    else if (SECTIONAL.includes(role) && !section) return { error: `${ROLE_LABEL_SHORT[role]} needs a section (Basic or Secondary).` };
    else if (!SECTIONAL.includes(role)) section = null;
    const key = `${role}|${section ?? ''}`;
    if (!seen.has(key)) { seen.add(key); out.push({ role, section }); }
  }
  const teachSections = new Set(out.filter((r) => TEACHING_ROLES.includes(r.role)).map((r) => r.section));
  if (teachSections.size > 1) return { error: 'A class or subject teacher works in one section only. Give the teaching roles in the same section.' };
  return { roles: out };
}

// "exam officer (basic) + subject teacher (basic) + parent"  ->  [{role, section}, ...]   (separate roles with + or |; the section goes in brackets or after a colon)
export function parseRoles(text) {
  const items = String(text ?? '').split(/[+|]/).map((t) => t.trim()).filter(Boolean);
  if (!items.length) return { error: 'Add at least one role.' };
  const list = [];
  for (const t of items) {
    const m = t.match(/^([^():]+?)\s*(?:\(([^)]*)\)|:\s*([A-Za-z]+))?$/);
    const role = m && parseRole(m[1]);
    if (!role) return { error: `Unknown role “${t}”` };
    const secRaw = (m[2] ?? m[3] ?? '').trim();
    const section = secRaw ? parseSection(secRaw) : null;
    if (secRaw && !section) return { error: `Unknown section “${secRaw}” (use Basic or Secondary)` };
    list.push({ role, section });
  }
  return normalizeRoles(list);
}

// One pasted/uploaded line:  Full name, username, password, roles[, email]   (comma, semicolon or tab between columns)
//   roles: one or more, joined with +   e.g.  exam officer (basic) + subject teacher (basic) + parent
//   username or password left empty -> the system makes one.  The email is optional.   Returns { person } or { error }.
export function parseLine(line) {
  const parts = String(line).split(/[,;\t]/).map((p) => p.trim());
  if (parts.length < 4 || !parts[0]) return { error: 'Use: Full name, username, password, roles, email (username, password and email may be left empty; keep the commas)' };
  const [full_name, userRaw, pwRaw, rolesRaw, emailRaw] = parts;
  let username = null;
  if (userRaw) { username = cleanUsername(userRaw); if (!username) return { error: `“${userRaw}” is not a valid username (4-30 letters and numbers; single . _ - allowed between them)` }; }
  const password = pwRaw || null;
  if (password) { const pe = passwordProblem(password, username); if (pe) return { error: pe }; }
  const r = parseRoles(rolesRaw); if (r.error) return { error: r.error };
  let email = null;
  if (emailRaw) { email = cleanEmail(emailRaw); if (!email) return { error: `“${emailRaw}” is not a valid email address` }; }
  return { person: { full_name, username, password, roles: r.roles, email } };
}

// The address mail may be sent to: the email on record; an administrator's own sign-in email; never the internal alias of a username account.
export const mailAddress = (p) => p?.contact_email || (p?.username ? null : p?.email) || null;
