import { redirect } from 'next/navigation';
import { getSessionRoles, supabaseServer } from '@/lib/supabase-server';
import RecordFrame from '@/components/RecordFrame';

const TABLES = ['scores', 'students', 'attendance', 'ratings', 'user_roles', 'fee_items', 'academic_years', 'terms', 'classes', 'subjects', 'class_subject_teachers', 'school_days', 'guardians', 'newsletters', 'invites'];

export default async function Audit({ searchParams }) {
  const { roles } = await getSessionRoles();
  if (!roles.some((r) => r.role === 'admin')) redirect('/admin?denied=1');
  const sb = supabaseServer(); const t = TABLES.includes(searchParams.table) ? searchParams.table : '';
  const page = Math.max(0, parseInt(searchParams.page ?? '0', 10) || 0);
  let q = sb.from('audit_log').select('id,at,actor_email,action,table_name,record_key,old_row,new_row').order('id', { ascending: false }).range(page * 50, page * 50 + 49);
  if (t) q = q.eq('table_name', t);
  const { data } = await q;
  const changed = (r) => r.action === 'UPDATE' ? Object.keys(r.new_row).filter((k) => JSON.stringify(r.new_row[k]) !== JSON.stringify(r.old_row[k])).map((k) => `${k}: ${JSON.stringify(r.old_row[k])} to ${JSON.stringify(r.new_row[k])}`).join('; ')
    : JSON.stringify(r.action === 'INSERT' ? r.new_row : r.old_row);
  return (<><h1>Audit log</h1><p>Every change to scores, students, roles, fees and structure is recorded here and cannot be edited or deleted.</p>
    <form method="get" className="row"><div><label htmlFor="t">Table</label><select id="t" name="table" defaultValue={t}><option value="">All</option>{TABLES.map((x) => <option key={x}>{x}</option>)}</select></div><button className="btn">Filter</button></form>
    <RecordFrame style={{ marginTop: 16 }} noun="entries" head={<thead><tr><th>When</th><th>Who</th><th>Action</th><th>Table</th><th>Change</th></tr></thead>}>
      {(data ?? []).map((r) => (<tr key={r.id}><td style={{ whiteSpace: 'nowrap' }}>{new Date(r.at).toLocaleString('en-GB')}</td><td>{r.actor_email ?? 'system'}</td><td>{r.action}</td><td>{r.table_name}</td>
        <td style={{ fontSize: '.8rem', wordBreak: 'break-word', maxWidth: 520 }}>{changed(r).slice(0, 400)}</td></tr>))}</RecordFrame>
    <p>{page > 0 && <a className="btn ghost small" href={`?table=${t}&page=${page - 1}`}>Newer</a>} {(data ?? []).length === 50 && <a className="btn ghost small" href={`?table=${t}&page=${page + 1}`}>Older</a>}</p></>);
}
