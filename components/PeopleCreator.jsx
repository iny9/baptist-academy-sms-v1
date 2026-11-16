'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CREATABLE, SECTIONAL, FIXED_SECTION, ROLE_LABEL_SHORT, parseLine, cleanEmail, cleanUsername, passwordProblem, normalizeRoles, nameLetters } from '@/lib/accounts';
import { csvSafe } from '@/lib/validate';
import RecordFrame from './RecordFrame';

const SEC = { basic: 'Basic', secondary: 'Secondary' };
const BATCH = 25;

// Letters and digits without look-alikes; always at least one of each. Uses the browser's secure random numbers.
function makePassword(len = 10) {
  const L = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ', D = '23456789', all = L + D;
  const rnd = (n) => { const x = new Uint32Array(1); crypto.getRandomValues(x); return x[0] % n; };
  const chars = [L[rnd(L.length)], D[rnd(D.length)]];
  while (chars.length < len) chars.push(all[rnd(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) { const j = rnd(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join('');
}
const suggestUsername = (name) => { const r = new Uint32Array(1); crypto.getRandomValues(r); return nameLetters(name) + String(100 + (r[0] % 900)); };
const rolesText = (roles) => (roles ?? []).map((r) => ROLE_LABEL_SHORT[r.role] + (r.section ? ` (${SEC[r.section]})` : '')).join(', ');

// The administrator chooses a username and a password and ticks every role the person holds.
// The email is optional (it is only used to send a "set a new password" link if the person forgets theirs; they can also add it later on their profile).
export default function PeopleCreator() {
  const router = useRouter();
  const [picked, setPicked] = useState({});                       // { role: true }
  const [sections, setSections] = useState({});                   // { role: 'basic' | 'secondary' }
  const [name, setName] = useState(''); const [username, setUsername] = useState(''); const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false); const [mustChange, setMustChange] = useState(true);
  const [bulk, setBulk] = useState('');
  const [busy, setBusy] = useState(false); const [progress, setProgress] = useState('');
  const [out, setOut] = useState(null); const [err, setErr] = useState('');

  const chosen = useMemo(() => CREATABLE.filter((r) => picked[r]).map((r) => ({ role: r, section: SECTIONAL.includes(r) ? (FIXED_SECTION[r] ?? sections[r] ?? 'basic') : null })), [picked, sections]);
  const roleCheck = useMemo(() => (chosen.length ? normalizeRoles(chosen) : { error: '' }), [chosen]);

  const parsed = useMemo(() => bulk.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l, i) => ({ n: i + 1, line: l, ...parseLine(l) })), [bulk]);
  const bad = parsed.filter((p) => p.error);

  async function send(people) {
    setBusy(true); setErr(''); setOut(null); const results = [];
    try {
      for (let i = 0; i < people.length; i += BATCH) {
        setProgress(`Creating accounts ${Math.min(i + BATCH, people.length)} of ${people.length}…`);
        const res = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create', people: people.slice(i, i + BATCH) }) });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) { setErr(j.error || 'The server refused the request.'); break; }
        results.push(...j.results);
      }
    } catch { setErr('You seem to be offline, or the server could not be reached. Anyone already created is listed below; do not add them again.'); }
    setOut(results); setProgress(''); setBusy(false); router.refresh();
    return results;
  }
  async function single(e) {
    e.preventDefault(); setErr('');
    const f = new FormData(e.target); const raw = String(f.get('email') ?? '').trim(); const email = raw ? cleanEmail(raw) : null;
    if (raw && !email) return setErr('That email address is not valid, or leave it empty.');
    const u = cleanUsername(username); if (!u) return setErr('Choose a username: 4-30 characters, lower-case letters, numbers, dot, dash or underscore.');
    const pe = passwordProblem(password, u); if (pe) return setErr(pe);
    if (!chosen.length) return setErr('Tick at least one role.');
    if (roleCheck.error) return setErr(roleCheck.error);
    const results = await send([{ full_name: name, username: u, password, must_change: mustChange, roles: chosen, email }]);
    if (results.every((r) => r.ok)) { setName(''); setUsername(''); setPassword(''); setPicked({}); setSections({}); e.target.reset(); }
  }
  function bulkSend(e) { e.preventDefault(); if (bad.length || !parsed.length) return; send(parsed.map((p) => p.person)); }
  async function onFile(e) { const f = e.target.files?.[0]; if (!f) return; if (f.size > 200000) return setErr('That file is too big (200 KB at most).'); setBulk(await f.text()); e.target.value = ''; }

  function downloadCsv() {
    const rows = [['Full name', 'Roles', 'Username', 'Password', 'Must change at first sign-in', 'Email (optional, for password reset)'], ...out.filter((r) => r.ok).map((r) => [r.full_name, rolesText(r.roles), r.username, r.password, r.must_change ? 'Yes' : 'No', r.email ?? ''])];
    const csv = rows.map((r) => r.map((c) => `"${csvSafe(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'new-user-credentials.csv'; a.click(); URL.revokeObjectURL(a.href);
  }

  return (<div className="panel">
    <h2 style={{ marginTop: 0 }}>Create people</h2>
    <p className="auth-hint">Give each person a <strong>username</strong> and a <strong>password</strong>, and tick <strong>every role</strong> they hold. They sign in with the username and password. An <strong>email address is optional</strong>: if they have one on record they can use “Forgot your password?” to get a link where they set a new password; they can also add or change it on their own profile. Administrators are added separately, below.</p>

    <form onSubmit={single}>
      <div className="row">
        <div style={{ flex: 2, minWidth: 220 }}><label htmlFor="pn">Full name</label><input id="pn" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required placeholder="e.g. Adaeze Okonkwo" /></div>
        <div style={{ flex: 2, minWidth: 220 }}><label htmlFor="pu">Username</label>
          <input id="pu" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} maxLength={30} required autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="off" placeholder="e.g. adaeze.o" />
          <button type="button" className="btn ghost small" style={{ marginTop: 4 }} onClick={() => setUsername(suggestUsername(name))}>Suggest one from the name</button></div>
        <div style={{ flex: 2, minWidth: 220 }}><label htmlFor="pw">Password</label>
          <input id="pw" type={showPw ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} maxLength={72} required autoComplete="new-password" placeholder="at least 8, with a letter and a number" />
          <button type="button" className="btn ghost small" style={{ marginTop: 4 }} onClick={() => { setPassword(makePassword()); setShowPw(true); }}>Make a password</button>{' '}
          <button type="button" className="btn ghost small" style={{ marginTop: 4 }} onClick={() => setShowPw(!showPw)}>{showPw ? 'Hide' : 'Show'}</button></div>
      </div>
      <div className="row">
        <div style={{ flex: 2, minWidth: 240 }}><label htmlFor="pe">Email address (optional, only for forgotten passwords)</label><input id="pe" name="email" type="email" maxLength={254} placeholder="name@example.com" /></div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 400 }}><input type="checkbox" checked={mustChange} onChange={(e) => setMustChange(e.target.checked)} style={{ width: 'auto' }} />Ask them to choose their own password at the first sign-in</label>
      </div>

      <fieldset style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 12, marginTop: 12 }}>
        <legend style={{ fontWeight: 700, padding: '0 6px' }}>Roles (tick all that apply)</legend>
        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
          {CREATABLE.map((r) => (<div key={r} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontWeight: 400, margin: 0 }}>
              <input type="checkbox" checked={!!picked[r]} onChange={(e) => setPicked({ ...picked, [r]: e.target.checked })} style={{ width: 'auto' }} />{ROLE_LABEL_SHORT[r]}</label>
            {picked[r] && SECTIONAL.includes(r) && (FIXED_SECTION[r]
              ? <span className="badge gold">{SEC[FIXED_SECTION[r]]} only</span>
              : <select aria-label={`${ROLE_LABEL_SHORT[r]} section`} value={sections[r] ?? 'basic'} onChange={(e) => setSections({ ...sections, [r]: e.target.value })} style={{ width: 'auto' }}><option value="basic">Basic</option><option value="secondary">Secondary</option></select>)}
          </div>))}
        </div>
        {roleCheck.error && <div className="msg err" role="alert" style={{ marginTop: 8 }}>{roleCheck.error}</div>}
        <p className="auth-hint" style={{ marginBottom: 0 }}>A person can be, for example, an exam officer <em>and</em> a subject teacher <em>and</em> a parent. They get the access of all their roles. A class or subject teacher works in one section only.</p>
      </fieldset>
      <p><button className="btn" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button></p>
    </form>

    <details style={{ marginTop: 18 }}>
      <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Create many people at once</summary>
      <form onSubmit={bulkSend} style={{ marginTop: 10 }}>
        <label htmlFor="bk">One person per line: <code>Full name, username, password, roles, email</code>. Join several roles with <code>+</code> and put the section in brackets (<code>exam officer (basic) + parent</code>). Username, password and email may be left empty (keep the commas): a missing username or password is made for you. Passwords cannot contain commas.</label>
        <textarea id="bk" value={bulk} onChange={(e) => setBulk(e.target.value)} rows={8} placeholder={'Adaeze Okonkwo, adaeze.o, School2026, exam officer (basic) + subject teacher (basic) + parent, adaeze@example.com\nChidi Eze, chidi.eze, Maths4all, subject teacher (secondary)\nMrs Bello, , , bursar\nAmina Yusuf, amina.y, Welcome2026, parent, amina@example.com'} />
        <p><input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={onFile} aria-label="Load a CSV or text file" style={{ maxWidth: 320 }} /> <span className="auth-hint">or paste from a spreadsheet (columns: name, username, password, roles, email).</span></p>
        {parsed.length > 0 && <p className="auth-hint">{parsed.length} line(s) read{bad.length ? `, ${bad.length} need fixing:` : ', all good.'}</p>}
        {bad.slice(0, 10).map((p) => <div key={p.n} className="msg err">Line {p.n}: {p.error}</div>)}
        {bad.length > 10 && <div className="msg err">…and {bad.length - 10} more.</div>}
        <p className="auth-hint">People created from a list are asked to choose their own password at the first sign-in.</p>
        <p><button className="btn" disabled={busy || !parsed.length || bad.length > 0}>{busy ? progress || 'Creating…' : `Create ${parsed.length || ''} account(s)`}</button></p>
      </form>
    </details>

    {err && <div className="msg err" role="alert" style={{ marginTop: 12 }}>{err}</div>}
    {out && <div style={{ marginTop: 16 }}>
      <h3>Result: {out.filter((r) => r.ok).length} created{out.some((r) => !r.ok) ? `, ${out.filter((r) => !r.ok).length} not created` : ''}</h3>
      {out.some((r) => r.ok) && <><p className="auth-hint">This is the only time the passwords are shown. Give each person their username and password privately.</p>
        <p><button type="button" className="btn small" onClick={downloadCsv}>Download list (CSV)</button> <button type="button" className="btn ghost small" onClick={() => window.print()}>Print</button></p></>}
      <RecordFrame noun="users" head={<thead><tr><th>Name</th><th>Roles</th><th>Username</th><th>Password</th><th>Email</th></tr></thead>}>
        {out.map((r, i) => r.ok
          ? <tr key={i}><td>{r.full_name}</td><td>{rolesText(r.roles)}</td><td><code>{r.username}</code></td><td><code>{r.password}</code>{r.must_change ? <div className="auth-hint">changes it at first sign-in</div> : null}</td><td className="auth-hint">{r.email || 'none'}</td></tr>
          : <tr key={i}><td>{r.full_name}</td><td colSpan={4} style={{ color: 'var(--red, #b3261e)' }}>{r.error}</td></tr>)}
      </RecordFrame></div>}
  </div>);
}
