import { redirect } from 'next/navigation';
import { getSessionRoles, supabaseServer, getCurrentTerm } from '@/lib/supabase-server';
import TermClassPicker from '@/components/TermClassPicker';
import TermActivityManager from '@/components/TermActivityManager';

export default async function TermActivity({ searchParams }) {
  const { roles } = await getSessionRoles();
  const isAdmin = roles.some((r) => r.role === 'admin');
  if (!isAdmin && !roles.some((r) => r.role === 'exam_officer')) redirect('/admin?denied=1');
  const sb = supabaseServer();
  const { data: terms } = await sb.from('terms').select('id,number,is_active,inactive_reason,academic_years(name)').order('starts_on', { ascending: false });
  const cur = await getCurrentTerm();
  const termId = (terms ?? []).some((t) => t.id === searchParams.term) ? searchParams.term : cur?.id;
  const term = (terms ?? []).find((t) => t.id === termId);
  let classes = [], students = [], excluded = [];
  if (term) {
    const [c, s, e] = await Promise.all([
      sb.from('classes').select('id,name,section').order('name'),
      sb.from('students').select('id,first_name,last_name,admission_no,class_id').eq('status', 'active').order('last_name').order('first_name'),
      sb.from('term_exclusions').select('student_id,reason').eq('term_id', term.id),
    ]);
    classes = c.data ?? []; students = s.data ?? []; excluded = e.data ?? [];
  }
  return (<><h1>Term activity</h1>
    <p className="auth-hint">A term can be switched off for everyone, or for chosen students (for example a pupil who joined in Term 2). No scores, attendance or ratings can be entered for an inactive term, and a third-term cumulative average divides by the number of active terms only.</p>
    <TermClassPicker action="/admin/term-activity" terms={terms ?? []} term={termId} />
    {term && <TermActivityManager term={term} isAdmin={isAdmin} classes={classes} students={students} excluded={excluded} />}</>);
}
