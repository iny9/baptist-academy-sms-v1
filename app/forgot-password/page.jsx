'use client';
import { useState } from 'react';
import Link from 'next/link';
import AuthShell from '@/components/AuthShell';
import { supabaseBrowser } from '@/lib/supabase-browser';
import Notice from '@/components/Notice';
import { isEmail } from '@/lib/validate';
import { loginIdentity } from '@/lib/accounts';

export default function Forgot() {
  const [sent, setSent] = useState(false); const [err, setErr] = useState(null); const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setErr(null);
    const who = loginIdentity(new FormData(e.target).get('login'));
    if (!who) return setErr({ message: 'Enter your username (for example adaeze.o) or, for administrators, your email address.' });
    setBusy(true);
    try {
      if (who.kind === 'email') {
        // administrators: Supabase emails a reset link
        const { error } = await supabaseBrowser().auth.resetPasswordForEmail(who.email, { redirectTo: `${window.location.origin}/auth/callback?next=/reset-password` });
        // Only a connection or server problem is reported; "unknown email" looks the same as success (prevents account enumeration)
        if (error && (error.status === 0 || error.status >= 500 || /fetch|network/i.test(error.message))) return setErr(error);
      } else {
        // everyone else: the server emails a new password to the address on record
        const res = await fetch('/api/forgot-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: who.username }) });
        if (!res.ok) return setErr({ message: 'Something went wrong. Please try again.' });
      }
      setSent(true);
    } catch (x) { setErr(x); } finally { setBusy(false); }
  }
  return (
    <AuthShell>
      <form onSubmit={submit}>
        <h1>Reset password</h1>
        {sent ? <Notice notice={{ tone: 'ok', kind: 'ok', title: 'Check your inbox', body: 'If that account is registered and has an email address on record, a link to set a new password is on its way.', hint: 'It can take a few minutes. Look in spam too. No email on record? Ask the administrator to reset your password.' }} /> : (<>
          <label htmlFor="login">Username (administrators: email)</label>
          <input id="login" name="login" type="text" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={254} required />
          {err && <Notice error={err} key={String(err.message)} />}
          <p><button className="btn" disabled={busy} style={{ width: '100%' }}>{busy ? 'Sending…' : 'Email me a reset link'}</button></p>
        </>)}
        <p><Link href="/login">Back to sign in</Link></p>
      </form>
    </AuthShell>
  );
}
