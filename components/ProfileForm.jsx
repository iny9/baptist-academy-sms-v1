'use client';
import { useState } from 'react';
import Notice from '@/components/Notice';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase-browser';

export default function ProfileForm({ profile, force = false }) {
  const sb = supabaseBrowser(); const router = useRouter(); const [msg, setMsg] = useState(null);
  const show = (ok, m) => setMsg({ ok, m });
  async function saveInfo(e) {
    e.preventDefault(); const f = new FormData(e.target); const file = f.get('avatar'); let avatar_url = profile.avatar_url;
    try {
      const phone = String(f.get('phone')).trim() || null;
      if (phone && !/^[0-9+() -]{7,20}$/.test(phone)) throw new Error('Enter a valid phone number.');
      if (file?.size) {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 1024 * 1024) throw new Error('Photo must be JPG, PNG or WebP under 1 MB.');
        const path = `${profile.id}/avatar-${Date.now()}.${file.type.split('/')[1]}`;
        const up = await sb.storage.from('avatars').upload(path, file); if (up.error) throw up.error;
        avatar_url = sb.storage.from('avatars').getPublicUrl(path).data.publicUrl;
      }
      const ce = String(f.get('cemail') ?? '').trim().toLowerCase() || null;
      if (ce && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ce)) throw new Error('Enter a valid email address, or leave it empty.');
      const g = ['male', 'female'].includes(f.get('gender')) ? f.get('gender') : null;
      const { error } = await sb.from('profiles').update({ full_name: String(f.get('name')).trim().slice(0, 120), phone, avatar_url, contact_email: ce, gender: g }).eq('id', profile.id);
      if (error) throw error; show(true, 'Profile saved.'); router.refresh();
    } catch (err) { show(false, err.message); }
  }
  async function changePassword(e) {
    e.preventDefault(); const f = new FormData(e.target); const pw = String(f.get('new'));
    if (pw.length < 10 || !/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return show(false, 'Use at least 10 characters with letters and numbers.');
    if (profile.username && pw.toLowerCase().includes(profile.username)) return show(false, 'Your password must not contain your username.');
    if (pw !== f.get('confirm')) return show(false, 'The two passwords do not match.');
    const check = await sb.auth.signInWithPassword({ email: profile.email, password: String(f.get('current')) });
    if (check.error) return show(false, 'Your current password is incorrect.');
    const { error } = await sb.auth.updateUser({ password: pw });
    if (error) return show(false, error.message);
    e.target.reset();
    if (profile.must_change_password) {
      const { error: fe } = await sb.from('profiles').update({ must_change_password: false }).eq('id', profile.id);
      if (fe) return show(false, 'Your password was changed, but your account could not be unlocked. Please tell the school office.');
    }
    show(true, 'Password changed.'); router.refresh();
  }
  return (<>
    {force && <div className="msg err" role="alert"><strong>Please choose your own password now.</strong> You are using a password the school gave you or the system sent you. Use “Change password” below; the rest of the portal opens after that.</div>}
    {msg && <Notice msg={msg} onClose={() => setMsg(null)} />}
    <form className="panel" onSubmit={saveInfo}>
      {profile.avatar_url && <img src={profile.avatar_url} alt="Your photo" width="80" height="80" style={{ borderRadius: '50%', objectFit: 'cover' }} />}
      <label htmlFor="n">Full name</label><input id="n" name="name" defaultValue={profile.full_name ?? ''} maxLength={120} />
      {profile.username
        ? <><label htmlFor="e">Username (you sign in with this)</label><input id="e" value={profile.username} disabled />
            <label htmlFor="ce">Email address (optional: add one so you can reset a forgotten password yourself)</label><input id="ce" name="cemail" type="email" defaultValue={profile.contact_email ?? ''} maxLength={254} placeholder="you@example.com" /></>
        : <><label htmlFor="e">Email (you sign in with this)</label><input id="e" value={profile.email} disabled /></>}
      <label htmlFor="g">Gender</label><select id="g" name="gender" defaultValue={profile.gender ?? ''}><option value="">Not set</option><option value="male">Male</option><option value="female">Female</option></select>
      <label htmlFor="p">Phone number</label><input id="p" name="phone" type="tel" defaultValue={profile.phone ?? ''} />
      <label htmlFor="a">Profile picture (JPG, PNG, WebP, max 1 MB)</label><input id="a" name="avatar" type="file" accept="image/jpeg,image/png,image/webp" />
      <p><button className="btn">Save profile</button></p></form>
    <form className="panel" style={{ marginTop: 20 }} onSubmit={changePassword}>
      <h3>Change password</h3>
      <label htmlFor="c">Current password</label><input id="c" name="current" type="password" autoComplete="current-password" required />
      <label htmlFor="w">New password</label><input id="w" name="new" type="password" autoComplete="new-password" required />
      <label htmlFor="x">Confirm new password</label><input id="x" name="confirm" type="password" autoComplete="new-password" required />
      <p><button className="btn">Change password</button></p></form></>);
}
