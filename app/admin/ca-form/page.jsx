import { redirect } from 'next/navigation';
import { getSessionRoles, supabaseServer, getCurrentTerm } from '@/lib/supabase-server';
import TermClassPicker from '@/components/TermClassPicker';
import PrintButton from '@/components/PrintButton';
import DocHeader from '@/components/DocHeader';
import { uuidOr } from '@/lib/validate';
import { bySurname, cmp } from '@/lib/sort';

export default async function CaForm({ searchParams }) {
  const { user, roles } = await getSessionRoles();
  if (!roles.some((r) => ['admin', 'exam_officer', 'subject_teacher', 'class_teacher'].includes(r.role))) redirect('/admin?denied=1');
  const sb = supabaseServer();
  const [{ data: terms }, { data: classes }] = await Promise.all([
    sb.from('terms').select('id,number,academic_years(name)').order('starts_on', { ascending: false }),
    sb.from('classes').select('id,name,section').order('name'),
  ]);
  const cur = await getCurrentTerm();
  const term = uuidOr(searchParams.term) ?? cur?.id ?? null, subject = uuidOr(searchParams.subject);
  const classId = uuidOr(searchParams.class) ?? ((classes ?? []).length === 1 ? classes[0].id : null);
  const cls = (classes ?? []).find((c) => c.id === classId); const t = (terms ?? []).find((x) => x.id === term);
  let subs = [], students = [];
  if (cls && t) {
    const [{ data: act }, { data: asg }, { data: st }, { data: ct }] = await Promise.all([
      sb.rpc('class_active_subjects', { p_term: t.id, p_class: cls.id }),
      sb.from('class_subject_teachers').select('subject_id,teacher_id').eq('class_id', cls.id),
      sb.from('students').select('first_name,last_name,other_names').eq('class_id', cls.id).eq('status', 'active'),
      sb.from('class_teachers').select('teacher_id').eq('class_id', cls.id),
    ]);
    const manage = roles.some((r) => r.role === 'admin' || (r.role === 'exam_officer' && r.section === cls.section));
    const leads = (ct ?? []).some((x) => x.teacher_id === user.id);
    const mine = new Set((asg ?? []).filter((a) => a.teacher_id === user.id).map((a) => a.subject_id));
    subs = (act ?? []).filter((a) => cls.section === 'basic' ? (manage || leads) : (manage || mine.has(a.subject_id))).map((a) => ({ id: a.subject_id, name: a.subject_name })).sort((a, b) => cmp(a.name, b.name));
    students = (st ?? []).slice().sort(bySurname);
  }
  const basic = cls?.section === 'basic';
  const sub = subs.find((s) => s.id === subject);
  const { data: set } = await sb.from('site_settings').select('key,value').in('key', ['school_name', 'address', 'motto']);
  const S = Object.fromEntries((set ?? []).map((x) => [x.key, x.value]));
  const show = cls && t && (basic ? subs.length > 0 : !!sub);
  const sess = t ? `${t.academic_years.name}, Term ${t.number}` : '';
  return (<><h1 className="noprint">Continuous Assessment Form</h1>
    <div className="noprint"><TermClassPicker action="/admin/ca-form" terms={terms ?? []} classes={classes ?? []} term={term} cls={classId} />
      {cls && !basic && <form method="get" action="/admin/ca-form" className="row" style={{ marginTop: 12 }}>
        <input type="hidden" name="term" value={term} /><input type="hidden" name="class" value={classId} />
        <div><label htmlFor="sb">Subject</label><select id="sb" name="subject" defaultValue={subject ?? ''}>{subs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        <button className="btn">Show form</button></form>}
      {basic && <p className="auth-hint">Basic section: one sheet per child, listing every subject of the term.</p>}</div>
    {show && <><p className="noprint"><a className="btn" href={`/api/pdf?kind=ca-form&term=${term}&class=${classId}${basic ? '' : `&subject=${subject}`}`}>Download PDF</a> <PrintButton /></p>
      {basic ? students.map((s, i) => (
        <article className="rc" key={i} style={{ pageBreakAfter: 'always', marginBottom: 24 }}>
          <DocHeader S={S} pill="Continuous Assessment Sheet" sub={sess} watermark={false} />
          <div className="doc">
            <div className="tiles" style={{ gridTemplateColumns: '2fr 1fr 1fr' }}>
              <div className="tile"><div className="l">Child</div><div className="v" style={{ fontSize: '1.1rem' }}>{s.last_name} {s.first_name}</div></div>
              <div className="tile"><div className="l">Class</div><div className="v">{cls.name}</div></div>
              <div className="tile"><div className="l">Subjects</div><div className="v">{subs.length}</div></div></div>
            <table className="form"><thead><tr><th style={{ width: 40 }}>S/N</th><th>Subject</th><th>1st test (15)</th><th>2nd test (15)</th><th>Exam (70)</th><th>Total (100)</th></tr></thead>
              <tbody>{subs.map((x, j) => <tr key={x.id}><td>{j + 1}</td><td><strong>{x.name}</strong></td><td /><td /><td /><td /></tr>)}</tbody></table>
          </div></article>))
        : <article className="rc">
          <DocHeader S={S} pill="Continuous Assessment Form" sub={sess} watermark={false} />
          <div className="doc">
            <div className="tiles" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
              <div className="tile"><div className="l">Class</div><div className="v">{cls.name}</div></div>
              <div className="tile"><div className="l">Subject</div><div className="v" style={{ fontSize: '1.05rem' }}>{sub.name}</div></div>
              <div className="tile"><div className="l">Students</div><div className="v">{students.length}</div></div>
            </div>
            <table className="form"><thead><tr><th style={{ width: 40 }}>S/N</th><th>Name</th><th>1st CA (15)</th><th>2nd CA (15)</th><th>Exam (70)</th><th>Total (100)</th></tr></thead>
              <tbody>{students.map((s, i) => <tr key={i}><td>{i + 1}</td><td>{s.last_name} {s.first_name}</td><td /><td /><td /><td /></tr>)}</tbody></table>
          </div></article>}</>}</>);
}
