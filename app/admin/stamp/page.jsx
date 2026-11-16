import { redirect } from 'next/navigation';
import { getSessionRoles, supabaseServer } from '@/lib/supabase-server';
import StampManager from '@/components/StampManager';

export default async function StampPage() {
  const { roles } = await getSessionRoles();
  const isAdmin = roles.some((r) => r.role === 'admin');
  const sections = isAdmin ? ['basic', 'secondary'] : [roles.some((r) => r.role === 'headmaster') && 'basic', roles.some((r) => r.role === 'principal') && 'secondary'].filter(Boolean);
  if (!sections.length) redirect('/admin?denied=1');
  const { data } = await supabaseServer().from('site_settings').select('key,value').like('key', 'stamp_%');
  return <><h1>School stamp</h1><p className="auth-hint">Upload the stamp once. It is printed at the bottom right of every report card of the section, with the signature on the “Sign” spot and the printing date on the “Date” spot.</p>
    <StampManager sections={sections} settings={Object.fromEntries((data ?? []).map((x) => [x.key, x.value]))} /></>;
}
