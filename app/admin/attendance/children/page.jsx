import { redirect } from 'next/navigation';
import { getSessionRoles, supabaseServer, getCurrentTerm } from '@/lib/supabase-server';
import ChildAttendance from '@/components/attendance/ChildAttendance';

// Parents and guardians see the daily, monthly, termly and session attendance of their own children only.
export default async function ChildrenAttendance() {
  const { user, roles } = await getSessionRoles();
  if (!roles.some((r) => ['parent'].includes(r.role))) redirect('/admin?denied=1');
  const sb = supabaseServer(); const cur = await getCurrentTerm();
  const { data: links } = await sb.from('guardians').select('student_id').eq('parent_id', user.id);
  const ids = (links ?? []).map((l) => l.student_id);
  const [{ data: kids }, { data: years }] = await Promise.all([
    ids.length ? sb.from('students').select('id,first_name,last_name,classes(name)').in('id', ids).order('last_name') : { data: [] },
    sb.from('academic_years').select('id,name').order('name', { ascending: false }),
  ]);
  return (<><h1>My child’s attendance</h1>
    {(kids ?? []).length === 0 ? <div className="empty">No children are linked to your account yet. Ask the school office.</div> : <ChildAttendance kids={kids} years={years ?? []} currentYear={cur?.year_id ?? ''} />}</>);
}
