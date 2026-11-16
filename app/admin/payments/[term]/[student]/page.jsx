import { notFound } from 'next/navigation';
import { getSessionRoles, supabaseServer } from '@/lib/supabase-server';
import PrintButton from '@/components/PrintButton';
import BackButton from '@/components/BackButton';
import DocHeader from '@/components/DocHeader';
import { isUuid } from '@/lib/validate';

const naira = (n) => '₦' + Number(n).toLocaleString('en-NG', { minimumFractionDigits: 2 });
const GROUP = { 1: ['LEVEL 1', 'School fees for the term'], 2: ['LEVEL 2', 'Section levies'], 3: ['LEVEL 3', 'Class levies'] };

export default async function Schedule({ params }) {
  const { roles } = await getSessionRoles();
  const sb = supabaseServer();
  if (!isUuid(params.student) || !isUuid(params.term)) notFound();
  // header details come from a checked database function so the bursar (no direct access to students or classes) can open it too
  const st = (await sb.rpc('fee_student', { p_student: params.student })).data?.[0];
  if (!st) notFound();
  const cls = { name: st.class_name, section: st.section };
  const [{ data: term }, { data: set }] = await Promise.all([
    sb.from('terms').select('number,academic_years(name)').eq('id', params.term).single(),
    sb.from('site_settings').select('key,value'),
  ]);
  const S = Object.fromEntries((set ?? []).map((x) => [x.key, x.value]));
  const { data } = await sb.from('fee_items').select('*').eq('term_id', params.term).eq('section', cls.section).order('level').order('title');
  const [{ data: em }, { data: bf }] = await Promise.all([
    sb.from('extramural_enrolment').select('student_id').eq('student_id', st.id).eq('term_id', params.term).maybeSingle(),
    sb.from('student_fee_lines').select('amount_ngn').eq('student_id', st.id).eq('kind', 'brought_forward').neq('status', 'confirmed').maybeSingle(),
  ]);
  // extra-mural fees only for ticked students; an unpaid balance from before is part of the schedule until it is cleared
  const items = (data ?? []).filter((i) => (i.level < 3 || i.class_id === st.class_id) && (!i.is_extramural || em));
  const owedBefore = bf ? Number(bf.amount_ngn) : 0;
  const total = items.reduce((a, i) => a + Number(i.amount_ngn), 0) + owedBefore;
  const canPrint = roles.some((r) => r.role === 'admin' || (r.role === 'exam_officer' && r.section === cls.section));
  return (<>
    <p className="noprint"><BackButton fallback={`/admin/payments?term=${params.term}`} label="Back to payment schedule" />{canPrint && <> <a className="btn" href={`/api/pdf?kind=schedule&term=${params.term}&student=${st.id}`}>Download PDF</a> <PrintButton /></>}</p>
    <article className="rc">
      <DocHeader S={S} pill="Payment schedule" sub={`${term.academic_years.name}, Term ${term.number}`} />
      <div className="doc">
        <div className="student" style={{ gridTemplateColumns: '1fr auto' }}>
          <div><h2 className="name">{st.last_name} {st.first_name}</h2><div className="meta">{cls.name} &nbsp;|&nbsp; {cls.section === 'secondary' ? 'Secondary' : 'Basic'} section{st.admission_no ? ` | Adm. ${st.admission_no}` : ''}</div></div>
          <div className="tile" style={{ minWidth: 190 }}><div className="l">Total due this term</div><div className="v">{naira(total)}</div></div>
        </div>
        {[1, 2, 3].map((l) => { const g = items.filter((i) => i.level === l); if (!g.length) return null; return (
          <div key={l}><div className="grp"><span><small>{GROUP[l][0]}</small>{GROUP[l][1]}</span><span>{naira(g.reduce((a, i) => a + Number(i.amount_ngn), 0))}</span></div>
            {g.map((i) => <div className="line" key={i.id}><span>{i.title}</span><span>{naira(i.amount_ngn)}</span></div>)}</div>); })}
        {owedBefore > 0 && <div><div className="grp"><span><small>OWED FROM BEFORE</small>Balance brought forward</span><span>{naira(owedBefore)}</span></div><div className="line"><span>Balance brought forward (unpaid until cleared)</span><span>{naira(owedBefore)}</span></div></div>}
        {items.length === 0 && owedBefore === 0 && <p>No fees have been set for this term yet.</p>}
        <div className="grand"><span>GRAND TOTAL</span><b>{naira(total)}</b></div>
        <p className="meta" style={{ marginTop: 12 }}>Please keep your payment receipt and present it when asked. Contact the school office with any question about this schedule.</p>
        <div className="foot"><span>{S.school_name} | {S.motto}</span><span>Generated {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</span></div>
      </div>
    </article></>);
}
