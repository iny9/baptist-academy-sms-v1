import { redirect } from 'next/navigation';
import { getSessionRoles, supabaseServer, getCurrentTerm } from '@/lib/supabase-server';
import TermClassPicker from '@/components/TermClassPicker';
import RolloverForm from '@/components/RolloverForm';

export default async function Rollover({ searchParams }) {
  const { roles } = await getSessionRoles();
  const isAdmin = roles.some((r) => r.role === 'admin');
  const secs = roles.filter((r) => r.role === 'exam_officer').map((r) => r.section);
  if (!isAdmin && secs.length === 0) redirect('/admin?denied=1');
  const sb = supabaseServer();
  const [{ data: terms }, { data: classes }] = await Promise.all([
    sb.from('terms').select('id,number,year_id,academic_years(name)').eq('number', 3).order('starts_on', { ascending: false }),
    sb.from('classes').select('id,name,section,next_class_id,is_terminal').order('name'),
  ]);
  const mine = (classes ?? []).filter((c) => isAdmin || secs.includes(c.section));
  const cur = await getCurrentTerm();
  const asked = (terms ?? []).some((t) => t.id === searchParams.term) ? searchParams.term : null;
  const term = asked ?? (terms ?? []).find((t) => t.year_id === cur?.year_id)?.id ?? (terms ?? [])[0]?.id ?? null;
  const classId = searchParams.class ?? (mine.length === 1 ? mine[0].id : undefined);
  const cls = mine.find((c) => c.id === classId);
  let students = [];
  if (term && cls) {
    const { data } = await sb.rpc('term_results', { p_term: term, p_class: cls.id });
    const seen = new Map();
    for (const r of data ?? []) if (!seen.has(r.student_id)) seen.set(r.student_id, r);
    const ids = [...seen.keys()];
    const { data: st } = ids.length ? await sb.from('students').select('id,first_name,last_name,class_id,status').in('id', ids) : { data: [] };
    students = (st ?? []).filter((s) => s.class_id === cls.id && s.status === 'active')
      .map((s) => ({ ...s, result: seen.get(s.id) })).sort((a, b) => a.last_name.localeCompare(b.last_name));
  }
  const dest = cls ? (cls.next_class_id ? mine.concat(classes).find((c) => c.id === cls.next_class_id)?.name : 'Graduated (leaves the active roll)') : '';
  return (<><h1>Promotion and roll-over</h1>
    <p>Choose a third-term result and a class. Tick the students to move. Students you leave unticked stay in their class for the next session.</p>
    <TermClassPicker action="/admin/rollover" terms={terms ?? []} classes={mine} term={term} cls={classId} />
    {cls && <RolloverForm students={students} destination={dest} key={cls.id + term} />}</>);
}
