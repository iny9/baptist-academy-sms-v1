import { redirect } from 'next/navigation';
import { getSessionRoles, supabaseServer, getCurrentTerm } from '@/lib/supabase-server';
import TermClassPicker from '@/components/TermClassPicker';
import AssessmentManager from '@/components/AssessmentManager';
import Notice from '@/components/Notice';
import { uuidOr } from '@/lib/validate';
import { bySurname } from '@/lib/sort';

export default async function Assessment({ searchParams }) {
  const { user, roles } = await getSessionRoles();
  const names = roles.map((r) => r.role);
  if (!names.some((n) => ['admin', 'exam_officer', 'class_teacher', 'subject_teacher'].includes(n))) redirect('/admin?denied=1');
  const sb = supabaseServer();
  const [{ data: terms }, { data: classes }] = await Promise.all([
    sb.from('terms').select('id,number,is_active,inactive_reason,academic_years(name)').order('starts_on', { ascending: false }),
    sb.from('classes').select('id,name,section,sub_section').order('name'),
  ]);
  const cur = await getCurrentTerm();
  const term = uuidOr(searchParams.term) ?? cur?.id ?? null;
  const classId = uuidOr(searchParams.class) ?? ((classes ?? []).length === 1 ? classes[0].id : null);
  const cls = (classes ?? []).find((c) => c.id === classId);
  const termRow = (terms ?? []).find((t) => t.id === term);
  let body = null;
  if (term && cls) {
    const isAdmin = names.includes('admin');
    const canManage = isAdmin || roles.some((r) => r.role === 'exam_officer' && r.section === cls.section);
    const [st, asg, subs, tr, sd, at, rt, sc, ex, cp, ct, lk] = await Promise.all([
      sb.from('students').select('id,admission_no,first_name,last_name,other_names').eq('class_id', cls.id).eq('status', 'active'),
      sb.from('class_subject_teachers').select('subject_id,teacher_id').eq('class_id', cls.id),
      sb.rpc('class_active_subjects', { p_term: term, p_class: cls.id }),
      sb.from('rating_traits').select('*').order('name'),
      sb.from('school_days').select('days_open').eq('term_id', term).eq('section', cls.section).maybeSingle(),
      sb.from('attendance').select('student_id,days_present').eq('term_id', term),
      sb.from('ratings').select('student_id,trait_id,score').eq('term_id', term),
      sb.from('scores').select('student_id,subject_id,ca1,ca2,exam').eq('term_id', term).eq('class_id', cls.id),
      sb.from('term_exclusions').select('student_id').eq('term_id', term),
      sb.rpc('score_completeness', { p_term: term, p_class: cls.id }),
      sb.from('class_teachers').select('teacher_id,position').eq('class_id', cls.id).order('position'),
      sb.from('result_locks').select('reason').eq('term_id', term).eq('section', cls.section).maybeSingle(),
    ]);
    const excluded = new Set((ex.data ?? []).map((e) => e.student_id));
    const eligibleStudents = (st.data ?? []).filter((x) => !excluded.has(x.id)).sort(bySurname);
    const mine = (asg.data ?? []).filter((a) => a.teacher_id === user.id).map((a) => a.subject_id);
    const isClassTeacher = (ct.data ?? []).some((t) => t.teacher_id === user.id);
    const first = (ct.data ?? [])[0];
    const isFirst = first?.teacher_id === user.id;
    // Basic: class teachers (and managers) enter every active subject. Secondary: managers all, subject teachers their own.
    const all = subs.data ?? [];
    const subjects = (cls.section === 'basic' ? (canManage || isClassTeacher) : canManage) ? all : all.filter((s) => mine.includes(s.subject_id));
    let firstTeacher = '';
    if (first && !isFirst) firstTeacher = (await sb.rpc('staff_in_section', { sec: cls.section, r: 'class_teacher' })).data?.find((p) => p.id === first.teacher_id)?.full_name ?? '';
    body = <AssessmentManager term={term} section={cls.section} canManage={canManage} isLead={isClassTeacher} isFirst={isFirst} firstTeacher={firstTeacher}
      classId={cls.id} students={eligibleStudents} subjects={subjects.map((s) => ({ id: s.subject_id, name: s.subject_name }))} traits={tr.data ?? []} daysOpen={sd.data?.days_open ?? null}
      attendance={at.data ?? []} ratings={rt.data ?? []} scores={sc.data ?? []}
      locked={!!lk.data} lockReason={lk.data?.reason ?? ''} termOpen={termRow?.is_active !== false} termReason={termRow?.inactive_reason ?? ''} excludedCount={(st.data ?? []).length - eligibleStudents.length} completeness={cp.data ?? []} />;
    const err = [st, subs, sc].find((x) => x.error); if (err) body = <Notice error={err.error} />;
  }
  return <><h1>Scores and records</h1>
    <TermClassPicker action="/admin/assessment" terms={terms ?? []} classes={classes ?? []} term={term} cls={classId} />{body}</>;
}
