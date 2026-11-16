import { redirect } from 'next/navigation';
import { getSessionRoles, supabaseServer, getCurrentTerm } from '@/lib/supabase-server';
import ReportPicker from '@/components/ReportPicker';

export default async function Reports() {
  const { roles } = await getSessionRoles();
  if (!roles.some((r) => r.role === 'admin' || r.role === 'exam_officer')) redirect('/admin?denied=1');
  const sb = supabaseServer(); const cur = await getCurrentTerm();
  const [{ data: terms }, { data: classes }, { data: students }, { data: links }] = await Promise.all([
    sb.from('terms').select('id,number,academic_years(name)').order('starts_on', { ascending: false }),
    sb.from('classes').select('id,name,section,sub_section').order('name'),
    sb.from('students').select('id,first_name,last_name,admission_no,class_id').eq('status', 'active').order('last_name').order('first_name'),
    sb.rpc('guardian_links'),
  ]);
  return <><h1>Download report cards</h1><p className="auth-hint">Admin and exam officers only. Exam officers see their own section.</p>
    <ReportPicker isAdmin={roles.some((r) => r.role === 'admin')} terms={terms ?? []} classes={classes ?? []} students={students ?? []} links={links ?? []} currentTerm={cur?.id ?? ''} /></>;
}
