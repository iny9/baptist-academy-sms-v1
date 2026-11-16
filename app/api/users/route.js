import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin, getSessionRoles } from '@/lib/supabase-server';
import { CREATABLE, aliasEmail, makeUsername, cleanEmail, cleanUsername, passwordProblem, normalizeRoles } from '@/lib/accounts';
import { sameOrigin, randomInt, randomPassword } from '@/lib/guard';
import { cleanName } from '@/lib/validate';
import { publicDbMessage } from '@/lib/errors';

export const runtime = 'nodejs';

// One person = a full name, a username, a password, one or more roles, and (optionally) an email.
// Username and password are chosen by the administrator; if either is left empty the server makes one.
// The email is optional: it is used only to send a link where the person sets a new password if they forget it.
const Person = z.object({
  full_name: z.string().transform((s) => cleanName(s, 120)).refine((s) => s.length >= 3, 'Enter the full name'),
  username: z.string().nullable().optional().transform((v) => (v && v.trim() ? cleanUsername(v) ?? 'invalid' : null)),
  password: z.string().max(200).nullable().optional().transform((v) => (v ? v : null)),
  must_change: z.boolean().optional().default(true),   // ask for a new password at the first sign-in
  roles: z.array(z.object({ role: z.enum(CREATABLE), section: z.enum(['basic', 'secondary']).nullable().optional() })).min(1, 'Choose at least one role').max(20),
  email: z.string().nullable().optional().transform((v) => (v && v.trim() ? cleanEmail(v) ?? 'invalid' : null)),
}).superRefine((p, ctx) => {
  if (p.username === 'invalid') ctx.addIssue({ code: 'custom', message: 'A username is 4-30 characters: letters and numbers, with single dots, dashes or underscores between them (not at the start or end)' });
  if (p.email === 'invalid') ctx.addIssue({ code: 'custom', message: 'That email address is not valid' });
  if (p.password) { const e = passwordProblem(p.password, p.username === 'invalid' ? null : p.username); if (e) ctx.addIssue({ code: 'custom', message: e }); }
  const r = normalizeRoles(p.roles); if (r.error) ctx.addIssue({ code: 'custom', message: r.error });
});
const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('delete'), user_id: z.string().uuid() }),
  z.object({ action: z.literal('create'), people: z.array(z.unknown()).min(1).max(25) }),   // the page sends bulk lists in batches of 25
  z.object({ action: z.literal('reset_password'), user_id: z.string().uuid(), password: z.string().max(200).nullable().optional(), must_change: z.boolean().optional().default(true) }),
]);

export async function POST(request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { user, roles } = await getSessionRoles();
  if (!user || !roles.some((r) => r.role === 'admin')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  const body = parsed.data;
  const admin = supabaseAdmin();

  // ---------- create people: username + password + roles (+ optional email) ----------
  if (body.action === 'create') {
    const results = [];
    for (const raw of body.people) {
      const p = Person.safeParse(raw);
      const label = String(raw?.full_name ?? '').slice(0, 120) || '(no name)';
      if (!p.success) { results.push({ full_name: label, ok: false, error: p.error.issues[0].message }); continue; }
      const person = p.data;
      const roles = normalizeRoles(person.roles).roles;
      const password = person.password || randomPassword(10);
      const generatedPassword = !person.password;
      const mustChange = generatedPassword ? true : person.must_change;

      // the username the administrator chose, or (if left empty) one made from the name
      let made = null, lastErr = '', taken = false;
      for (let attempt = 0; attempt < (person.username ? 1 : 12) && !made; attempt++) {
        const username = person.username || makeUsername(person.full_name, randomInt);
        const { data: used } = await admin.from('profiles').select('id').eq('username', username).maybeSingle();
        if (used) { taken = true; continue; }
        const { data, error } = await admin.auth.admin.createUser({
          email: aliasEmail(username), password, email_confirm: true,
          user_metadata: { full_name: person.full_name, username, default_password: mustChange, ...(person.email ? { contact_email: person.email } : {}) },
        });
        if (error) { lastErr = 'see server log'; console.error('create user failed', error.message); if (/already|registered|exists|duplicate/i.test(error.message)) { taken = true; continue; } break; }
        if (!data.user.email_confirmed_at) await admin.auth.admin.updateUserById(data.user.id, { email_confirm: true });   // the sign-in name is internal: it never needs verifying
        made = { id: data.user.id, username };
      }
      if (!made) { results.push({ full_name: person.full_name, ok: false, error: person.username && taken ? `The username “${person.username}” is already taken. Choose another.` : 'Could not create the account. Please try again.' }); continue; }

      const { error: re } = await admin.from('user_roles').insert(roles.map((r) => ({ user_id: made.id, role: r.role, section: r.section })));
      if (re) { await admin.auth.admin.deleteUser(made.id); results.push({ full_name: person.full_name, ok: false, error: 'Could not give the roles.' }); continue; }
      await admin.from('profiles').update({ created_by: user.id }).eq('id', made.id);
      results.push({ full_name: person.full_name, ok: true, username: made.username, password, must_change: mustChange, roles, email: person.email ?? '' });
    }
    return NextResponse.json({ results });
  }

  const { user_id } = body;

  // ---------- set a new password for a person who signs in with a username (the administrator types it, or one is made) ----------
  if (body.action === 'reset_password') {
    const { data: t } = await admin.from('profiles').select('id,username').eq('id', user_id).maybeSingle();
    if (!t) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    if (!t.username) return NextResponse.json({ error: 'This account signs in with an email, so it resets its password by email (Forgot your password).' }, { status: 400 });
    const typed = body.password ? String(body.password) : null;
    if (typed) { const pe = passwordProblem(typed, t.username); if (pe) return NextResponse.json({ error: pe }, { status: 400 }); }
    const password = typed || randomPassword(10);
    const mustChange = typed ? body.must_change : true;
    const { error } = await admin.auth.admin.updateUserById(user_id, { password, email_confirm: true });
    if (error) return NextResponse.json({ error: 'Could not reset the password.' }, { status: 400 });
    await admin.from('profiles').update({ must_change_password: mustChange }).eq('id', user_id);
    return NextResponse.json({ ok: true, username: t.username, password, must_change: mustChange });
  }

  // ---------- delete an account (roles, class-teacher and parent links go with it; records they created are kept) ----------
  if (user_id === user.id) return NextResponse.json({ error: 'You cannot delete your own account.' }, { status: 400 });
  const { data: target } = await admin.from('user_roles').select('id,role').eq('user_id', user_id);
  if ((target ?? []).some((r) => r.role === 'admin')) {
    const { count } = await admin.from('user_roles').select('id', { count: 'exact', head: true }).eq('role', 'admin').neq('user_id', user_id);
    if (!count) return NextResponse.json({ error: 'There must always be at least one administrator.' }, { status: 400 });
  }
  const { error } = await admin.auth.admin.deleteUser(user_id);
  if (error) return NextResponse.json({ error: publicDbMessage(error, 'Could not delete this user.') }, { status: 400 });
  return NextResponse.json({ ok: true });
}
