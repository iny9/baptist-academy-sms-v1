// "View the system as one of my roles". The choice is kept in a cookie as { scope: role }.
//   scope '*'                       every module
//   scope '/admin/payments'         one module
//   scope '/admin/payments#fees'    a sub-module (a tab inside a page), or a deeper path such as '/admin/results/<term>/<student>'
// The most specific scope wins; the value 'all' means "all my roles". The database re-checks the choice on every request
// (header x-active-role): it can only narrow what the user may do, never widen it.
export const VIEW_COOKIE = 'ba_view';
import { navFor } from './nav.js';
const ROLE = /^[a-z_]{3,20}$/;

// Can this role open this page at all? Uses the same menu table that decides the links, matching the most specific menu page
// (so /admin/students/match is judged on its own, not as part of /admin/students). Pages outside the menu are left to the page itself.
const ALL_ROLES = ['admin', 'exam_officer', 'class_teacher', 'subject_teacher', 'principal', 'headmaster', 'board_member', 'bursar', 'parent'];
const hrefCache = new Map();
const hrefsOf = (r) => { let s = hrefCache.get(r); if (!s) { s = new Set(navFor([r]).flatMap((g) => g.items.map((i) => i.href))); hrefCache.set(r, s); } return s; };
export function viewAllows(role, path) {
  const p = String(path ?? '').split(/[?#]/)[0];
  if (!p || p === '/admin') return true;
  let best = '';
  for (const r of ALL_ROLES) for (const h of hrefsOf(r)) if ((p === h || p.startsWith(h + '/')) && h.length > best.length) best = h;
  return !best || best === '/admin' ? true : hrefsOf(role).has(best);
}

// A person who is a PARENT and also holds another role acts as a parent only, until they choose the other role. This keeps every other family's
// children out of sight (pages, lists, reports) unless the staff role that allows it is picked on purpose. The database applies the same rule in active_role().
export const parentMix = (names) => { const s = new Set(names); return s.has('parent') && [...s].some((r) => r !== 'parent'); };

export function parseView(raw) {
  try { const v = JSON.parse(decodeURIComponent(raw ?? '')); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch { return {}; }
}
export const moduleOf = (path) => { const m = String(path ?? '').split(/[?#]/)[0].match(/^\/admin(?:\/[^/]+)?/); return m ? m[0] : '/admin'; };

// Role to act as for this scope, or null for "all my roles"
export function resolveView(map, scope) {
  const keys = [];
  let s = String(scope ?? '').split('?')[0];
  if (s) {
    keys.push(s);
    const base = s.split('#')[0];
    if (base !== s) keys.push(base);
    let parts = base.split('/').filter(Boolean);
    while (parts.length > 2) { parts = parts.slice(0, -1); keys.push('/' + parts.join('/')); }
  }
  keys.push('*');
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(map, k)) {
      const v = map[k];
      if (v === 'all' || !ROLE.test(String(v))) return null;
      // a choice made in a neighbouring module must never lock the person out of a page that role cannot open
      return viewAllows(v, scope) ? v : null;
    }
  }
  return null;
}

export const readCookie = (name) => {
  if (typeof document === 'undefined') return '';
  const hit = document.cookie.split('; ').find((c) => c.startsWith(name + '='));
  return hit ? hit.slice(name.length + 1) : '';
};
export function writeView(map) {
  const clean = Object.fromEntries(Object.entries(map).filter(([k, v]) => k.length < 200 && (v === 'all' || ROLE.test(String(v)))));
  document.cookie = `${VIEW_COOKIE}=${encodeURIComponent(JSON.stringify(clean))}; path=/; max-age=31536000; samesite=lax${location.protocol === 'https:' ? '; secure' : ''}`;
}
