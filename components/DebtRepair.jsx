'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Notice from '@/components/Notice';
import { supabaseBrowser } from '@/lib/supabase-browser';

// Shown to the admin and bursar only when a student's brought-forward balance and the debt records disagree.
export default function DebtRepair({ problems }) {
  const sb = supabaseBrowser(); const router = useRouter(); const [msg, setMsg] = useState(null); const [busy, setBusy] = useState(false);
  async function repair() {
    setBusy(true); const { data, error } = await sb.rpc('repair_debt_records'); setBusy(false);
    if (error) return setMsg({ ok: false, m: error.message });
    setMsg({ ok: true, m: `${data} debt record(s) put right.` }); router.refresh();
  }
  return (<div className="panel" style={{ marginBottom: 16 }}>
    {msg && <Notice msg={msg} onClose={() => setMsg(null)} />}
    <strong>{problems.length} debt record(s) do not match the student's balance brought forward.</strong>
    <ul style={{ margin: '8px 0' }}>{problems.slice(0, 8).map((p, i) => <li key={i}>{p.student_name}: {p.problem}</li>)}</ul>
    <button className="btn" disabled={busy} onClick={repair}>{busy ? 'Repairing' : 'Repair debt records'}</button>
  </div>);
}
