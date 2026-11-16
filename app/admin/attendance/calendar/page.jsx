import { redirect } from 'next/navigation';
import { getSessionRoles, supabaseServer } from '@/lib/supabase-server';
import AttendanceCalendar from '@/components/attendance/AttendanceCalendar';

// Exam end date (admin, exam officer) and holidays (admin, exam officer, principal, headmaster/headmistress) per section.
export default async function CalendarPage() {
  const { roles } = await getSessionRoles();
  const mine = roles.filter((r) => ['admin', 'exam_officer', 'principal', 'headmaster'].includes(r.role));
  if (mine.length === 0) redirect('/admin?denied=1');
  const isAdmin = mine.some((r) => r.role === 'admin');
  const sections = isAdmin ? ['secondary', 'basic'] : [...new Set(mine.map((r) => r.section).filter(Boolean))];
  const canExamEnd = Object.fromEntries(['secondary', 'basic'].map((s) => [s, isAdmin || mine.some((r) => r.role === 'exam_officer' && r.section === s)]));
  const sb = supabaseServer();
  const { data: terms } = await sb.from('terms').select('id,number,starts_on,ends_on,academic_years(name)').order('starts_on', { ascending: false });
  return (<><h1>Attendance calendar</h1>
    <p className="auth-hint">Set the day examinations end for each term (attendance can be taken up to that day) and the holidays or no-school days inside the term. Weekends are never school days. Times school opens is counted from these dates.</p>
    <AttendanceCalendar terms={terms ?? []} sections={sections} canExamEnd={canExamEnd} isAdmin={isAdmin} /></>);
}
