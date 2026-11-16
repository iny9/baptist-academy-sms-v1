import { redirect } from 'next/navigation';
import Notice from '@/components/Notice';
import { getSessionRoles, supabaseServer, getCurrentTerm } from '@/lib/supabase-server';
import TermClassPicker from '@/components/TermClassPicker';
import BursarBoard from '@/components/BursarBoard';
import BursarQueue from '@/components/BursarQueue';
import ScheduleBoard from '@/components/ScheduleBoard';
import OwedPanel from '@/components/OwedPanel';
import Link from 'next/link';

export default async function Bursar({ searchParams }) {
  const { roles } = await getSessionRoles();
  if (!roles.some((r) => r.role === 'bursar' || r.role === 'admin')) redirect('/admin?denied=1');
  const isBursar = roles.some((r) => r.role === 'bursar');
  const sb = supabaseServer();
  const [{ data: terms }, { data: years }, cur] = await Promise.all([
    sb.from('terms').select('id,number,year_id,academic_years(name)').order('starts_on', { ascending: false }),
    sb.from('academic_years').select('id,name').order('name', { ascending: false }),
    getCurrentTerm(),
  ]);
  const termId = (/^[0-9a-f-]{36}$/i.test(String(searchParams.term ?? '')) ? searchParams.term : null) ?? cur?.id ?? null;
  const { data: owed } = await sb.rpc('owed_overview');
  let rows = [], error = null;
  if (termId) { const r = await sb.rpc('fee_ledger', { p_term: termId, p_year: null }); rows = r.data ?? []; error = r.error; }
  return (<><h1>Bursar dashboard</h1>
    <TermClassPicker action="/admin/bursar" terms={terms ?? []} term={termId} />
    {error && <Notice error={error} />}
    <p><Link className="btn ghost" href="/admin/bursar/records">Student financial records (any term, any session)</Link></p>
    <OwedPanel rows={owed ?? []} />
    <BursarQueue terms={terms ?? []} years={years ?? []} canConfirm={isBursar} current={cur} />
    {!isBursar && <div className="msg err">You are viewing as admin. Only a user with the Bursar role can confirm payments. You can give yourself that role in Users and invites.</div>}
    {termId && <ScheduleBoard terms={terms ?? []} term={termId} roles={roles.map((r) => ({ role: r.role, section: r.section }))} isBursar={isBursar} />}
    {termId && <BursarBoard rows={rows} term={termId} canConfirm={isBursar} />}</>);
}
