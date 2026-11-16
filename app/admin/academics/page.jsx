import { redirect } from 'next/navigation';
import Notice from '@/components/Notice';
import { getSessionRoles, supabaseServer } from '@/lib/supabase-server';
import AcademicsManager from '@/components/AcademicsManager';

function NoAccess({ viewing }) {
  return (<><h1>Not available in this view</h1><p className="auth-hint">{viewing ? 'You are currently viewing the system as another role, which cannot open this page.' : 'Your roles cannot open this page.'} Use the “View as” bar above and choose <strong>All my roles</strong> or <strong>Administrator</strong> / <strong>Exam officer</strong>.</p></>);
}

export default async function Academics() {
  const { roles, allRoles, viewing } = await getSessionRoles();
  const isAdmin = roles.some((r) => r.role === 'admin');
  if (!isAdmin && !roles.some((r) => r.role === 'exam_officer')) {
    if (allRoles.some((r) => ['admin', 'exam_officer'].includes(r.role))) return <NoAccess viewing={viewing} />;
    redirect('/admin?denied=1');
  }
  const sb = supabaseServer();
  const [y, t, c, s0] = await Promise.all([
    sb.from('academic_years').select('*').order('name', { ascending: false }),
    sb.from('terms').select('*').order('number'),
    sb.from('classes').select('*').order('section').order('name'),
    sb.from('subjects').select('*,subject_classes(class_id)').order('name'),
  ]);
  // if the class-list lookup is not available yet, still show the subjects
  const s = s0.error ? await sb.from('subjects').select('*').order('name') : s0;
  const failed = [y, t, c, s].find((r) => r.error);
  const sections = isAdmin ? ['basic', 'secondary'] : roles.filter((r) => r.role === 'exam_officer').map((r) => r.section);
  return <><h1>Years, classes and subjects</h1>
    {failed && <Notice error={failed.error} />}
    <AcademicsManager isAdmin={isAdmin} sections={sections} years={y.data ?? []} terms={t.data ?? []} classes={c.data ?? []} subjects={s.data ?? []} /></>;
}
