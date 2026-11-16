import { redirect } from 'next/navigation';
import { getSessionRoles, supabaseServer, getCurrentTerm } from '@/lib/supabase-server';
import TeachingManager from '@/components/TeachingManager';
import Notice from '@/components/Notice';

function NoAccess({ viewing }) {
  return (<><h1>Not available in this view</h1><p className="auth-hint">{viewing ? 'You are currently viewing the system as another role, which cannot open this page.' : 'Your roles cannot open this page.'} Use the “View as” bar above and choose <strong>All my roles</strong> or <strong>Administrator</strong> / <strong>Exam officer</strong>.</p></>);
}

export default async function Teaching() {
  const { roles, allRoles, viewing } = await getSessionRoles();
  const isAdmin = roles.some((r) => r.role === 'admin');
  if (!isAdmin && !roles.some((r) => r.role === 'exam_officer')) {
    if (allRoles.some((r) => ['admin', 'exam_officer'].includes(r.role))) return <NoAccess viewing={viewing} />;
    redirect('/admin?denied=1');
  }
  const sb = supabaseServer();
  const sections = isAdmin ? ['basic', 'secondary'] : roles.filter((r) => r.role === 'exam_officer').map((r) => r.section);
  const [c, s, a, ct, terms] = await Promise.all([
    sb.from('classes').select('id,name,section,sub_section').in('section', sections).order('name'),
    sb.from('subjects').select('id,name,sub_sections,subject_classes(class_id)').order('name'),
    sb.from('class_subject_teachers').select('id,class_id,subject_id,teacher_id'),
    sb.from('class_teachers').select('class_id,teacher_id,position'),
    sb.from('terms').select('id,number,starts_on,is_active,academic_years(name)').order('starts_on', { ascending: false }),
  ]);
  const failed = [c, s, a, ct].find((r) => r.error);
  const staff = {};
  await Promise.all(sections.flatMap((sec) => ['class_teacher', 'subject_teacher'].map(async (role) => { staff[`${sec}:${role}`] = (await sb.rpc('staff_in_section', { sec, r: role })).data ?? []; })));
  const cur = await getCurrentTerm(); const t = (terms.data ?? []).find((x) => x.id === cur?.id) ?? terms.data?.[0]; const blockers = [];
  if (t) await Promise.all(sections.map(async (sec) => { ((await sb.rpc('results_blockers', { p_term: t.id, p_section: sec })).data ?? []).forEach((b) => blockers.push({ ...b, section: sec })); }));
  return <><h1>Teacher assignments</h1>{failed && <Notice error={failed.error} />}
    <TeachingManager sections={sections} classes={c.data ?? []} subjects={s.data ?? []} assignments={a.data ?? []} staff={staff}
      classTeachers={ct.data ?? []} blockers={blockers} termName={t ? `${t.academic_years.name}, Term ${t.number}` : ''} /></>;
}
