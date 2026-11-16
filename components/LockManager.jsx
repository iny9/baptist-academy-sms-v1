'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Notice from '@/components/Notice';
import Icon from './Icon';
import { supabaseBrowser } from '@/lib/supabase-browser';
import RecordFrame from './RecordFrame';

const SEC = { basic: 'Basic', secondary: 'Secondary' };

export default function LockManager({ years, terms, locks, current = null }) {
  const sb = supabaseBrowser(); const router = useRouter();
  const [scope, setScope] = useState('term'); const [term, setTerm] = useState(terms.some((t) => t.id === current?.id) ? current.id : terms[0]?.id ?? ''); const [year, setYear] = useState(years.some((y) => y.id === current?.year_id) ? current.year_id : years[0]?.id ?? '');
  const [section, setSection] = useState(''); const [reason, setReason] = useState(''); const [msg, setMsg] = useState(null); const [busy, setBusy] = useState(false);
  const yearName = (id) => years.find((y) => y.id === id)?.name ?? '';
  const target = scope === 'term' ? term : year;
  const secLabel = section ? `${SEC[section]} section` : 'both sections';
  const byYear = useMemo(() => years.map((y) => [y, terms.filter((t) => t.year_id === y.id).sort((a, b) => a.number - b.number)]), [years, terms]);

  async function run(p_scope, p_target, p_section, p_locked, label) {
    const what = p_locked ? 'Lock' : 'Unlock';
    if (!confirm(p_locked
      ? `Lock ${label}?\n\nNo scores, attendance, ratings or subject settings can be changed for it afterwards. It can still be viewed and downloaded, and you can unlock it later.`
      : `Unlock ${label}?\n\nScores, attendance and ratings can be edited again.`)) return;
    setBusy(true);
    const { data, error } = await sb.rpc('set_results_lock', { p_scope, p_target, p_section, p_locked, p_reason: p_locked ? (reason || null) : null });
    setBusy(false);
    if (error) return setMsg({ ok: false, m: error.message });
    const r = data ?? {};
    const parts = p_locked
      ? [`${r.locked} term-and-section${r.locked === 1 ? '' : 's'} locked`, r.already_locked ? `${r.already_locked} already locked` : '', r.no_results ? `${r.no_results} skipped because no results were entered yet` : '']
      : [`${r.unlocked} term-and-section${r.unlocked === 1 ? '' : 's'} unlocked`];
    setMsg({ ok: true, m: parts.filter(Boolean).join('; ') + '.' }); router.refresh();
  }

  if (terms.length === 0) return <div className="empty">No terms have been created yet. Add a session and its terms under Sessions, classes, subjects.</div>;
  return (<>
    {msg && <Notice msg={msg} onClose={() => setMsg(null)} />}
    <div className="panel" style={{ marginTop: 16 }}>
      <h3>Lock or unlock</h3>
      <div className="tabs" role="tablist">{[['term', 'One term'], ['session', 'Whole session (all its terms)']].map(([k, l]) => <a key={k} href="#" className={scope === k ? 'on' : ''} onClick={(e) => { e.preventDefault(); setScope(k); }}>{l}</a>)}</div>
      <div className="row">
        {scope === 'term'
          ? <div><label htmlFor="lt">Session and term</label><select id="lt" value={term} onChange={(e) => setTerm(e.target.value)}>{terms.map((t) => <option key={t.id} value={t.id}>{yearName(t.year_id)}, Term {t.number}</option>)}</select></div>
          : <div><label htmlFor="ly">Session</label><select id="ly" value={year} onChange={(e) => setYear(e.target.value)}>{years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}</select></div>}
        <div><label htmlFor="ls">Section</label><select id="ls" value={section} onChange={(e) => setSection(e.target.value)}><option value="">Both sections</option><option value="basic">Basic section only</option><option value="secondary">Secondary section only</option></select></div>
        <div style={{ flex: 1 }}><label htmlFor="lr">Note (optional)</label><input id="lr" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Results approved by the board" /></div>
      </div>
      <p style={{ marginTop: 12 }}>
        <button className="btn danger" disabled={busy || !target} onClick={() => run(scope, target, section || null, true, `${scope === 'term' ? 'this term' : 'every term of this session'} for ${secLabel}`)}><Icon name="lock" size={15} />Lock for {secLabel}</button>{' '}
        <button className="btn ghost" disabled={busy || !target} onClick={() => run(scope, target, section || null, false, `${scope === 'term' ? 'this term' : 'every term of this session'} for ${secLabel}`)}>Unlock</button></p>
      <p className="auth-hint">A term can only be locked once results have been entered for that section. In a whole-session lock, terms with no results yet are skipped, so a term that has not started stays open for entries.</p>
    </div>

    <h2 style={{ marginTop: 28 }}>Current state</h2>
    {byYear.map(([y, ts]) => ts.length > 0 && (<div key={y.id} style={{ marginBottom: 18 }}>
      <h3 style={{ marginBottom: 6 }}>{y.name}</h3>
      <div style={{ overflowX: 'auto' }}><RecordFrame noun="terms" head={<thead><tr><th>Term</th><th>Basic</th><th>Secondary</th></tr></thead>}>{ts.map((t) => (<tr key={t.id}><td>Term {t.number}</td>
          {['basic', 'secondary'].map((s) => { const l = locks.find((x) => x.term_id === t.id && x.section === s); return (<td key={s}>{l
            ? <><span className="badge red">Locked</span> <span className="auth-hint">{new Date(l.locked_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}{l.reason ? ` · ${l.reason}` : ''}</span>{' '}
              <button className="btn ghost small" disabled={busy} onClick={() => run('term', t.id, s, false, `${y.name}, Term ${t.number} (${SEC[s]})`)}>Unlock</button></>
            : <span className="badge green">Open for entries</span>}</td>); })}</tr>))}</RecordFrame></div></div>))}
  </>);
}
