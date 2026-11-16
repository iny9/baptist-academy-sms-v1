import Link from 'next/link';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getSessionRoles, supabaseServer } from '@/lib/supabase-server';
import AdminNav from '@/components/AdminNav';
import Icon from '@/components/Icon';
import ThemeToggle from '@/components/ThemeToggle';
import OfflineBanner from '@/components/OfflineBanner';
import RoleSwitcher from '@/components/RoleSwitcher';
import MobileChrome from '@/components/MobileChrome';
import { navFor, ROLE_LABEL } from '@/lib/nav';
import { viewAllows, parentMix } from '@/lib/active-role';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }) {
  // The sidebar and the badges always show everything the person holds; each module's own "View as" picker narrows what that module shows and allows.
  const hid = headers().get('x-ba-user-id');   // verified by the middleware: lets the profile read start at the same time as the roles read
  const profileQ = () => supabaseServer().from('profiles').select('full_name,avatar_url,must_change_password');
  const [{ user, allRoles, viewing }, early] = await Promise.all([getSessionRoles(), hid ? profileQ().eq('id', hid).maybeSingle() : Promise.resolve(null)]);
  if (!user) redirect('/login');
  const names = allRoles.map((r) => r.role);
  if (names.length === 0) redirect('/');   // visitors and users with no role never reach the panel
  const held = [...new Set(names)];
  // a role that needs a section but has none can never open its pages: say so instead of showing empty screens
  const noSection = [...new Set(allRoles.filter((r) => ['exam_officer', 'principal', 'headmaster', 'class_teacher', 'subject_teacher'].includes(r.role) && !r.section).map((r) => ROLE_LABEL[r.role]))];
  const roleHrefs = Object.fromEntries(held.map((r) => [r, navFor([r]).flatMap((g) => g.items.map((i) => i.href))]));
  const me = early ? early.data : (await profileQ().eq('id', user.id).maybeSingle()).data;
  // a person still on the default (or a system-sent) password may only open My profile until they change it
  if (me?.must_change_password && !(headers().get('x-ba-scope') ?? '').startsWith('/admin/profile')) redirect('/admin/profile?force=1');
  const label = me?.full_name || user.email;
  // A parent who also holds another role acts as a parent until they pick the other role: a page that parents cannot open asks them to choose first,
  // so nothing about any other child can appear before that choice is made on purpose.
  const scope = headers().get('x-ba-scope') ?? '';
  const needRole = parentMix(names) && viewing === 'parent' && !viewAllows('parent', scope);
  // the three pages a phone user reaches for most, from whatever their roles open (Home and More are always there)
  const SHORT = { '/admin/dashboard': 'Dashboard', '/admin/students': 'Students', '/admin/payments': 'Payment', '/admin/attendance': 'Attendance', '/admin/results': 'Results', '/admin/assessment': 'Scores', '/admin/bursar': 'Bursar', '/admin/inbox': 'Inbox', '/admin/attendance/children': 'Attendance' };
  const flat = navFor(names).flatMap((g) => g.items);
  const tabs = Object.keys(SHORT).map((h) => flat.find((i) => i.href === h)).filter(Boolean).slice(0, 3).map((i) => ({ href: i.href, icon: i.icon, short: SHORT[i.href] }));
  return (
    <div className="shell">
      <OfflineBanner />
      <MobileChrome tabs={tabs} initial={label[0].toUpperCase()} name={label} />
      <aside className="side">
        <Link href="/" className="logo"><img src="/logo-96.webp" alt="" width="38" height="38" decoding="async" /><span>Baptist Academy</span></Link>
        <AdminNav groups={navFor(names)} />
        <div className="me">
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
            {me?.avatar_url ? <img src={me.avatar_url} alt="" width="36" height="36" style={{ borderRadius: '50%', objectFit: 'cover' }} /> : <div className="avatar">{label[0].toUpperCase()}</div>}
            <div style={{ minWidth: 0 }}><div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div></div>
          </div>
          <div>{[...new Set(names)].map((n) => <span key={n} className="badge">{ROLE_LABEL[n]}</span>)}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}><ThemeToggle /><form action="/api/signout" method="post" style={{ flex: 1 }}><button className="btn ghost small" style={{ width: '100%', background: 'transparent', color: '#CFE3E7', borderColor: 'rgba(255,255,255,.2)' }}><Icon name="logout" size={15} />Sign out</button></form></div>
        </div>
      </aside>
      <main className="main" id="main">{noSection.length > 0 && <div className="notice" role="alert" style={{ marginBottom: 16 }}>Your {noSection.join(', ')} role has no section (Basic or Secondary) set, so its pages will be empty. Ask the administrator to set it on Users and roles.</div>}<RoleSwitcher held={held} roleHrefs={roleHrefs} />
        {needRole && <div className="notice info" role="status" style={{ marginBottom: 16 }}><div className="n-body"><strong>You are acting as Parent/Guardian</strong><p>This page belongs to another role of yours. It opens, but you only see your own children’s records until you choose that role in the “View as” bar above.</p></div></div>}
        {children}</main>
    </div>
  );
}
