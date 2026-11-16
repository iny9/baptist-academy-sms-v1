import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies, headers } from 'next/headers';
import { cache } from 'react';
import { VIEW_COOKIE, parseView, resolveView, parentMix } from '@/lib/active-role';
import { pickCurrentTerm } from '@/lib/current-term';

// The role the person chose to act as in the module they are in (null = all their roles)
export function viewRole() {
  return resolveView(parseView(cookies().get(VIEW_COOKIE)?.value), headers().get('x-ba-scope') ?? '');
}

const noStore = (url, init) => fetch(url, { ...init, cache: 'no-store' });

export function supabaseServer() {
  const store = cookies();
  const role = viewRole();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    // The database applies the same narrowing in its row-level-security rules (header x-active-role)
    // cache: 'no-store' so Next never serves an old copy of a table read: report cards and every list always show the latest saved records
    global: { fetch: noStore, ...(role ? { headers: { 'x-active-role': role } } : {}) },
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => { try { list.forEach(({ name, value, options }) => store.set(name, value, options)); } catch {} },
    },
  });
}

// Service-role client: server-only, bypasses RLS. Use ONLY after verifying the caller's role.
export function supabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: noStore },
  });
}

// Who is signed in, and with which roles. cache(): asked once per request even if the layout and the page both call it.
// Inside /admin the middleware has already verified the user with Supabase Auth and passes the identity in private headers
// (it strips them from every other request), so no second network trip is needed. Anywhere else the user is verified here.
export const getSessionRoles = cache(async function getSessionRoles() {
  const sb = supabaseServer();
  const h = headers();
  let user = null;
  const id = h.get('x-ba-user-id');
  if (id) user = { id, email: h.get('x-ba-user-email') ?? '' };
  else { const { data } = await sb.auth.getUser(); user = data?.user ?? null; }
  if (!user) return { user: null, roles: [], allRoles: [], viewing: null };
  const { data } = await sb.from('user_roles').select('role, section').eq('user_id', user.id);   // own rows are always readable
  const allRoles = data ?? [];
  // no valid choice + parent together with another role = act as the parent (same rule as the database's active_role())
  let want = viewRole();
  if ((!want || !allRoles.some((r) => r.role === want)) && parentMix(allRoles.map((r) => r.role))) want = 'parent';
  const narrowed = want && allRoles.some((r) => r.role === want);
  // roles = what the person may do right now in this module; allRoles = everything they hold (for the sidebar and the role picker)
  // Pages: a person may open every page of every role they hold. Records: the database limits them to the acting role (a parent who holds other roles acts as a parent first),
  // so a page of another role opens but shows only what the acting role may see until that role is chosen.
  const chosen = !!viewRole() && allRoles.some((r) => r.role === viewRole());
  return { user, roles: chosen ? allRoles.filter((r) => r.role === viewRole()) : allRoles, allRoles, viewing: narrowed ? want : null };
});

// Cookie-free anon client: lets public pages (landing page) be pre-rendered and cached by Next.js (ISR).
export function supabasePublic() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

// The term running today (see lib/current-term.js): every picker in the portal opens on this session and term.
// cache(): one small read per request, however many components ask.
export const getCurrentTerm = cache(async function getCurrentTerm() {
  const { data } = await supabaseServer().from('terms').select('id,number,year_id,starts_on,is_active');
  const t = pickCurrentTerm(data ?? []);
  return t ? { id: t.id, number: t.number, year_id: t.year_id } : null;
});
