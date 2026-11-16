import Link from 'next/link';
import Icon from '@/components/Icon';
import { getSessionRoles, supabaseServer } from '@/lib/supabase-server';
import { navFor } from '@/lib/nav';

const BLURB = {
  '/admin/dashboard': 'Averages, top students and trends', '/admin/academics': 'Create sessions, classes and subjects', '/admin/teaching': 'Assign class and subject teachers',
  '/admin/students': 'Add, import and manage students', '/admin/rollover': 'Promote or graduate students', '/admin/assessment': 'Enter scores, attendance and ratings',
  '/admin/results': 'View and download report cards', '/admin/ca-form': 'Printable continuous assessment lists', '/admin/ca-submissions': 'See CA forms that have been filled in', '/admin/payments': 'Fees per term in naira',
  '/admin/newsletters': 'Write and send newsletters', '/admin/messages': 'Email or text parents', '/admin/users': 'Create staff and parents; add administrators',
  '/admin/site': 'Edit the public website', '/admin/audit': 'See every change made', '/admin/profile': 'Your details and password',
};

export default async function Overview({ searchParams }) {
  const { roles, user } = await getSessionRoles();
  const names = roles.map((r) => r.role);
  const sb = supabaseServer();
  const isStaff = names.some((n) => ['admin', 'exam_officer', 'principal', 'headmaster'].includes(n));
  let counts = null;
  if (isStaff) {
    const [s, c, y] = await Promise.all([
      sb.from('students').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      sb.from('classes').select('id', { count: 'exact', head: true }),
      sb.from('academic_years').select('name').order('name', { ascending: false }).limit(1),
    ]);
    counts = { students: s.count ?? 0, classes: c.count ?? 0, session: y.data?.[0]?.name ?? 'None yet' };
  }
  const { data: me } = user ? await sb.from('profiles').select('full_name').eq('id', user.id).maybeSingle() : { data: null };
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Lagos', hour: '2-digit', hour12: false }).format(new Date()));
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const first = (me?.full_name ?? '').split(' ')[0];
  const TONES = ['blue', 'teal', 'green', 'amber', 'violet', 'rose', 'indigo', 'slate'];
  const items = navFor(names).flatMap((g) => g.items).filter((i) => i.href !== '/admin');
  return (<>
    {searchParams?.denied && <div className="notice" role="alert" style={{ marginBottom: 20 }}>That page is not open to the role you are using. If you hold more than one role, use the “View as” bar on that page and choose the role that opens it.</div>}
    <section className="hero-card" aria-label="Overview">
      <p className="hero-kicker">{greeting}{first ? `, ${first}` : ''}</p>
      <h1>Here is your school overview</h1>
      {counts && <div className="hero-stats">
        <div className="hero-stat"><Icon name="cap" size={20} /><div><b>{counts.students}</b><span>Active students</span></div></div>
        <div className="hero-stat"><Icon name="layers" size={20} /><div><b>{counts.classes}</b><span>Classes</span></div></div>
        <div className="hero-stat"><Icon name="calendar" size={20} /><div><b>{counts.session}</b><span>Latest session</span></div></div>
      </div>}
    </section>
    <section className="home-section" aria-labelledby="qa"><h2 id="qa">Quick actions <small>Tap to open</small></h2>
      <div className="hq-tiles">{items.map((i, n) => (
        <Link key={i.href} href={i.href} className={'hq-tile tone-' + TONES[n % TONES.length]}><span className="hq-tile-ico"><Icon name={i.icon} size={26} /></span><strong>{i.label}</strong><small>{BLURB[i.href]}</small></Link>))}</div>
    </section>
  </>);
}
