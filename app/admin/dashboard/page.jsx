import { redirect } from 'next/navigation';
import { getSessionRoles, supabaseServer, getCurrentTerm } from '@/lib/supabase-server';
import DashboardClient from '@/components/dash/DashboardClient';
import YearPicker from '@/components/dash/YearPicker';
import { SECTION_LABEL } from '@/lib/dash-logic';

// Who may open the dashboard: administrator and board members (every section), principal and headmaster/headmistress (their own section).
// The page checks it here; the database checks it again inside every dashboard function (can_view_dashboard), so a changed URL or API call gains nothing.
import { DASH_ROLES as ALLOWED } from '@/lib/dash-access';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function Dashboard({ searchParams }) {
  const { roles } = await getSessionRoles();
  const mine = roles.filter((r) => ALLOWED.includes(r.role));
  if (mine.length === 0) redirect('/admin?denied=1');
  const everything = mine.some((r) => r.role === 'admin' || r.role === 'board_member');
  const sections = [...new Set(mine.map((r) => r.section).filter(Boolean))];
  const scope = everything ? 'All sections' : sections.length ? sections.map((s) => (SECTION_LABEL[s] ?? s) + ' section').join(' and ') : 'No section set';

  const sb = supabaseServer();
  const { data: years, error: yErr } = await sb.from('academic_years').select('id,name,target_average').order('name', { ascending: false });
  const wanted = UUID.test(String(searchParams?.year ?? '')) ? searchParams.year : null;
  const cur = await getCurrentTerm();
  // the running session unless another was chosen
  const year = (years ?? []).find((y) => y.id === wanted) ?? (years ?? []).find((y) => y.id === cur?.year_id) ?? (years ?? [])[0];

  let body, failure = yErr?.message;
  if (year && !failure) {
    const [s, l, p] = await Promise.all([
      sb.rpc('dash_students', { p_year: year.id }), sb.rpc('dash_subject_leaders', { p_year: year.id }), sb.rpc('dash_pass_counts', { p_year: year.id })]);
    failure = s.error?.message || l.error?.message || p.error?.message;
    if (!failure) body = <DashboardClient key={year.id} yearId={year.id} students={s.data ?? []} leaders={l.data ?? []} pass={p.data ?? []} yearName={year.name} target={Number(year.target_average)} initialTerm={cur && cur.year_id === year.id ? cur.number : 0} />;
    else if (/could not find the function|does not exist|schema cache/i.test(failure)) failure = 'The dashboard functions are not in the database yet. Apply the files in supabase/migrations (002 to 005 add the dashboard) in the Supabase SQL editor, then reload.';
  }
  return (
    <div className="gd">
      <header className="gd-top">
        <div><h1>Dashboard</h1><p className="gd-hint">You are viewing: <strong>{scope}</strong></p></div>
        {(years ?? []).length > 0 && <YearPicker years={years} value={year?.id ?? ''} />}
      </header>
      {failure && <div className="gd-glass gd-error" role="alert">{failure}</div>}
      {!failure && !year && <div className="gd-glass gd-empty">No session has been created yet. Create one under Sessions, classes, subjects.</div>}
      {body}
    </div>
  );
}
