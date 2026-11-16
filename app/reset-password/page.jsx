'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import AuthShell from '@/components/AuthShell';
import { supabaseBrowser } from '@/lib/supabase-browser';
import Notice from '@/components/Notice';

export default function SetPassword() {
  const router = useRouter();
  const [err, setErr] = useState(null); const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    const f = new FormData(e.target);
    const pw = String(f.get('password'));
    if (pw.length < 10 || !/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return setErr({ message: 'Use at least 10 characters with letters and numbers.' });
    if (pw !== f.get('confirm')) return setErr({ message: 'The two passwords do not match.' });
    if (pw.length > 200) return setErr({ message: 'That password is too long.' });
    setBusy(true);
    try {
      const sb = supabaseBrowser();
      const { data, error } = await sb.auth.updateUser({ password: pw });
      if (error) return setErr(/same|different/i.test(error.message) ? { message: 'Choose a password you have not used before.' } : /weak|pwned|easy/i.test(error.message) ? { message: 'That password is too easy to guess. Try a longer one.' } : error);
      // they chose this password themselves, so the "must change your password" lock is lifted
      if (data?.user?.id) await sb.from('profiles').update({ must_change_password: false }).eq('id', data.user.id);
      router.replace('/admin');
    } catch (x) { setErr(x); } finally { setBusy(false); }
  }
  return (
    <AuthShell>
      <form onSubmit={submit}>
        <h1>Choose a new password</h1>
        <label htmlFor="password">New password</label>
        <input id="password" name="password" type="password" autoComplete="new-password" required />
        <label htmlFor="confirm">Confirm password</label>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
        {err && <Notice error={err} key={String(err.message)} />}
        <p><button className="btn" disabled={busy} style={{ width: '100%' }}>{busy ? 'Saving…' : 'Save password'}</button></p>
      </form>
    </AuthShell>
  );
}
