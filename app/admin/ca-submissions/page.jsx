import { redirect } from 'next/navigation';
import Link from 'next/link';
import Notice from '@/components/Notice';
import PrintButton from '@/components/PrintButton';
import BackButton from '@/components/BackButton';
import TermClassPicker from '@/components/TermClassPicker';
import { getSessionRoles, supabaseServer, getCurrentTerm } from '@/lib/supabase-server';
import { ROLE_LABEL } from '@/lib/nav';
import { uuidOr } from '@/lib/validate';
import RecordFrame from '@/components/RecordFrame';

// CA forms that have been filled in (saved score sheets). Admin: all. Exam officers: their section. Class teachers / form masters: every subject's form for the classes they handle.
// Subject teachers: the forms they filled themselves. Each form can be opened and downloaded as a PDF.
// The database decides what each person may see (ca_forms / ca_form_sheet and row-level security); this page only displays it.
export default async function FilledCaForms({ searchParams }) {
  const { roles } = await getSessionRoles();
  if (!roles.some((r) => ['admin', 'exam_officer', 'class_teacher', 'subject_teacher'].includes(r.role))) redirect('/admin?denied=1');
  const sb = supabaseServer();
  const cur = await getCurrentTerm();
  const term = uuidOr(searchParams.term) ?? cur?.id ?? null, classId = uuidOr(searchParams.class), subject = uuidOr(searchParams.subject);
  const [{ data: terms }, { data: classes }] = await Promise.all([
    sb.from('terms').select('id,number,is_active,academic_years(name)').order('starts_on', { ascending: false }),
    sb.from('classes').select('id,name,section').order('name'),
  ]);
  let rows = [], error = null, sheet = null;
  if (term) {
    const r = await sb.rpc('ca_forms', { p_term: term, p_class: classId ?? null }); rows = r.data ?? []; error = r.error;
    if (classId && subject) { const s = await sb.rpc('ca_form_sheet', { p_term: term, p_class: classId, p_subject: subject }); sheet = s.data ?? []; error = error ?? s.error; }
  }
  const open = rows.find((r) => r.class_id === classId && r.subject_id === subject);
  const when = (d) => new Date(d).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  const link = (r) => `/admin/ca-submissions?term=${term}&class=${r.class_id}&subject=${r.subject_id}&from=${encodeURIComponent(`/admin/ca-submissions?term=${term}${classId ? `&class=${classId}` : ''}`)}`;
  return (<><h1 className="noprint">Filled CA forms</h1>
    <p className="auth-hint noprint">Admin sees every filled form, exam officers those of their section, and teachers the forms they filled themselves.</p>
    {error && <Notice error={error} />}
    <div className="noprint"><TermClassPicker action="/admin/ca-submissions" terms={terms ?? []} classes={null} term={term} /></div>
    {term && <div className="noprint" style={{ marginTop: 12 }}><form method="get" className="row"><input type="hidden" name="term" value={term} />
      <div><label htmlFor="c">Class (optional)</label><select id="c" name="class" defaultValue={classId ?? ''}><option value="">All classes</option>{(classes ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
      <button className="btn">Filter</button></form></div>}
    {term && !error && (rows.length === 0 ? <div className="empty noprint">No filled CA forms to show for this selection.</div> :
      <RecordFrame className="noprint" noun="forms" style={{ marginTop: 16 }} head={<thead><tr><th>Class</th><th>Subject</th><th>Filled by</th><th>As</th><th>Students</th><th>Saved</th><th /></tr></thead>}>
        {rows.map((r) => (<tr key={r.submission_id}><td>{r.class_name}</td><td>{r.subject_name}</td><td>{r.submitted_by_name ?? 'Unknown'}{r.mine && <span className="badge" style={{ marginLeft: 6 }}>You</span>}</td>
          <td>{r.submitted_as ? ROLE_LABEL[r.submitted_as] : ''}</td><td>{r.student_count}</td><td>{when(r.submitted_at)}</td><td><div className="btn-row"><Link className="btn ghost small" href={link(r)}>View</Link><a className="btn small" href={`/api/pdf?kind=ca-filled&term=${term}&class=${r.class_id}&subject=${r.subject_id}`}>Download PDF</a></div></td></tr>))}</RecordFrame>)}
    {sheet && <section style={{ marginTop: 24 }}>
      <h2>{open ? `${open.class_name}: ${open.subject_name}` : 'CA form'}</h2>
      <p className="noprint"><BackButton fallback={`/admin/ca-submissions?term=${term}`} label="Back to filled forms" /> <a className="btn" href={`/api/pdf?kind=ca-filled&term=${term}&class=${classId}&subject=${subject}`}>Download PDF</a> <PrintButton /></p>
      {sheet.length === 0 ? <div className="empty">This form has no scores you may see.</div> :
        <RecordFrame noun="students" head={<thead><tr><th>#</th><th>Student</th><th>1st CA (15)</th><th>2nd CA (15)</th><th>Exam (70)</th><th>Total</th><th>Entered by</th></tr></thead>}>
          {sheet.map((s, i) => <tr key={s.student_id}><td>{i + 1}</td><td>{s.student_name}</td><td>{s.ca1}</td><td>{s.ca2}</td><td>{s.exam}</td><td><strong>{s.total}</strong></td><td>{s.entered_by_name ?? ''}</td></tr>)}</RecordFrame>}
    </section>}
  </>);
}
