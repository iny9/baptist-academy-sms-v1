'use client';
import { useState } from 'react';
import Notice from '@/components/Notice';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase-browser';
import RecordFrame from './RecordFrame';

export default function RolloverForm({ students, destination }) {
  const router = useRouter(); const [msg, setMsg] = useState(null);
  const eligible = students.filter((s) => s.result.status !== 'Repeat');
  const [picked, setPicked] = useState(() => new Set());
  const toggle = (id) => { const n = new Set(picked); n.has(id) ? n.delete(id) : n.add(id); setPicked(n); };
  async function go() {
    if (picked.size === 0) return;
    if (!confirm(`Move ${picked.size} student(s) to: ${destination}?`)) return;
    const { data, error } = await supabaseBrowser().rpc('promote_students', { p_ids: [...picked] });
    if (error) return setMsg({ ok: false, m: error.message });
    setMsg({ ok: true, m: `${data} student(s) moved.` }); setPicked(new Set()); router.refresh();
  }
  if (students.length === 0) return <p>No third-term results found for this class and session.</p>;
  return (<>
    <p>Destination for ticked students: <strong>{destination}</strong></p>
    {msg && <Notice msg={msg} onClose={() => setMsg(null)} />}
    <button type="button" className="btn ghost small" onClick={() => setPicked(new Set(eligible.map((s) => s.id)))}>Tick all eligible</button>
    <RecordFrame style={{ marginTop: 12 }} noun="students" head={<thead><tr><th></th><th>Student</th><th>Cumulative average</th><th>Status</th></tr></thead>}>
      {students.map((s) => (<tr key={s.id}>
        <td><input type="checkbox" style={{ width: 'auto' }} disabled={s.result.status === 'Repeat'} checked={picked.has(s.id)} onChange={() => toggle(s.id)} aria-label={`Move ${s.last_name}`} /></td>
        <td>{s.last_name} {s.first_name}</td><td>{s.result.cumulative_average}</td><td>{s.result.status}</td></tr>))}</RecordFrame>
    <p><button className="btn" onClick={go}>Move ticked students</button></p></>);
}
