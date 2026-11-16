'use client';
import { useMemo, useState } from 'react';
import { ROLE_LABEL_SHORT } from '@/lib/accounts';
import { csvSafe } from '@/lib/validate';
import RecordFrame from './RecordFrame';

const SEC = { basic: 'Basic', secondary: 'Secondary' };
const LABEL = { admin: 'Administrator', ...ROLE_LABEL_SHORT };
const ORDER = ['admin', 'principal', 'headmaster', 'board_member', 'bursar', 'exam_officer', 'class_teacher', 'subject_teacher', 'parent'];

// Every user, filterable by role (the slicer), downloadable as CSV or printable.
// Passwords are never listed here: the administrator sees a password only once, when creating or resetting an account. Nobody can read a password afterwards.
export default function UserList({ users }) {
  const [role, setRole] = useState('all'); const [q, setQ] = useState('');
  const counts = useMemo(() => { const c = {}; for (const u of users) for (const r of new Set(u.user_roles.map((x) => x.role))) c[r] = (c[r] ?? 0) + 1; return c; }, [users]);
  const shown = useMemo(() => users.filter((u) => (role === 'all' || u.user_roles.some((r) => r.role === role)) &&
    (!q || `${u.full_name ?? ''} ${u.username ?? ''} ${u.contact_email ?? ''} ${u.email}`.toLowerCase().includes(q.toLowerCase()))), [users, role, q]);
  const roleText = (u) => [...new Set(u.user_roles.map((r) => `${LABEL[r.role] ?? r.role}${r.section ? ` (${SEC[r.section]})` : ''}`))].join(', ');
  const signIn = (u) => u.username ?? u.email;
  const pw = (u) => (!u.username ? 'Signs in with email' : u.must_change_password ? 'Must choose a new one at next sign-in' : 'Set by the user');

  function csv() {
    const rows = [['Full name', 'Role', 'Username / sign-in', 'Password status', 'Email (optional, password reset only)'], ...shown.map((u) => [u.full_name ?? '', roleText(u), signIn(u), pw(u), u.username ? u.contact_email ?? '' : u.email])];
    const text = rows.map((r) => r.map((c) => `"${csvSafe(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
    a.download = `users-${role === 'all' ? 'all' : role}.csv`; a.click(); URL.revokeObjectURL(a.href);
  }
  return (<div className="panel" id="userlist">
    <h2 style={{ marginTop: 0 }}>All users and usernames</h2>
    <div className="noprint" role="group" aria-label="Filter by role" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '8px 0' }}>
      <button type="button" className={'btn small' + (role === 'all' ? '' : ' ghost')} onClick={() => setRole('all')}>All ({users.length})</button>
      {ORDER.filter((r) => counts[r]).map((r) => <button type="button" key={r} className={'btn small' + (role === r ? '' : ' ghost')} onClick={() => setRole(r)} aria-pressed={role === r}>{LABEL[r]} ({counts[r]})</button>)}
    </div>
    <div className="row noprint"><div><label htmlFor="ul-q">Find</label><input id="ul-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, username or email" /></div>
      <button type="button" className="btn" onClick={csv}>Download this list (CSV)</button> <button type="button" className="btn ghost" onClick={() => window.print()}>Print</button></div>
    <p className="auth-hint">{shown.length} shown. Keep this list private: it holds everyone’s sign-in names.</p>
    <RecordFrame noun="users" head={<thead><tr><th>Name</th><th>Role</th><th>Username</th><th>Password</th><th>Email (optional)</th></tr></thead>}>
      {shown.map((u) => (<tr key={u.id}><td>{u.full_name ?? ''}</td><td>{roleText(u)}</td><td><code>{signIn(u)}</code></td><td><span className="auth-hint">{pw(u)}</span></td>
        <td className="auth-hint">{u.username ? u.contact_email ?? 'none on record' : u.email}</td></tr>))}
      {shown.length === 0 && <tr><td colSpan={5}>Nobody matches.</td></tr>}</RecordFrame>
  </div>);
}
