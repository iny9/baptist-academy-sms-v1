import Link from 'next/link';
import { getSessionRoles, supabaseServer, getCurrentTerm } from '@/lib/supabase-server';
import TermClassPicker from '@/components/TermClassPicker';
import SendButton from '@/components/SendButton';
import ParentResults from '@/components/ParentResults';
import Notice from '@/components/Notice';
import { uuidOr } from '@/lib/validate';
import { bySurname } from '@/lib/sort';
import { fromQuery } from '@/lib/back';
import RecordFrame from '@/components/RecordFrame';

export default async function Results({ searchParams }) {
  const { user, roles } = await getSessionRoles();
  const has = (...r) => roles.some((x) => r.includes(x.role));
  const staff = has('admin', 'exam_officer', 'class_teacher', 'principal', 'headmaster');
  const isParent = has('parent');
  const classTeacherOnly = has('class_teacher') && !has('admin', 'exam_officer', 'principal', 'headmaster');
  const sb = supabaseServer();
  const { data: terms } = await sb.from('terms').select('id,number,is_active,starts_on,academic_years(name)').order('starts_on', { ascending: false });
  const cur = await getCurrentTerm();
  const term = uuidOr(searchParams.term) ?? cur?.id ?? null;
  let classId = uuidOr(searchParams.class);
  let students = [], classes = null, children = [], gaps = [], blockers = [], locked = false;
  if (staff) {
    classes = (await sb.from('classes').select('id,name,section,class_teacher_id').order('name')).data ?? [];
    // a class teacher (with no wider results role) sees only the class they lead, and views it only: no download
    if (classTeacherOnly) { const { data: led } = await sb.from('class_teachers').select('class_id').eq('teacher_id', user.id); const ids = new Set((led ?? []).map((x) => x.class_id)); classes = classes.filter((c) => ids.has(c.id)); }
    if (!classId && classes.length === 1) classId = classes[0].id;   // one class to choose from: open it
    const sec = classes.find((c) => c.id === classId)?.section;
    if (term && sec) blockers = (await sb.rpc('results_blockers', { p_term: term, p_section: sec })).data ?? [];
    if (term && sec) locked = ((await sb.from('result_locks').select('section').eq('term_id', term).eq('section', sec)).data ?? []).length > 0;
    if (term && classId) gaps = ((await sb.rpc('score_completeness', { p_term: term, p_class: classId })).data ?? []).filter((c) => c.complete < c.eligible);
    if (term && classId) students = ((await sb.from('students').select('id,first_name,last_name,admission_no').eq('class_id', classId)).data ?? []).sort(bySurname);
  }
  if (isParent) {
    // Only this person's own children, taken from the guardian links (not from whatever else their other roles can see)
    const { data: links } = await sb.from('guardians').select('student_id').eq('parent_id', user.id);
    const ids = (links ?? []).map((l) => l.student_id);
    if (ids.length) children = (await sb.from('students').select('id,first_name,last_name,admission_no,classes(id,name,section)').in('id', ids).order('last_name').order('first_name')).data ?? [];
  }
  return (<><h1>Results</h1>
    {isParent && <><h2>My children's results</h2><ParentResults terms={terms ?? []} children={children} currentTerm={cur?.id ?? ''} /></>}
    {staff && <>
      {isParent && <h2 style={{ marginTop: 32 }}>School results</h2>}
      <TermClassPicker action="/admin/results" terms={terms ?? []} classes={classes} term={term} cls={classId} />
      {locked && <Notice notice={{ tone: 'info', kind: 'custom', title: 'Results are locked for this term and section', body: 'The scores, attendance and ratings can be viewed and downloaded, but they can no longer be changed.', hint: 'Only the administrator can unlock them (Lock results).' }} compact />}
      {blockers.length > 0 && <Notice notice={{ tone: 'warn', kind: 'custom', title: 'Some subjects have no teacher yet', body: `Results are shown with the scores entered so far. Still without a teacher: ${[...new Set(blockers.map((b) => b.class_name + (b.subject_name ? ' – ' + b.subject_name : '')))].slice(0, 12).join('; ')}${blockers.length > 12 ? '…' : ''}.`, hint: 'The admin or exam officer can assign teachers under Teacher assignments, or switch off subjects a class does not take under Subjects on or off.' }} compact />}
      {classId && term && !classTeacherOnly && has('admin', 'exam_officer') && <p style={{ marginTop: 16 }}><a className="btn" href={`/api/pdf?kind=report&term=${term}&class=${classId}`}>Download all report cards (PDF)</a> <SendButton label="Email results to parents" confirmText="Email each linked parent their child's report for this term?" payload={{ kind: 'results', term, class_id: classId }} /></p>}
      {gaps.length > 0 && <div className="msg err" role="status" style={{ background: 'var(--gold-50)', color: 'var(--ink)', borderColor: 'var(--gold)', display: 'block' }}><strong>Some score sheets are incomplete:</strong> {gaps.map((g) => `${g.subject_name} (${g.complete} of ${g.eligible})`).join(', ')}. Results for these subjects are shown as far as they have been entered.</div>}
      {students.length > 0 && <RecordFrame style={{ marginTop: 20 }} noun="students">{students.map((s) => (
        <tr key={s.id}><td>{s.last_name} {s.first_name}</td><td>{s.admission_no}</td>
          <td><Link className="btn small" href={`/admin/results/${term}/${s.id}?${fromQuery(`/admin/results?term=${term}&class=${classId}`)}`}>{classTeacherOnly ? 'View result' : 'View report card'}</Link></td></tr>))}</RecordFrame>}</>}
    {classTeacherOnly && <p className="auth-hint">Class teachers can view their own class’s results here. Downloading and printing report cards is done by the exam officer.</p>}
    {!staff && !isParent && <div className="empty">Results are not available for your role.</div>}</>);
}
