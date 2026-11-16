import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSessionRoles, supabaseServer, getCurrentTerm } from '@/lib/supabase-server';
import { uuidOr } from '@/lib/validate';
import RecordView from '@/components/RecordView';
import RecordFrame from '@/components/RecordFrame';

// The bursar (and admin) can open any child's complete financial record: every term of every session, all sections.
export default async function Records({ searchParams }) {
  const { roles } = await getSessionRoles();
  if (!roles.some((r) => r.role === 'bursar' || r.role === 'admin')) redirect('/admin?denied=1');
  const sb = supabaseServer(); const cur = await getCurrentTerm();
  const q = String(searchParams.q ?? '').slice(0, 60), sid = uuidOr(searchParams.student);
  const { data: found } = q ? await sb.rpc('finance_students', { p_q: q }) : { data: [] };
  let student = null, lines = [], S = {};
  if (sid) {
    const [{ data: who }, { data: l }, { data: set }] = await Promise.all([sb.rpc('student_card', { p_student: sid }).then((r) => ({ data: r.data?.[0] ? { ...r.data[0], classes: { name: r.data[0].class_name, section: r.data[0].section } } : null })), sb.rpc('student_finance_record', { p_student: sid }), sb.from('site_settings').select('key,value')]);
    student = who; lines = l ?? []; S = Object.fromEntries((set ?? []).map((x) => [x.key, x.value]));
  }
  return (<><h1>Student financial records</h1>
    <form className="row noprint" method="get"><div><label htmlFor="q">Find a student (name or admission number)</label><input id="q" name="q" defaultValue={q} maxLength={60} /></div><button className="btn">Search</button></form>
    {q && <RecordFrame className="noprint" noun="students" style={{ marginTop: 12 }}>{(found ?? []).map((s) => (<tr key={s.student_id}><td>{s.student_name} <span className="auth-hint">{s.admission_no}</span></td><td>{s.class_name}</td>
      <td><Link className="btn small" href={`/admin/bursar/records?student=${s.student_id}&q=${encodeURIComponent(q)}`}>Open record</Link></td></tr>))}{(found ?? []).length === 0 && <tr><td>No student found.</td></tr>}</RecordFrame>}
    {student && <RecordView student={student} lines={lines} S={S} currentTerm={cur?.id ?? ''} />}</>);
}
