import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';

// Signs the visitor in once per request. The verified identity is passed on to the page in private headers,
// so the layout and the page do not each ask Supabase Auth again (that was an extra network trip per page).
// For /api the headers are always removed, so a caller can never fake them.
const H_ID = 'x-ba-user-id', H_MAIL = 'x-ba-user-email', H_SCOPE = 'x-ba-scope';

export async function middleware(request) {
  // Cross-site writes to /api are refused (CSRF defence in depth)
  if (request.nextUrl.pathname.startsWith('/api') && !['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    const o = request.headers.get('origin');
    if (o && o !== request.nextUrl.origin) return new NextResponse(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'content-type': 'application/json' } });
  }
  const headers = new Headers(request.headers);
  headers.delete(H_ID); headers.delete(H_MAIL); headers.delete(H_SCOPE);
  // Which module the person is looking at (for /api: the page the call came from). Used to apply the "view as" role chosen for that module.
  let scope = request.nextUrl.pathname.startsWith('/admin') ? request.nextUrl.pathname : '';
  if (request.nextUrl.pathname.startsWith('/api')) {
    try { const u = new URL(request.headers.get('referer') ?? ''); if (u.origin === request.nextUrl.origin && u.pathname.startsWith('/admin')) scope = u.pathname; } catch { /* no referer */ }
  }
  if (scope) headers.set(H_SCOPE, scope);
  if (!request.nextUrl.pathname.startsWith('/admin')) return NextResponse.next({ request: { headers } });

  let response = NextResponse.next({ request: { headers } });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        if (list.length) { headers.set('cookie', request.cookies.getAll().map((c) => `${c.name}=${c.value}`).join('; ')); }
        response = NextResponse.next({ request: { headers } });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  let user = null;
  try { user = (await supabase.auth.getUser()).data.user; } catch { /* network trouble: treat as signed out, the login page explains */ }
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = ''; url.searchParams.set('next', request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  headers.set(H_ID, user.id); headers.set(H_MAIL, user.email ?? '');
  const out = NextResponse.next({ request: { headers } });
  response.cookies.getAll().forEach((c) => out.cookies.set(c));
  return out;
}
export const config = { matcher: ['/admin/:path*', '/api/:path*'] };
