import { redirect } from 'next/navigation';
import { getSessionRoles, supabaseServer } from '@/lib/supabase-server';
import AttendanceRegister from '@/components/attendance/AttendanceRegister';

// Class teachers / form masters take the daily register here. Nobody else can: the database refuses it too.
export default async function AttendancePage() {
  const { user, roles } = await getSessionRoles();
  if (!roles.some((r) => ['class_teacher'].includes(r.role))) redirect('/admin?denied=1');
  const sb = supabaseServer();
  const [{ data: terms }, { data: mine }] = await Promise.all([
    sb.from('terms').select('id,number,starts_on,ends_on,is_active,academic_years(name)').order('starts_on', { ascending: false }),
    sb.from('class_teachers').select('position,classes(id,name,section,sub_section)').eq('teacher_id', user.id),
  ]);
  const classes = (mine ?? []).filter((m) => m.classes).map((m) => ({ ...m.classes, position: m.position })).sort((a, b) => a.name.localeCompare(b.name));
  return (<><h1>Attendance register</h1>
    <p className="auth-hint">Tick who is present, morning and afternoon. Times school opened and days present are worked out for you from the calendar and your ticks.</p>
    {classes.length === 0 ? <div className="empty">You are not assigned as a class teacher or form master yet. Ask the administrator.</div>
      : <AttendanceRegister terms={terms ?? []} classes={classes} />}</>);
}
