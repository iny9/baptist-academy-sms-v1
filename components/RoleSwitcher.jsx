'use client';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { VIEW_COOKIE, parseView, resolveView, readCookie, writeView, moduleOf, parentMix } from '@/lib/active-role';

const ROLE_LABEL = { admin: 'Administrator', exam_officer: 'Exam officer', class_teacher: 'Class teacher', subject_teacher: 'Subject teacher',
  principal: 'Principal', board_member: 'Board member', bursar: 'Bursar', headmaster: 'Headmaster/Headmistress', parent: 'Parent/Guardian' };

// "View as" picker for people who hold more than one role.
//  - In the portal layout it covers the module you are in: pass `held` and `roleHrefs` (role -> pages that role can open).
//  - Inside a page it can cover one tab or sub-module: pass `tab` ("attendance") and `allowed` (roles that may use that tab).
// Choosing a role narrows what you see AND what you may do: the database applies the same choice (row-level security).
export default function RoleSwitcher({ held, roleHrefs, tab, allowed, label = 'View as' }) {
  const path = usePathname(); const router = useRouter();
  const key = tab ? `${moduleOf(path)}#${tab}` : path.startsWith('/admin') ? (path.split('/').length > 4 ? path : moduleOf(path)) : moduleOf(path);
  // A parent who also holds another role acts as a parent until they choose that role: there is no "all my roles" for them.
  const mixed = parentMix(held ?? []);
  const fallback = mixed ? 'parent' : 'all';
  const [cur, setCur] = useState(fallback);
  useEffect(() => { setCur(resolveView(parseView(readCookie(VIEW_COOKIE)), key) ?? fallback); }, [key, fallback]);
  // a tab's own picker also tells the browser's data requests which scope they belong to
  useEffect(() => {
    if (!tab) return undefined;
    window.__baScope = key;
    return () => { if (window.__baScope === key) delete window.__baScope; };
  }, [key, tab]);

  const mod = moduleOf(path);
  const options = (allowed ?? held).filter((r) => allowed || mod === '/admin' || (roleHrefs?.[r] ?? []).some((h) => mod === h || mod.startsWith(h + '/')));
  if ((held ?? []).length < 2 || (options.length < 2 && !mixed)) return null;

  function pick(value) {
    const map = parseView(readCookie(VIEW_COOKIE));
    map[key] = value; writeView(map); setCur(value); router.refresh();
  }
  return (
    <div className="roleview noprint" role="group" aria-label={label}>
      <strong>{label}</strong>
      <div className="seg">
        {!mixed && <button type="button" className={'btn small ' + (cur === 'all' ? '' : 'ghost')} aria-pressed={cur === 'all'} onClick={() => pick('all')}>All my roles</button>}
        {options.map((r) => <button key={r} type="button" className={'btn small ' + (cur === r ? '' : 'ghost')} aria-pressed={cur === r} onClick={() => pick(r)}>{ROLE_LABEL[r] ?? r}</button>)}
      </div>
      {mixed && cur === 'parent' && <small>You are acting as Parent/Guardian, so only your own children are shown. Choose another role to see other records.</small>}
      {cur !== 'all' && !(mixed && cur === 'parent') && <small>Showing only what {ROLE_LABEL[cur] ?? cur} can see and do{tab ? ' in this tab' : ' here'}.</small>}
    </div>
  );
}
