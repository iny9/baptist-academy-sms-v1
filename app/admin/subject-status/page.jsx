import { redirect } from 'next/navigation';
import { getSessionRoles, supabaseServer, getCurrentTerm } from '@/lib/supabase-server';
import SubjectStatusManager from '@/components/SubjectStatusManager';
import Notice from '@/components/Notice';

function NoAccess({ viewing }) {
  return (<><h1>Not available in this view</h1><p className="auth-hint">{viewing ? 'You are currently viewing the system as another role, which cannot open this page.' : 'Your roles cannot open this page.'} Use the “View as” bar above and choose <strong>All my roles</strong> or <strong>Administrator</strong> / <strong>Exam officer</strong>.</p></>);
}

export default async function SubjectStatus() {
  const { roles, allRoles, viewing } = await getSessionRoles();
  const isAdmin = roles.some((r) => r.role === 'admin');
  if (!isAdmin && !roles.some((r) => r.role === 'exam_officer')) {
    if (allRoles.some((r) => ['admin', 'exam_officer'].includes(r.role))) return <NoAccess viewing={viewing} />;
    redirect('/admin?denied=1');
  }
  const sections = isAdmin ? ['basic', 'secondary'] : roles.filter((r) => r.role === 'exam_officer').map((r) => r.section);
  const sb = supabaseServer(); const cur = await getCurrentTerm();
  const [y, t, c, s, r] = await Promise.all([
    sb.from('academic_years').select('id,name').order('name', { ascending: false }),
    sb.from('terms').select('id,year_id,number').order('number'),
    sb.from('classes').select('id,name,section,sub_section').in('section', sections).order('name'),
    sb.from('subjects').select('id,name,sub_sections,subject_classes(class_id)').order('name'),
    sb.from('subject_inactivity').select('id,subject_id,class_id,year_id,term_id,reason'),
  ]);
  const failed = [y, t, c, s, r].find((x) => x.error);
  return <><h1>Subjects on or off</h1>
    <p className="auth-hint">{isAdmin ? 'You can switch subjects off for any section.' : 'You can switch subjects off for the classes of your own section.'} Tick many classes and many subjects at once.</p>
    {failed && <Notice error={failed.error} />}
    <SubjectStatusManager years={y.data ?? []} terms={t.data ?? []} classes={c.data ?? []} subjects={s.data ?? []} rows={r.data ?? []} current={cur} /></>;
}
