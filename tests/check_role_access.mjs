// Offline check: for every page in the side menu, does the page's own guard let in the roles the menu shows it to?
// A role that sees a link but is bounced by the page is "denied"; a role that could open a page but never sees the link is "hidden".
// It reads each page's guard heuristically (role names in its first lines), so treat a "!!" as "look here", not as proof.
// Run:  node tests/check_role_access.mjs      (no network, no database)
import { readFileSync, existsSync } from 'node:fs';
import { navFor } from '../lib/nav.js';

const ROLES = ['admin', 'exam_officer', 'class_teacher', 'subject_teacher', 'principal', 'headmaster', 'board_member', 'bursar', 'parent'];
const pageOf = (href) => `app${href}/page.jsx`;
const seen = {};
for (const r of ROLES) for (const g of navFor([r])) for (const i of g.items) (seen[i.href] ??= { label: i.label, roles: [] }).roles.push(r);

let problems = 0;
for (const [href, { label, roles }] of Object.entries(seen)) {
  if (href === '/admin' || href === '/admin/profile') continue;   // open to every signed-in person
  const f = pageOf(href);
  if (!existsSync(f)) { console.log(`?  ${href}: no page file`); continue; }
  // the guard sits in the first lines of the page (before any data is read); a page that tests `isAdmin` counts as letting the administrator in
  const src = readFileSync(f, 'utf8').split('\n').slice(0, 24).join('\n');
  // a guard that uses a role list imported from lib/ (for example DASH_ROLES) is read from that file
  let extra = ''; for (const m of src.matchAll(/import\s*\{[^}]*\}\s*from\s*'@\/lib\/([\w-]+)'/g)) { const lf = `lib/${m[1]}.js`; if (existsSync(lf)) extra += '\n' + readFileSync(lf, 'utf8').split('\n').filter((l) => /(['"][a-z_]+['"])/.test(l) && /(ROLES|ALLOWED|ACCESS)/i.test(l)).join('\n'); }
  const guard = (src + extra).replace(/isAdmin/g, "'admin'");
  if (!/redirect\(|NoAccess|staff|staffView|has\(/.test(guard)) { console.log(`~  ${href} (${label}): no guard found in the first lines; check by hand. Menu shows it to: ${roles.join(', ')}`); continue; }
  const allowed = ROLES.filter((r) => new RegExp(`['"]${r}['"]`).test(guard));
  const denied = roles.filter((r) => !allowed.includes(r)), hidden = allowed.filter((r) => !roles.includes(r));
  if (denied.length || hidden.length) { problems++; console.log(`!! ${href} (${label}): ${denied.length ? 'SEEN BUT DENIED: ' + denied.join(', ') : ''} ${hidden.length ? 'ALLOWED BUT NO LINK: ' + hidden.join(', ') : ''}`); }
  else console.log(`ok ${href}`);
}
console.log(problems ? `\n${problems} page(s) need attention` : '\nEvery simple guard matches the menu.');
