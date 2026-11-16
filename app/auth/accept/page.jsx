'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AuthShell from '@/components/AuthShell';
import { supabaseBrowser } from '@/lib/supabase-browser';
import Notice from '@/components/Notice';

// Supabase's default invitation email returns the user here with the login tokens after a "#".
// The server never sees that part of the address, so this page reads it in the browser.
export default function Accept() {
  const router = useRouter(); const [err, setErr] = useState('');
  useEffect(() => {
    (async () => {
      const h = new URLSearchParams(window.location.hash.slice(1));
      const at = h.get('access_token'), rt = h.get('refresh_token');
      if (h.get('error_description') || !at || !rt) return setErr('This link is invalid or has expired. Ask the admin to send a new invitation.');
      const { error } = await supabaseBrowser().auth.setSession({ access_token: at, refresh_token: rt });
      if (error) return setErr('This link is invalid or has expired. Ask the admin to send a new invitation.');
      window.history.replaceState(null, '', window.location.pathname);   // remove tokens from the address bar and history
      router.replace('/reset-password');
    })();
  }, [router]);
  return (<AuthShell><div className="panel" style={{ maxWidth: 400 }}>
    {err ? <><Notice notice={{ tone: 'warn', kind: 'auth', title: 'That link has expired', body: err, hint: '' }} /><p><a href="/login">Go to sign in</a></p></> : <p>Signing you in…</p>}</div></AuthShell>);
}
