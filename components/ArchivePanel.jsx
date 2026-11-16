'use client';
import { useState } from 'react';
import Notice from '@/components/Notice';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase-browser';
import Icon from './Icon';

export default function ArchivePanel({ preview }) {
  const sb = supabaseBrowser(); const router = useRouter(); const [msg, setMsg] = useState(null); const [att, setAtt] = useState(5); const [aud, setAud] = useState(3); const [p, setP] = useState(preview);
  async function refresh() { const { data, error } = await sb.rpc('retention_preview', { p_years: att, p_audit_years: aud }); error ? setMsg({ ok: false, m: error.message }) : setP(data); }
  async function run() {
    if (!confirm(`Move attendance and ratings older than ${att} years, and audit entries older than ${aud} years, to the archive tables?`)) return;
    const { data, error } = await sb.rpc('run_retention', { p_years: att, p_audit_years: aud });
    if (error) return setMsg({ ok: false, m: error.message });
    setMsg({ ok: true, m: `Archived ${data.attendance} attendance, ${data.ratings} rating and ${data.audit} audit rows.` }); refresh(); router.refresh();
  }
  return (<>
    {msg && <Notice msg={msg} onClose={() => setMsg(null)} />}
    <div className="panel" style={{ maxWidth: 560 }}>
      <div className="row"><div><label htmlFor="a">Keep attendance and ratings for (years)</label><input id="a" type="number" min="2" max="20" value={att} onChange={(e) => setAtt(Number(e.target.value))} /></div>
        <div><label htmlFor="u">Keep audit log for (years)</label><input id="u" type="number" min="1" max="20" value={aud} onChange={(e) => setAud(Number(e.target.value))} /></div>
        <button className="btn ghost" onClick={refresh}>Check</button></div>
      <div className="stats" style={{ marginTop: 16 }}>
        <div className="stat"><div className="ico"><Icon name="calendar" size={22} /></div><div><div className="n">{p?.attendance ?? '-'}</div><div className="l">Attendance rows</div></div></div>
        <div className="stat"><div className="ico"><Icon name="award" size={22} /></div><div><div className="n">{p?.ratings ?? '-'}</div><div className="l">Rating rows</div></div></div>
        <div className="stat"><div className="ico"><Icon name="shield" size={22} /></div><div><div className="n">{p?.audit ?? '-'}</div><div className="l">Audit rows</div></div></div></div>
      <button className="btn danger" onClick={run}><Icon name="archive" size={16} />Archive these now</button>
      <p className="auth-hint">Rows are copied to archive tables first, then removed from the live tables. Only the admin can read the archives.</p></div></>);
}
