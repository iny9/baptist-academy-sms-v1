import Link from 'next/link';
import { getSessionRoles, supabaseServer, getCurrentTerm } from '@/lib/supabase-server';
import TermClassPicker from '@/components/TermClassPicker';
import ScheduleBuilder from '@/components/ScheduleBuilder';
import ScheduleBoard from '@/components/ScheduleBoard';
import ParentPayments from '@/components/ParentPayments';
import ExtramuralPanel from '@/components/ExtramuralPanel';
import { fromQuery } from '@/lib/back';
import RecordFrame from '@/components/RecordFrame';

export default async function Payments({ searchParams }) {
  const { user, roles } = await getSessionRoles();
  const sb = supabaseServer(); const names = roles.map((r) => r.role); const has = (...r) => names.some((n) => r.includes(n));
  const { data: terms } = await sb.from('terms').select('id,number,year_id,academic_years(name)').order('starts_on', { ascending: false });
  const cur = await getCurrentTerm();
  const term = (/^[0-9a-f-]{36}$/i.test(String(searchParams.term ?? '')) ? searchParams.term : null) ?? cur?.id ?? null;
  await sb.rpc('carry_due');   // brings unpaid lines of earlier terms into terms that have begun (safe to repeat)
  const { data: classes } = await sb.from('classes').select('id,name,section').order('name');
  const canL1 = has('bursar');
  const l2Sections = roles.filter((r) => ['principal', 'headmaster'].includes(r.role)).map((r) => r.section);
  const ledIds = new Set(names.includes('class_teacher') ? ((await sb.from('class_teachers').select('class_id').eq('teacher_id', user.id)).data ?? []).map((x) => x.class_id) : []); const myClasses = (classes ?? []).filter((c) => ledIds.has(c.id));
  const canSet = canL1 || l2Sections.length > 0 || myClasses.length > 0;
  const staffView = has('admin', 'exam_officer', 'class_teacher', 'bursar', 'principal', 'headmaster');
  let items = [], students = [], lines = [], submissions = [], emStudents = [], emEnrol = [];
  if (term) {
    items = (await sb.from('fee_items').select('*').eq('term_id', term).order('level').order('title')).data ?? [];
    if (has('parent')) {
      lines = (await sb.from('student_fee_lines').select('id,student_id,term_id,kind,level,title,amount_ngn,status,ignored,carried_to,review_note,terms(number,academic_years(name)),students(first_name,last_name,classes(name))').order('created_at')).data ?? [];
      submissions = (await sb.from('payment_submissions').select('id,student_id,reference,amount_ngn,status,review_note,receipt_no,created_at').order('created_at', { ascending: false }).limit(100)).data ?? [];
    }
    if (staffView) {
      // the bursar has no row access to students, so finance roles read the list through a checked database function
      if (names.some((n) => ['admin', 'bursar', 'exam_officer', 'principal', 'headmaster'].includes(n))) students = ((await sb.rpc('fee_students')).data ?? []).map((s) => ({ id: s.student_id, name: s.student_name, admission_no: s.admission_no }));
      else students = ((await sb.from('students').select('id,first_name,last_name,admission_no').eq('status', 'active').order('last_name').order('first_name')).data ?? []).map((s) => ({ id: s.id, name: `${s.last_name} ${s.first_name}`, admission_no: s.admission_no }));
    }
    if (myClasses.length) {
      const ids = myClasses.map((c) => c.id);
      [emStudents, emEnrol] = await Promise.all([
        sb.from('students').select('id,first_name,last_name,class_id').in('class_id', ids).eq('status', 'active').order('last_name').order('first_name').then((r) => r.data ?? []),
        sb.from('extramural_enrolment').select('student_id,class_id').eq('term_id', term).in('class_id', ids).then((r) => r.data ?? []),
      ]);
    }
  }
  return (<><h1>Payment schedule</h1>
    <TermClassPicker action="/admin/payments" terms={terms ?? []} term={term} />
    {term && <>
      {has('parent') && <><h2 style={{ marginTop: 28 }}>Your children’s fees</h2><ParentPayments lines={lines} submissions={submissions} /></>}
      {staffView && <>
        <p className="auth-hint" style={{ marginTop: 20 }}>Who sets what: the bursar sets Level 1 (school term fee, whole section); the principal or headmaster/headmistress sets Level 2A (whole section) and 2B (one sub-section); each class teacher or form master sets Level 3A (whole class) and 3B (chosen students). New items reach the schedules at once.</p>
        {canSet && <ScheduleBuilder term={term} canL1={canL1} l2Sections={l2Sections} classes={myClasses} students={emStudents} classesAll={classes ?? []} items={items} />}
        {myClasses.map((c) => <ExtramuralPanel key={c.id + term} term={term} cls={c} students={emStudents.filter((x) => x.class_id === c.id)} fee={items.find((i) => i.is_extramural && i.class_id === c.id) ?? null} enrolled={emEnrol.filter((e) => e.class_id === c.id).map((e) => e.student_id)} />)}
        {!canSet && items.length > 0 && <ScheduleBuilder term={term} classesAll={classes ?? []} items={items} />}
        <ScheduleBoard terms={terms ?? []} term={term} roles={roles.map((r) => ({ role: r.role, section: r.section }))} leads={myClasses.map((c) => c.id)} isBursar={has('bursar')} />
        <h2 style={{ marginTop: 32 }}>Student schedules</h2>
        <RecordFrame noun="students">{students.map((s) => (<tr key={s.id}><td>{s.name}</td><td>{s.admission_no}</td>
          <td><Link className="btn small" href={`/admin/payments/${term}/${s.id}?${fromQuery(`/admin/payments?term=${term}`)}`}>View schedule</Link></td></tr>))}</RecordFrame></>}
    </>}</>);
}
