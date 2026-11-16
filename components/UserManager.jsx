'use client';
import { useDeferredValue, useMemo, useState } from 'react';
import Notice from '@/components/Notice';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase-browser';
import Icon from './Icon';
import { cleanText, isPhone } from '@/lib/validate';
import { passwordProblem } from '@/lib/accounts';

const ROLES = [['admin', 'Administrator'], ['exam_officer', 'Exam officer'], ['class_teacher', 'Class teacher / form master'], ['subject_teacher', 'Subject teacher'],
  ['principal', 'Principal'], ['headmaster', 'Headmaster / headmistress'], ['board_member', 'Board member'], ['bursar', 'Bursar'], ['parent', 'Parent / guardian']];
const LABEL = Object.fromEntries(ROLES);
const SECTIONAL = ['exam_officer', 'class_teacher', 'subject_teacher', 'principal', 'headmaster'];
const FIXED = { principal: 'secondary', headmaster: 'basic' };
const SEC = { basic: 'Basic', secondary: 'Secondary' };
const TEACHING = ['class_teacher', 'subject_teacher', 'exam_officer', 'principal', 'headmaster'];
const WARN = { class_teacher: 'This also removes them as the form master / class teacher of any class they lead in that section.', subject_teacher: 'This also removes their subject assignments in that section.',
  parent: 'This also removes the links between them and their children.', admin: 'They will lose all admin privileges.' };

export default function UserManager({ users, me }) {
  const sb = supabaseBrowser(); const router = useRouter();
  const [q, setQ] = useState(''); const [open, setOpen] = useState(null); const [msg, setMsg] = useState(null);
  const [newRole, setNewRole] = useState('exam_officer'); const [newSection, setNewSection] = useState('basic');
  const dq = useDeferredValue(q);
  const shown = useMemo(() => users.filter((u) => !dq || `${u.full_name ?? ''} ${u.username ?? ''} ${u.email} ${u.contact_email ?? ''}`.toLowerCase().includes(dq.toLowerCase())), [users, dq]);
  const ok = (m) => { setMsg({ ok: true, m }); router.refresh(); };
  const fail = (e) => setMsg({ ok: false, m: e.message });

  async function saveDetails(e, u) {
    e.preventDefault(); const f = new FormData(e.target); const phone = String(f.get('phone')).trim() || null;
    if (phone && !isPhone(phone)) return fail({ message: 'Enter a valid phone number, for example 08012345678.' });
    const ce = String(f.get('cemail') ?? '').trim().toLowerCase() || null;
    if (ce && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ce)) return fail({ message: 'Enter a valid email address, or leave it empty.' });
    const { error } = await sb.from('profiles').update({ full_name: cleanText(f.get('name'), 120) || null, phone, contact_email: ce }).eq('id', u.id); error ? fail(error) : ok('Details saved.');
  }
  async function addRole(u) {
    const section = SECTIONAL.includes(newRole) ? (FIXED[newRole] ?? newSection) : null;
    const { error } = await sb.from('user_roles').insert({ user_id: u.id, role: newRole, section });
    error ? fail(/duplicate/.test(error.message) ? { message: 'They already have that role.' } : error) : ok(`${LABEL[newRole]} role added.`);
  }
  async function setParent(u, on) {
    if (!on && !confirm(`Remove the parent role from ${u.full_name ?? u.email}? This also removes the links between them and their children.`)) return;
    const { error } = await sb.rpc('set_teacher_as_parent', { p_user: u.id, p_on: on });
    error ? fail(error) : ok(on ? 'Now also a parent/guardian. You can match them to their children on the Match students to parents page.' : 'Parent role removed.');
  }
  async function changeSection(r, section) {
    const { error } = await sb.from('user_roles').update({ section }).eq('id', r.id); error ? fail(/duplicate/.test(error.message) ? { message: 'They already have that role in that section.' } : error) : ok('Section changed.');
  }
  async function removeRole(u, r) {
    if (!confirm(`Remove the ${LABEL[r.role]} role from ${u.full_name ?? u.email}? ${WARN[r.role] ?? ''}`)) return;
    const { error } = await sb.from('user_roles').delete().eq('id', r.id); error ? fail(error) : ok('Role removed.');
  }
  async function resetPassword(e, u) {
    e.preventDefault(); const f = new FormData(e.target); const typed = String(f.get('newpw') ?? '');
    const pe = typed ? passwordProblem(typed, u.username) : null; if (pe) return fail({ message: pe });
    if (!confirm(`Set a new password for ${u.full_name ?? u.username}?${typed ? '' : ' (a new one will be made for you)'}`)) return;
    const res = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reset_password', user_id: u.id, password: typed || null, must_change: f.get('mustchange') === 'on' }) }); const j = await res.json().catch(() => ({}));
    if (res.ok) { e.target.reset(); ok(`Done. ${j.username} now signs in with the password ${j.password}${j.must_change ? ' and must choose a new one at the next sign-in' : ''}. Write it down now: it is not shown again.`); }
    else fail({ message: j.error || 'Could not reset.' });
  }
  async function deleteUser(u) {
    if (!confirm(`Permanently delete the account of ${u.full_name ?? u.email}? They can no longer sign in. This cannot be undone.`)) return;
    const res = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', user_id: u.id }) }); const j = await res.json();
    res.ok ? (setOpen(null), ok('User deleted.')) : fail({ message: j.error });
  }

  return (<>
    {msg && <Notice msg={msg} onClose={() => setMsg(null)} />}
    <label htmlFor="uq">Search users</label><input id="uq" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, username or email" style={{ maxWidth: 360 }} />
    <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
      {shown.map((u) => (<div className="panel" key={u.id} style={{ padding: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <div style={{ minWidth: 220 }}><strong>{u.full_name ?? u.username ?? u.email}</strong>{u.id === me && <span className="badge gold" style={{ marginLeft: 6 }}>You</span>}<div className="auth-hint">{u.username ? <>Username: <code>{u.username}</code></> : u.email}{u.contact_email ? ` · ${u.contact_email}` : u.username ? ' · no email on record' : ''}{u.phone ? ` · ${u.phone}` : ''}</div></div>
          <div style={{ flex: 1 }}>{u.user_roles.length === 0 ? <span className="badge red">No role</span> : u.user_roles.map((r) => <span key={r.id} className="badge" style={{ marginRight: 4 }}>{LABEL[r.role]}{r.section ? ` (${SEC[r.section]})` : ''}</span>)}</div>
          <button className="btn ghost small" onClick={() => { setOpen(open === u.id ? null : u.id); setMsg(null); }}>{open === u.id ? 'Close' : 'Manage'}</button>
        </div>
        {open === u.id && (<div style={{ marginTop: 14, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
          <form className="row" onSubmit={(e) => saveDetails(e, u)}>
            <div><label>Full name</label><input name="name" defaultValue={u.full_name ?? ''} maxLength={120} /></div>
            <div><label>Phone</label><input name="phone" defaultValue={u.phone ?? ''} /></div>
            {u.username && <div><label>Email (optional, used only to reset a forgotten password)</label><input name="cemail" type="email" defaultValue={u.contact_email ?? ''} maxLength={254} /></div>}<button className="btn small">Save details</button></form>
          {u.username && <form className="row" style={{ marginTop: 10 }} onSubmit={(e) => resetPassword(e, u)}>
            <div style={{ minWidth: 220 }}><label>Set a new password (leave empty to make one)</label><input name="newpw" type="text" autoComplete="off" maxLength={72} placeholder="at least 8, with a letter and a number" /></div>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontWeight: 400 }}><input type="checkbox" name="mustchange" defaultChecked style={{ width: 'auto' }} />They choose their own at next sign-in</label>
            <button className="btn ghost small">Set password</button></form>}
          {u.user_roles.some((r) => TEACHING.includes(r.role)) && (
            <div className="panel" style={{ marginTop: 14, padding: 14, background: 'var(--teal-50)' }}>
              <strong>This staff member can also be a parent</strong>
              <p className="auth-hint" style={{ margin: '4px 0 8px' }}>A teacher may have a child in the school. Switch this on and they can be matched to students as a parent or guardian, and see those children’s report cards, without losing any teaching access.</p>
              {u.user_roles.some((r) => r.role === 'parent')
                ? <button className="btn ghost small" onClick={() => setParent(u, false)}>Remove parent role</button>
                : <button className="btn small" onClick={() => setParent(u, true)}>Also make a parent / guardian</button>}
            </div>)}
          <h3 style={{ marginTop: 18 }}>Roles</h3>
          {u.user_roles.length === 0 && <p className="auth-hint">This user has no role, so they cannot enter the portal.</p>}
          <table><tbody>{u.user_roles.map((r) => (<tr key={r.id}><td>{LABEL[r.role]}</td>
            <td>{SECTIONAL.includes(r.role) ? (FIXED[r.role] ? <span className="badge gold">{SEC[FIXED[r.role]]} only</span> :
              <select value={r.section ?? 'basic'} onChange={(e) => changeSection(r, e.target.value)} aria-label="Section" style={{ width: 'auto' }}><option value="basic">Basic</option><option value="secondary">Secondary</option></select>) : <span className="auth-hint">Whole school</span>}</td>
            <td style={{ textAlign: 'right' }}><button className="btn danger small" onClick={() => removeRole(u, r)}>Remove</button></td></tr>))}</tbody></table>
          <div className="row" style={{ marginTop: 12 }}>
            <div><label>Add a role</label><select value={newRole} onChange={(e) => setNewRole(e.target.value)}>{ROLES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
            {SECTIONAL.includes(newRole) && (FIXED[newRole] ? <div><label>Section</label><input disabled value={SEC[FIXED[newRole]]} /></div> :
              <div><label>Section</label><select value={newSection} onChange={(e) => setNewSection(e.target.value)}><option value="basic">Basic</option><option value="secondary">Secondary</option></select></div>)}
            <button className="btn small" onClick={() => addRole(u)}><Icon name="users" size={14} />Add role</button></div>
          <p className="auth-hint">One person can hold several roles; they get the access of all of them. A teacher cannot work across sections, so give a teacher roles in one section only.</p>
          {u.id !== me && <p><button className="btn danger small" onClick={() => deleteUser(u)}>Delete this user</button></p>}
        </div>)}
      </div>))}
      {shown.length === 0 && <div className="empty">No users match.</div>}
    </div>
  </>);
}
