import { redirect } from 'next/navigation';
import { getSessionRoles, supabaseServer, getCurrentTerm } from '@/lib/supabase-server';
import AttendanceReports from '@/components/attendance/AttendanceReports';
import { uuidOr } from '@/lib/validate';

// Heads (their section), exam officers, board members and the administrator read submitted attendance here.
export default async function ReportsPage({ searchParams }) {
  const { roles } = await getSessionRoles();
  if (!roles.some((r) => ['admin', 'exam_officer', 'principal', 'headmaster'].includes(r.role))) redirect('/admin?denied=1');
  const sb = supabaseServer(); const cur = await getCurrentTerm();
  const [{ data: years }, { data: terms }] = await Promise.all([
    sb.from('academic_years').select('id,name').order('name', { ascending: false }),
    sb.from('terms').select('id,number,year_id,starts_on,ends_on').order('number'),
  ]);
  const year = (years ?? []).find((y) => y.id === uuidOr(searchParams.year))?.id ?? (years ?? []).find((y) => y.id === cur?.year_id)?.id ?? years?.[0]?.id ?? '';
  return (<><h1>Attendance reports</h1>
    <p className="auth-hint">You see the sections your role covers. The page refreshes by itself when a class teacher saves a register.</p>
    {year ? <AttendanceReports years={years} year={year} terms={(terms ?? []).filter((t) => t.year_id === year)} /> : <div className="empty">No session has been created yet.</div>}</>);
}
