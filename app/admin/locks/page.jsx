import { redirect } from 'next/navigation';
import { getSessionRoles, supabaseServer, getCurrentTerm } from '@/lib/supabase-server';
import LockManager from '@/components/LockManager';

export default async function Locks() {
  const { roles } = await getSessionRoles();
  if (!roles.some((r) => r.role === 'admin')) redirect('/admin?denied=1');
  const sb = supabaseServer(); const cur = await getCurrentTerm();
  const [{ data: years }, { data: terms }, { data: locks }] = await Promise.all([
    sb.from('academic_years').select('id,name').order('name', { ascending: false }),
    sb.from('terms').select('id,number,year_id,starts_on').order('starts_on', { ascending: false }),
    sb.from('result_locks').select('term_id,section,locked_at,reason'),
  ]);
  return (<><h1>Lock results</h1>
    <p className="auth-hint">Once the results of a term are final, lock them. A locked term can still be viewed and downloaded, but no score, attendance, rating or subject setting can be changed for it until you unlock it. Only the administrator can lock or unlock.</p>
    <LockManager years={years ?? []} terms={terms ?? []} locks={locks ?? []} current={cur} /></>);
}
