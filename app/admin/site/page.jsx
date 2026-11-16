import { redirect } from 'next/navigation';
import { getSessionRoles, supabaseServer } from '@/lib/supabase-server';
import SiteEditor from '@/components/SiteEditor';

import SlidesEditor from '@/components/SlidesEditor';

export default async function Site() {
  const { roles } = await getSessionRoles();
  if (!roles.some((r) => r.role === 'admin')) redirect('/admin?denied=1');
  const sb = supabaseServer();
  const { data: slides } = await sb.from('hero_slides').select('*').order('sort_order');
  const [s, b, p] = await Promise.all([
    sb.from('site_settings').select('key,value'),
    sb.from('board_members').select('*').order('sort_order'),
    sb.from('past_leaders').select('*').order('start_year', { ascending: false }),
  ]);
  return <><h1>Website content</h1><SlidesEditor slides={slides ?? []} /><p className="panel">Report card stamps and signatures are now managed on the <a href="/admin/stamp">School stamps</a> page.</p><SiteEditor settings={s.data ?? []} board={b.data ?? []} leaders={p.data ?? []} /></>;
}
