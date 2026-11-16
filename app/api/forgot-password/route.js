import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-server';
import { USERNAME_RE, aliasEmail } from '@/lib/accounts';
import { sameOrigin } from '@/lib/guard';
import { sendBatch, wrapEmail, esc, MailError } from '@/lib/mail';

export const runtime = 'nodejs';
const Body = z.object({ username: z.string().trim().toLowerCase().max(40) });
const COOLDOWN_MIN = 15;      // one new password per person per 15 minutes (stops people from locking someone out by spamming)
const HOURLY_CAP = 40;        // school-wide cap per hour

// The answer is always the same, so nobody can use this page to find out which usernames exist.
const SAME = { ok: true, message: 'If that username is registered and has an email address on record, a link to set a new password has been sent to it. If you have no email on record, ask the administrator to reset your password.' };

export async function POST(request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !USERNAME_RE.test(parsed.data.username)) return NextResponse.json(SAME);
  const admin = supabaseAdmin();

  const { data: p } = await admin.from('profiles').select('id,full_name,contact_email,username').eq('username', parsed.data.username).maybeSingle();
  if (!p || !p.contact_email) return NextResponse.json(SAME);

  const since = (min) => new Date(Date.now() - min * 60000).toISOString();
  const [{ count: recent }, { count: hour }] = await Promise.all([
    admin.from('password_resets').select('id', { count: 'exact', head: true }).eq('user_id', p.id).gte('requested_at', since(COOLDOWN_MIN)),
    admin.from('password_resets').select('id', { count: 'exact', head: true }).gte('requested_at', since(60)),
  ]);
  if (recent > 0 || hour >= HOURLY_CAP) return NextResponse.json(SAME);

  // Make a one-time "set a new password" link for the account WITHOUT emailing the internal alias, then send it to the email on record.
  // The password itself is not changed here: it changes only when the person opens the link and sets a new one.
  await admin.from('password_resets').insert({ user_id: p.id });   // every attempt counts toward the cooldown, so nobody can flood an inbox
  const { data: link, error: le } = await admin.auth.admin.generateLink({ type: 'recovery', email: aliasEmail(p.username) });
  const token = link?.properties?.hashed_token;
  if (le || !token) { console.error('forgot-password link failed'); return NextResponse.json(SAME); }
  const origin = (process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin).replace(/\/$/, '');
  const url = `${origin}/auth/confirm?token_hash=${encodeURIComponent(token)}&type=recovery&next=/reset-password`;
  try {
    await sendBatch([{ to: p.contact_email, subject: 'Set a new Baptist Academy password', html: wrapEmail('Set a new password',
      `<p>Hello ${esc(p.full_name ?? '')},</p><p>A new password was requested for the username <strong>${esc(p.username)}</strong>.</p>` +
      `<p><a href="${esc(url)}" style="display:inline-block;background:#1B3A7A;color:#fff;padding:10px 18px;text-decoration:none;border-radius:6px">Set my new password</a></p>` +
      `<p>The link works once and expires after a short time. After you save your new password you are signed in.</p>` +
      `<p>If you did not ask for this, ignore this email: your password stays as it is.</p>`) }]);
  } catch (e) {
    console.error('forgot-password email failed', e instanceof MailError ? e.message : 'unknown');   // the real reason stays on the server
  }
  return NextResponse.json(SAME);
}
