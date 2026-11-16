'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import AuthShell from '@/components/AuthShell';
import Notice from '@/components/Notice';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { classify } from '@/lib/errors';
import { safeNext } from '@/lib/validate';
import { loginIdentity } from '@/lib/accounts';

export default function Login() {
  const router = useRouter();
  const params = useSearchParams();
  const [note, setNote] = useState(params.get('error') === 'link'
    ? { tone: 'warn', kind: 'auth', title: 'That link has expired', body: 'The invitation or reset link is invalid or too old.', hint: 'Ask the admin for a new invitation, or use “Forgot your password?”.' } : null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setNote(null);
    const f = new FormData(e.target);
    const who = loginIdentity(f.get('login')), password = String(f.get('password') ?? '').slice(0, 200);
    if (!who) return setNote({ tone: 'warn', kind: 'value', title: 'Check your username', body: 'Enter the username the school gave you (letters and numbers, for example adaeze.o). Administrators use their email address.', hint: '' });
    const email = who.email;
    if (!password) return setNote({ tone: 'warn', kind: 'value', title: 'Enter your password', body: '', hint: '' });
    // No signal? Say so, instead of blaming the password.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return setNote(classify({ message: 'network_offline' }));
    setBusy(true);
    try {
      const { error } = await supabaseBrowser().auth.signInWithPassword({ email, password });
      if (error) {
        // Only a real 400 "invalid credentials" answer from the server means the details are wrong.
        const wrong = error.status === 400 && /invalid/i.test(error.message ?? '');
        setNote(classify(wrong ? { message: 'Invalid login credentials' } : error));
        return;
      }
      router.replace(safeNext(params.get('next')));
      router.refresh();
    } catch (err) { setNote(classify(err)); }
    finally { setBusy(false); }
  }

  return (
    <AuthShell>
      <form onSubmit={submit} noValidate className="login-card">
        <div className="login-head">
          <img src="/logo-96.webp" alt="" width="64" height="64" decoding="async" />
          <p className="login-kicker">WELCOME BACK</p>
          <h1>Sign in to the portal</h1>
          <p>Baptist Academy Jimeta Yola</p>
        </div>
        <div className="login-body">
          <label htmlFor="login">Username or email</label>
          <input id="login" name="login" type="text" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={254} required placeholder="e.g. adaeze.o" />
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" autoComplete="current-password" maxLength={200} required placeholder="Your password" />
          <p className="auth-hint">Administrators sign in with their email address.</p>
          {note && <Notice notice={note} key={note.title + note.body} />}
          <button className="btn login-btn" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
          <div className="login-links"><Link href="/forgot-password">Forgot your password?</Link><Link href="/">Back to website</Link></div>
        </div>
        <p className="login-foot">Secure school portal</p>
      </form>
    </AuthShell>
  );
}
