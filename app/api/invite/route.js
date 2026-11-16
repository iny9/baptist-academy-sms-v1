import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin, getSessionRoles } from '@/lib/supabase-server';
import { sameOrigin } from '@/lib/guard';

// Only ADMINISTRATORS are added by email. Everyone else is created from a name and a role on the Users page (username + default password).
const ROLES = ['admin'];
const SECTIONAL = [];

const Body = z.object({
  emails: z.array(z.string().trim().toLowerCase().email().max(254)).min(1).max(20),
  roles: z.array(z.object({ role: z.enum(ROLES), section: z.null() })).min(1).max(1),
}).refine((b) => b.roles.every((r) => SECTIONAL.includes(r.role) === (r.section !== null)), { message: 'Section rules violated' })
  .refine((b) => b.roles.every((r) => r.role !== 'principal' || r.section === 'secondary') &&
                 b.roles.every((r) => r.role !== 'headmaster' || r.section === 'basic'), { message: 'Principal is secondary; headmaster is basic' });

export async function POST(request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  // 1. authenticate + authorise the caller (admin only) with their own session
  const { user, roles } = await getSessionRoles();
  if (!user || !roles.some((r) => r.role === 'admin')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // 2. validate input
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const { emails, roles: assigned } = parsed.data;

  // 3. only now use the service role
  const admin = supabaseAdmin();
  const origin = process.env.NEXT_PUBLIC_SITE_URL;
  const results = [];
  for (const email of [...new Set(emails)]) {
    await admin.from('invites').delete().eq('email', email).is('consumed_at', null);
    const { error: e1 } = await admin.from('invites').insert({ email, roles: assigned, invited_by: user.id });
    if (e1) { results.push({ email, ok: false, error: 'Could not save invite' }); continue; }
    const { error: e2 } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: `${origin}/auth/accept` });
    results.push(e2 ? { email, ok: false, error: e2.message } : { email, ok: true });
  }
  return NextResponse.json({ results });
}
