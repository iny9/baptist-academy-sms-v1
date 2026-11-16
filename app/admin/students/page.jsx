import { redirect } from 'next/navigation';
import Notice from '@/components/Notice';
import { getSessionRoles, supabaseServer } from '@/lib/supabase-server';
import StudentsManager from '@/components/StudentsManager';

export default async function Students() {
  const { roles } = await getSessionRoles();
  const names = roles.map((r) => r.role);
  if (!names.some((n) => ['admin', 'exam_officer', 'class_teacher'].includes(n))) redirect('/admin?denied=1');
  const sb = supabaseServer();
  const [c, s] = await Promise.all([
    sb.from('classes').select('id,name,section').order('name'),
    sb.from('students_with_age').select('id,admission_no,first_name,last_name,other_names,gender,dob,age_years,class_id,status,photo_url,student_type,debt_forward_ngn').order('last_name').order('first_name'),
  ]);
  const failed = [c, s].find((r) => r.error);
  const canMove = names.includes('admin') || names.includes('exam_officer');
  const links = canMove ? ((await sb.rpc('guardian_links')).data ?? []) : [];
  return <><h1>Students</h1>{failed && <Notice error={failed.error} />}<StudentsManager classes={c.data ?? []} students={s.data ?? []} canManage={canMove} canPhoto isAdmin={names.includes('admin')} links={links} /></>;
}
