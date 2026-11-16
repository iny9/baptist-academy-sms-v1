import { createBrowserClient } from '@supabase/ssr';
import { VIEW_COOKIE, parseView, resolveView, readCookie } from '@/lib/active-role';

let client;
// One shared client (cheaper than creating one per call). Every request gets a time limit, and a dead connection
// becomes a clear "network_offline" error instead of an empty answer that looks like a wrong password.
const guardedFetch = async (input, init = {}) => {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new TypeError('network_offline');
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 30000);
  // The role the person picked for this module or tab (window.__baScope is set by a tab's own role picker). Data requests only.
  let headers = init.headers;
  try {
    const url = typeof input === 'string' ? input : input?.url ?? '';
    if (url.includes('/rest/v1/') && typeof window !== 'undefined') {
      const role = resolveView(parseView(readCookie(VIEW_COOKIE)), window.__baScope || window.location.pathname);
      if (role) { headers = new Headers(init.headers); headers.set('x-active-role', role); }
    }
  } catch { /* never block a request because of the picker */ }
  try { return await fetch(input, { ...init, headers, signal: init.signal ?? ctl.signal }); }
  catch (e) { throw e?.name === 'AbortError' ? new TypeError('request timed out') : e; }
  finally { clearTimeout(t); }
};
export const supabaseBrowser = () => (client ??= createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { global: { fetch: guardedFetch } }));
