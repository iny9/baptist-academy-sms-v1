import { NextResponse } from 'next/server';
import { getSessionRoles, supabaseServer } from '@/lib/supabase-server';
import { canOpenDashboard } from '@/lib/dash-access';

export const runtime = 'nodejs';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Scores for the class-level scatter plot, fetched when the person opens that tab or changes term.
// Same two gates as the page: the role list here, and the section limit inside dash_scores().
export async function GET(request) {
  const { user, roles } = await getSessionRoles();
  if (!user || !canOpenDashboard(roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const q = new URL(request.url).searchParams;
  const year = q.get('year') ?? '', term = Number(q.get('term'));
  if (!UUID.test(year) || !Number.isInteger(term) || term < 0 || term > 3) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  const { data, error } = await supabaseServer().rpc('dash_scores', { p_year: year, p_term: term });
  if (error) return NextResponse.json({ error: /could not find the function|schema cache/i.test(error.message) ? 'The database is missing a migration. Ask the administrator to apply supabase/migrations.' : 'The scores could not be loaded.' }, { status: 500 });
  return NextResponse.json(data, { headers: { 'Cache-Control': 'private, no-store' } });
}
