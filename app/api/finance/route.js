import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseServer, getSessionRoles } from '@/lib/supabase-server';
import { sameOrigin } from '@/lib/guard';
import { allow } from '@/lib/mail';
import { publicDbMessage } from '@/lib/errors';

export const runtime = 'nodejs';
const uuid = z.string().uuid();
// Confirmations, rejections and reminders now happen on the dashboard and in the parent's inbox (the database writes the inbox message), so this route sends no e-mail.
const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('issue'), term: uuid, class_id: uuid.optional() }),
  z.object({ action: z.literal('submitted'), ids: z.array(uuid).min(1).max(50) }),
  z.object({ action: z.literal('review'), id: uuid, accept: z.boolean(), note: z.string().trim().max(200).optional() }),
  z.object({ action: z.literal('confirm'), line_ids: z.array(uuid).min(1).max(200), accept: z.boolean(), note: z.string().trim().max(200).optional() }),
]);

export async function POST(request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { user, roles } = await getSessionRoles();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  if (!allow('fin:' + user.id, 30)) return NextResponse.json({ error: 'Too many requests. Try again shortly.' }, { status: 429 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  const b = parsed.data; const has = (...r) => roles.some((x) => r.includes(x.role));
  const sb = supabaseServer();
  const fail = (error) => NextResponse.json({ error: publicDbMessage(error) }, { status: 400 });

  if (b.action === 'issue') {      // catch-up only: schedules are added automatically when an item is saved
    if (!has('admin', 'bursar')) return NextResponse.json({ error: 'Only the bursar can do this.' }, { status: 403 });
    const { data: n, error } = await sb.rpc('issue_schedule', { p_term: b.term, p_class: b.class_id ?? null });
    if (error) return fail(error);
    return NextResponse.json({ issued: n, note: `${n} missing fee line(s) added.` });
  }
  if (b.action === 'submitted') return NextResponse.json({ ok: true });   // the bursar sees new evidence on the dashboard
  if (b.action === 'review') {
    if (!has('bursar')) return NextResponse.json({ error: 'Only the bursar can confirm payments.' }, { status: 403 });
    const { data: n, error } = await sb.rpc('review_submission', { p_id: b.id, p_accept: b.accept, p_note: b.note ?? null });
    if (error) return fail(error);
    return NextResponse.json({ updated: n, note: `${b.accept ? 'Confirmed' : 'Rejected'}: ${n} item(s) updated. The parent sees it in their inbox.` });
  }
  if (b.action === 'confirm') {
    if (!has('bursar')) return NextResponse.json({ error: 'Only the bursar can confirm payments.' }, { status: 403 });
    const { data: n, error } = await sb.rpc('confirm_payment', { p_lines: b.line_ids, p_accept: b.accept, p_note: b.note ?? null });
    if (error) return fail(error);
    return NextResponse.json({ updated: n, note: `${n} item(s) updated.` });
  }
}
