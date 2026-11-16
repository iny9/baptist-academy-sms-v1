import { redirect } from 'next/navigation';
import Notice from '@/components/Notice';
import { getSessionRoles, supabaseServer } from '@/lib/supabase-server';
import GuardianMatcher from '@/components/GuardianMatcher';

export default async function Match() {
  const { roles } = await getSessionRoles();
  const isAdmin = roles.some((r) => r.role === 'admin');
  if (!isAdmin && !roles.some((r) => r.role === 'exam_officer')) redirect('/admin?denied=1');
  const sb = supabaseServer();
  const [p, s, c] = await Promise.all([
    sb.rpc('matching_parents'),
    sb.from('students').select('id,first_name,last_name,admission_no,class_id,status').in('status', ['active', 'transferred']).order('last_name').order('first_name'),
    sb.from('classes').select('id,name,section').order('name'),
  ]);
  const failed = [p, s, c].find((r) => r.error);
  return (<><h1>Match students to parents</h1>
    <p className="auth-hint">A parent or guardian can be linked to many students, in any classes and sections. {isAdmin ? 'You see every parent.' : 'You see the students of your own section, and parents who are already linked to them or not linked to anyone yet.'}</p>
    {failed && <Notice error={failed.error} />}
    <GuardianMatcher parents={p.data ?? []} students={s.data ?? []} classes={c.data ?? []} isAdmin={isAdmin} /></>);
}
