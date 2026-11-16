import { redirect } from 'next/navigation';
import Notice from '@/components/Notice';
import { getSessionRoles, supabaseServer, getCurrentTerm } from '@/lib/supabase-server';
import DebtorsView from '@/components/DebtorsView';
import DebtRepair from '@/components/DebtRepair';

export default async function Debtors({ searchParams }) {
  const { roles } = await getSessionRoles();
  if (!roles.some((r) => ['admin', 'bursar', 'exam_officer', 'principal', 'headmaster', 'class_teacher'].includes(r.role))) redirect('/admin?denied=1');
  const sb = supabaseServer();
  const [{ data: years }, { data: terms }] = await Promise.all([sb.from('academic_years').select('id,name').order('name', { ascending: false }), sb.from('terms').select('id,number,year_id').order('number')]);
  const cur = await getCurrentTerm();
  // the session and term running now, unless the user chose another (an empty term means "all terms in the session")
  const asked = searchParams.year ? searchParams : null;
  const year = asked ? searchParams.year : cur?.year_id ?? '';
  const term = asked ? (searchParams.term ?? '') : cur?.id ?? '';
  let rows = [], error = null;
  if (year) { const r = await sb.rpc('fee_ledger', { p_term: term || null, p_year: year }); rows = (r.data ?? []).filter((x) => x.status !== 'confirmed'); error = r.error; }
  const { data: problems } = roles.some((r) => ['admin', 'bursar'].includes(r.role)) ? await sb.rpc('debt_integrity_report') : { data: [] };
  return (<><h1>Outstanding fees</h1>
    <p className="auth-hint">You see the students your role covers: the bursar and admin see all sections, the principal and headmaster/headmistress and exam officers their own section, and class teachers their own class.</p>
    {(problems ?? []).length > 0 && <DebtRepair problems={problems} />}
    {error && <Notice error={error} />}
    <DebtorsView years={years ?? []} terms={terms ?? []} year={year ?? ''} term={term ?? ''} rows={rows} /></>);
}
