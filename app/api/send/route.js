import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseServer, supabaseAdmin, getSessionRoles } from '@/lib/supabase-server';
import { sendBatch, esc, allow, mailConfigProblem, MailError } from '@/lib/mail';
import { sendSms } from '@/lib/sms';
import { mailAddress } from '@/lib/accounts';

const Body = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('message'), parent_ids: z.array(z.string().uuid()).min(1).max(300), subject: z.string().trim().min(3).max(150), body: z.string().trim().min(1).max(5000), channel: z.enum(['email', 'sms', 'both']).default('email') }),
  z.object({ kind: z.literal('results'), term: z.string().uuid(), class_id: z.string().uuid() }),
  z.object({ kind: z.literal('newsletter'), id: z.string().uuid() }),
]);

const wrap = (title, inner) => `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;border:2px solid #3E9CA8;padding:20px"><h2 style="color:#0E3B43">${esc(title)}</h2>${inner}<p style="color:#777;font-size:12px">Baptist Academy Jimeta Yola</p></div>`;

export async function POST(request) {
  try { return await handle(request); }
  catch (e) { console.error('send error:', e); return NextResponse.json({ error: 'Something went wrong while sending. Please try again.' }, { status: 500 }); }
}

async function handle(request) {
  const { user, roles } = await getSessionRoles();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  if (!allow(user.id)) return NextResponse.json({ error: 'Too many send requests. Try again later.' }, { status: 429 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  const b = parsed.data; const has = (...r) => roles.some((x) => r.includes(x.role));
  if (b.kind !== 'message' || b.channel !== 'sms') { const problem = mailConfigProblem(); if (problem) return NextResponse.json({ error: problem }, { status: 503 }); }
  const sb = supabaseServer(); const admin = supabaseAdmin(); const out = []; let smsNote = '';

  let held = 0;
  try {
    if (b.kind === 'message') {
      if (!has('admin')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      if (b.channel !== 'email' && b.body.length > 459) return NextResponse.json({ error: 'SMS text is limited to 459 characters.' }, { status: 400 });
      const { data: parents } = await admin.from('user_roles').select('profiles(email,contact_email,username,full_name,phone)').eq('role', 'parent').in('user_id', b.parent_ids);
      if (b.channel !== 'email') {
        const r = await sendSms((parents ?? []).map((p) => p.profiles.phone), `${b.subject}: ${b.body}`.slice(0, 459));
        smsNote = ` ${r.sent} SMS sent` + (r.skipped ? `, ${r.skipped} skipped (no valid Nigerian number)` : '') + '.';
        if (b.channel === 'sms') return NextResponse.json({ sent: r.sent, note: smsNote.trim() });
      }
      if (parents?.length === 0) return NextResponse.json({ error: 'Those parents could not be found. Refresh the page and choose again.' }, { status: 404 });
      for (const p of parents ?? []) if (mailAddress(p.profiles)) out.push({ to: mailAddress(p.profiles), subject: b.subject, html: wrap(b.subject, `<p style="white-space:pre-wrap">${esc(b.body)}</p>`) });
    }
    if (b.kind === 'results') {
      if (!has('admin', 'exam_officer')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      const [{ data: term }, { data: rows }, { data: students }] = await Promise.all([
        sb.from('terms').select('number,academic_years(name)').eq('id', b.term).single(),
        sb.rpc('term_results', { p_term: b.term, p_class: b.class_id }),
        sb.from('students').select('id,first_name,last_name').eq('class_id', b.class_id).eq('status', 'active'),
      ]);
      for (const s of students ?? []) {
        const { data: ok } = await sb.rpc('manages_student', { p_student: s.id });
        const mine = (rows ?? []).filter((r) => r.student_id === s.id);
        if (!ok || mine.length === 0) continue;
        const { data: cleared } = await sb.rpc('term_cleared', { p_student: s.id, p_term: b.term });
        if (!cleared) { held++; continue; }          // results are released to parents only when the term's fees are cleared
        const { data: gs } = await admin.from('guardians').select('profiles(email,contact_email,username)').eq('student_id', s.id);
        const f = mine[0];
        const table = mine.map((r) => `<tr><td>${esc(r.subject_name)}</td><td>${r.ca1}</td><td>${r.ca2}</td><td>${r.exam}</td><td><b>${r.total}</b></td><td>${esc(r.grade)}</td></tr>`).join('');
        const html = wrap(`${s.last_name} ${s.first_name}: ${term.academic_years.name}, Term ${term.number}`,
          `<table border="1" cellpadding="5" style="border-collapse:collapse;width:100%"><tr><th>Subject</th><th>1st CA</th><th>2nd CA</th><th>Exam</th><th>Total</th><th>Grade</th></tr>${table}</table>
           <p>Average: <b>${f.term_average}</b> &nbsp; Position: <b>${f.class_position}</b> of ${f.class_size}${f.status ? ` &nbsp; Status: <b>${esc(f.status)}</b>` : ''}</p><p>${esc(f.remark)}</p>`);
        for (const g of gs ?? []) if (mailAddress(g.profiles)) out.push({ to: mailAddress(g.profiles), subject: `Report: ${s.last_name} ${s.first_name}`, html });
      }
    }
    if (b.kind === 'newsletter') {
      if (!has('admin', 'exam_officer')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      const { data: n } = await sb.from('newsletters').select('*').eq('id', b.id).single();
      if (!n) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      const allowed = n.section ? has('admin') || roles.some((r) => r.role === 'exam_officer' && r.section === n.section) : has('admin');
      if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      const { data: gs } = await admin.from('guardians').select('parent_id, profiles(email,contact_email,username), students(classes(section))');
      const seen = new Set();
      for (const g of gs ?? []) {
        if (n.section && g.students?.classes?.section !== n.section) continue;
        const addr = mailAddress(g.profiles);
        if (!addr || seen.has(addr)) continue; seen.add(addr);
        out.push({ to: addr, subject: n.title, html: wrap(n.title, `<p style="white-space:pre-wrap">${esc(n.body)}</p>`) });
      }
    }
    if (out.length === 0) return NextResponse.json({ error: b.kind === 'results' ? 'Nothing to send: either no parent is linked to these students, or none of them has results entered yet.' : 'No recipients found. Check that parents are linked to students.' }, { status: 422 });
    const n = await sendBatch(out);
    return NextResponse.json({ sent: n, note: `${n} email(s) sent.${smsNote}${held ? ` ${held} student(s) held back because their term fees are not cleared.` : ''}` });
  } catch (e) {
    const own = e instanceof MailError || /^SMS /.test(String(e?.message ?? ''));
    if (!own) console.error('send failed', e?.message);
    return NextResponse.json({ error: own && e.message ? e.message : 'The message could not be sent.', sent: e?.sent ?? 0 }, { status: 502 });
  }
}
