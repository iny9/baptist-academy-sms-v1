import { NextResponse } from 'next/server';
import { supabaseServer, getSessionRoles } from '@/lib/supabase-server';
import { allow } from '@/lib/mail';
import { publicDbMessage } from '@/lib/errors';
import { sampleReport, sampleSchedule, sampleNewsletter, sampleDebtors, sampleCaForm, sampleBasicCa } from '@/lib/samples';
import { parseLayout, stampKeys } from '@/lib/stamp';
import { UUID, uuidList } from '@/lib/validate';
import { bySurname, cmp } from '@/lib/sort';

export const runtime = 'nodejs';
const SUBS = ['nursery', 'primary', 'junior', 'senior'];
const send = (bytes, name) => new Response(bytes, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${name.replace(/[^A-Za-z0-9._-]/g, '_')}.pdf"`, 'Cache-Control': 'no-store' } });
let acceptsHtml = false;
// Browsers that navigate to a download link get a readable page; other callers get JSON.
const fail = (error, status) => acceptsHtml
  ? new Response(`<!doctype html><meta charset="utf-8"><title>Could not create the file</title><body style="font-family:system-ui;max-width:560px;margin:15vh auto;padding:0 20px;color:#0F1F44"><h1>Could not create the file</h1><p>${String(error).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</p><p><a href="javascript:history.back()">Go back</a></p></body>`, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  : NextResponse.json({ error }, { status });

export const dynamic = 'force-dynamic';   // never a cached copy: a download is built from the records as they are now

export async function GET(request) {
  acceptsHtml = (request.headers.get('accept') ?? '').includes('text/html');
  try { return await handle(request); }
  catch (e) {
    const missing = e?.code === 'MODULE_NOT_FOUND' || /Cannot find module|Can't resolve|Module not found/i.test(String(e?.message));
    console.error('PDF error:', e);
    return fail(missing ? 'The PDF engine is not installed on this server. Run "npm install" in the project folder (or redeploy) and try again.' : 'Something went wrong while creating the file. Please try again, and tell the admin if it keeps happening.', 500);
  }
}

async function handle(request) {
  const { newDoc, loadImage, receiptDoc, recordDoc, reportPage, schedulePage, newsletterDoc, debtorsDoc, caFormPages, basicCaSheets } = await import('@/lib/pdf');
  const url = new URL(request.url); const q = Object.fromEntries(url.searchParams); const origin = url.origin;
  const { user, roles } = await getSessionRoles();
  if (!user) return fail('Sign in required', 401);
  const has = (...r) => roles.some((x) => r.includes(x.role));
  if (!allow('pdf:' + user.id, 40)) return fail('Too many downloads. Try again shortly.', 429);
  if (q.template && q.template !== 'harvard') return fail('Unknown template', 400);
  for (const k of ['term', 'student', 'class', 'id', 'year', 'parent', 'subject']) if (q[k] && !UUID.test(q[k]) && !(k === 'year' && q.kind === 'record' && /^[0-9A-Za-z /-]{1,20}$/.test(q.year))) return fail('Invalid request', 400);
  const studentIds = uuidList(q.students, 200); if (studentIds.some((x) => !UUID.test(x))) return fail('Invalid request', 400);
  if (q.section && !['basic', 'secondary'].includes(q.section)) return fail('Invalid request', 400);
  if (q.subsection && !SUBS.includes(q.subsection)) return fail('Invalid request', 400);
  if (q.kind && !['template', 'newsletter', 'debtors', 'ca-form', 'ca-filled', 'report', 'schedule', 'receipt', 'record'].includes(q.kind)) return fail('Unknown request', 400);

  const sb = supabaseServer();
  const { data: set } = await sb.from('site_settings').select('key,value');
  const S = Object.fromEntries((set ?? []).map((x) => [x.key, x.value]));
  const base = await newDoc(); const logo = await loadImage(base.doc, origin + '/logo.jpeg', origin);
  const ctx = { ...base, logo, S }; const isAdmin = has('admin');

  // ---------- receipts and student financial records: the database decides who may see them (bursar, admin, the child's parent) ----------
  if (q.kind === 'receipt') {
    if (!['payment', 'item', 'term'].includes(q.rkind) || !UUID.test(q.id ?? '')) return fail('Invalid request', 400);
    const { data, error } = await sb.rpc('receipt_data', { p_kind: q.rkind, p_id: q.id, p_term: q.term ?? null });
    if (error || !data) return fail(error?.message ?? 'Receipt not available', 400);
    receiptDoc(ctx, data);
    return send(await base.doc.save(), `receipt-${data.receipt_no}`);
  }
  if (q.kind === 'record') {
    if (!UUID.test(q.student ?? '')) return fail('Invalid request', 400);
    if (!has('admin', 'bursar')) return fail('Forbidden', 403);
    const [{ data: card }, { data: lines }] = await Promise.all([sb.rpc('student_card', { p_student: q.student }), sb.rpc('student_finance_record', { p_student: q.student })]);
    const st = card?.[0]; if (!st) return fail('Student not found', 404);
    const sel = (lines ?? []).filter((l) => (!q.year || l.year_name === q.year) && (!q.term || l.term_id === q.term));
    const groups = []; for (const l of sel) { let g = groups.find((x) => x.id === l.term_id); if (!g) groups.push(g = { id: l.term_id, label: `${l.year_name}, Term ${l.term_number}`, cleared: l.term_is_cleared, total: 0, lines: [] }); g.total += Number(l.amount_ngn); g.lines.push({ title: l.title, amount: l.amount_ngn, status: l.status, ref: l.claim_reference }); }
    const sum = (f) => sel.filter(f).reduce((a, l) => a + Number(l.amount_ngn), 0);
    recordDoc(ctx, { student: { name: `${st.last_name} ${st.first_name}`, admission_no: st.admission_no, class: st.class_name, section: st.section }, groups, paid: sum((l) => l.status === 'confirmed'), owing: sum((l) => l.status !== 'confirmed'), filter: q.year || '' });
    return send(await base.doc.save(), `finance-${st.last_name}-${st.first_name}`);
  }

  // ---------- templates: fake data, admin only ----------
  if (q.kind === 'template') {
    if (!isAdmin) return fail('Forbidden', 403);
    const n = q.name;
    if (n === 'report-primary') { reportPage(ctx, sampleReport(1, 'basic')); reportPage(ctx, sampleReport(3, 'basic')); }
    else if (n === 'report-primary-harvard') { reportPage(ctx, { ...sampleReport(1, 'basic'), template: 'harvard' }); reportPage(ctx, { ...sampleReport(3, 'basic'), template: 'harvard' }); }
    else if (n === 'report' || n === 'report-secondary') { reportPage(ctx, sampleReport(1)); reportPage(ctx, sampleReport(3)); }
    else if (n === 'report-secondary-harvard') { reportPage(ctx, { ...sampleReport(1), template: 'harvard' }); reportPage(ctx, { ...sampleReport(3), template: 'harvard' }); }
    else if (n === 'schedule') schedulePage(ctx, sampleSchedule());
    else if (n === 'newsletter') newsletterDoc(ctx, sampleNewsletter());
    else if (n === 'debtors') debtorsDoc(ctx, sampleDebtors());
    else if (n === 'ca-form') caFormPages(ctx, sampleCaForm());
    else if (n === 'ca-basic') basicCaSheets(ctx, sampleBasicCa());
    else return fail('Unknown template', 400);
    return send(await base.doc.save(), `template-${n}`);
  }

  if (q.kind === 'newsletter') {
    if (!has('admin', 'exam_officer')) return fail('Forbidden', 403);
    const { data: n } = await sb.from('newsletters').select('*').eq('id', q.id).maybeSingle();
    if (!n) return fail('Not found', 404);
    newsletterDoc(ctx, n); return send(await base.doc.save(), 'newsletter-' + n.title.slice(0, 30));
  }

  // ---------- outstanding fees: scope is enforced inside fee_ledger by the caller's role ----------
  if (q.kind === 'debtors') {
    if (!has('admin', 'bursar', 'exam_officer', 'principal', 'headmaster', 'class_teacher')) return fail('Forbidden', 403);
    if (!q.year && !q.term) return fail('Choose a session or term', 400);
    const { data, error } = await sb.rpc('fee_ledger', { p_term: q.term ?? null, p_year: q.year ?? null });
    if (error) return fail(publicDbMessage(error), 400);
    const rows = (data ?? []).filter((r) => r.status !== 'confirmed' && (!q.section || r.section === q.section) && (!q.class || r.class_id === q.class));
    const m = new Map(); for (const r of rows) (m.get(r.student_id) ?? m.set(r.student_id, { name: r.student_name, className: r.class_name, status: r.student_status, items: [] }).get(r.student_id)).items.push({ title: r.title, amount: r.amount_ngn, status: r.status });
    const groups = [...m.values()].sort((a, b) => a.className.localeCompare(b.className) || a.name.localeCompare(b.name));
    const sess = rows[0] ? (q.term ? `${rows[0].year_name}, Term ${rows[0].term_number}` : `${rows[0].year_name} session, all terms`) : 'Outstanding fees';
    const role = has('bursar') ? 'Bursar' : has('admin') ? 'Admin' : has('principal') ? 'Principal' : has('headmaster') ? 'Headmaster/Headmistress' : has('exam_officer') ? 'Exam officer' : 'Class teacher';
    debtorsDoc(ctx, { scope: `${q.class ? 'One class' : q.section ? (q.section === 'basic' ? 'Basic section' : 'Secondary section') : 'All sections you cover'}, ${sess}`, session: sess, generatedFor: role, groups });
    return send(await base.doc.save(), 'outstanding-fees');
  }

  // ---------- CA form: secondary = one subject for the class; basic = one sheet per child with every subject ----------
  if (q.kind === 'ca-form') {
    if (!has('admin', 'exam_officer', 'subject_teacher', 'class_teacher')) return fail('Forbidden', 403);
    const [{ data: term }, { data: cls }] = await Promise.all([
      sb.from('terms').select('id,number,academic_years(name)').eq('id', q.term).maybeSingle(), sb.from('classes').select('id,name,section').eq('id', q.class).maybeSingle()]);
    if (!term || !cls) return fail('Not found', 404);
    const { data: st } = await sb.from('students').select('first_name,last_name,other_names').eq('class_id', cls.id).eq('status', 'active');
    const sorted = (st ?? []).slice().sort(bySurname);
    if (cls.section === 'basic') {
      const { data: subs, error } = await sb.rpc('class_active_subjects', { p_term: term.id, p_class: cls.id });
      if (error || !subs?.length) return fail('That class has no subjects this term (or you cannot see it).', 403);
      if (!sorted.length) return fail('That class has no active students.', 404);
      const names = subs.map((x) => x.subject_name).sort(cmp);
      basicCaSheets(ctx, { term, className: cls.name, children: sorted.map((x) => ({ name: `${x.last_name} ${x.first_name}`, subjects: names })) });
      return send(await base.doc.save(), `ca-sheets-${cls.name}`);
    }
    if (!q.subject) return fail('Choose a subject', 400);
    const { data: subj } = await sb.from('subjects').select('id,name').eq('id', q.subject).maybeSingle();
    const { data: act } = await sb.rpc('class_active_subjects', { p_term: term.id, p_class: cls.id });
    if (!subj || !(act ?? []).some((x) => x.subject_id === subj.id)) return fail('That subject is not taken by this class this term (or you cannot see it).', 403);
    caFormPages(ctx, { term, className: cls.name, subject: subj.name, students: sorted.map((s) => `${s.last_name} ${s.first_name}`) });
    return send(await base.doc.save(), `ca-form-${cls.name}-${subj.name}`);
  }

  // ---------- a FILLED CA form (the saved scores of one subject in one class) ----------
  // Who may open it is decided by the database (ca_form_sheet): admin, the exam officer of the section, the class teacher / form master of THAT class, and the person who filled it.
  if (q.kind === 'ca-filled') {
    if (!has('admin', 'exam_officer', 'subject_teacher', 'class_teacher')) return fail('Forbidden', 403);
    if (!q.term || !q.class || !q.subject) return fail('Choose a term, class and subject', 400);
    const [{ data: term }, { data: cls }, { data: subj }, sheet] = await Promise.all([
      sb.from('terms').select('id,number,academic_years(name)').eq('id', q.term).maybeSingle(), sb.from('classes').select('id,name,section').eq('id', q.class).maybeSingle(),
      sb.from('subjects').select('id,name').eq('id', q.subject).maybeSingle(), sb.rpc('ca_form_sheet', { p_term: q.term, p_class: q.class, p_subject: q.subject })]);
    if (!term || !cls || !subj) return fail('Not found', 404);
    if (sheet.error || !(sheet.data ?? []).length) return fail('That filled CA form is not available to you.', 404);
    const rowsF = sheet.data.slice().sort((a, b) => cmp(a.student_name, b.student_name));
    caFormPages(ctx, { term, className: cls.name, subject: subj.name, students: rowsF.map((r) => r.student_name), values: rowsF, filled: true });
    return send(await base.doc.save(), `ca-filled-${cls.name}-${subj.name}`);
  }

  // ---------- report cards and payment schedules: admin and exam officers only ----------
  if (!has('admin', 'exam_officer')) return fail('Forbidden', 403);
  const { data: term } = await sb.from('terms').select('*,academic_years(name)').eq('id', q.term).maybeSingle();
  if (!term) return fail('Term not found', 404);
  let query = sb.from('students_with_age').select('*');
  if (studentIds.length) query = query.in('id', studentIds);
  else if (q.student) query = query.eq('id', q.student);
  else if (q.parent) { const { data: g } = await sb.rpc('guardian_links'); const ids = (g ?? []).filter((x) => x.parent_id === q.parent).map((x) => x.student_id); if (!ids.length) return fail('No children found for that parent', 404); query = query.in('id', ids); }
  else if (q.class && q.kind === 'report') query = query.eq('class_id', q.class).eq('status', 'active');
  else if (q.subsection && q.kind === 'report') { const { data: cl } = await sb.from('classes').select('id').eq('sub_section', q.subsection); query = query.in('class_id', (cl ?? []).map((c) => c.id)).eq('status', 'active'); }
  else if (q.section && q.kind === 'report') { const { data: cl } = await sb.from('classes').select('id').eq('section', q.section); query = query.in('class_id', (cl ?? []).map((c) => c.id)).eq('status', 'active'); }
  else return fail('Choose a class, section, students or a parent', 400);
  const students = ((await query).data ?? []);
  const { data: classes } = await sb.from('classes').select('id,name,section');
  const clsOf = (id) => classes.find((c) => c.id === id);
  students.sort((a, b) => cmp(clsOf(a.class_id)?.name, clsOf(b.class_id)?.name) || bySurname(a, b));
  // one permission check per class (not per student)
  const okClass = new Map(await Promise.all([...new Set(students.map((s) => s.class_id))].map(async (c) => [c, isAdmin || (await sb.rpc('can_manage_class', { p: c })).data === true])));
  const allowed = students.filter((s) => okClass.get(s.class_id));
  if (allowed.length === 0) return fail('Nothing to download (or not permitted)', 404);
  if (allowed.length > 200) return fail('Choose at most 200 students at a time', 400);

  if (q.kind === 'report') {
    // the Harvard-style card (black and white) is for the administrator only; every other report card is the coloured one, in lighter colours
    if (q.template === 'harvard' && !isAdmin) return fail('The Harvard-style report card is available to the administrator only.', 403);
    const harvard = q.template === 'harvard' && isAdmin, bw = harvard;
    const ids = allowed.map((s) => s.id); const classIds = [...new Set(allowed.map((s) => s.class_id))];
    const secs = [...new Set(allowed.map((s) => clsOf(s.class_id).section))];   // report cards are produced from whatever has been entered; incomplete sheets no longer block the download
    const results = {}; await Promise.all(classIds.map(async (c) => { results[c] = (await sb.rpc('term_results', { p_term: term.id, p_class: c })).data ?? []; }));
    const { data: yearTerms } = await sb.from('terms').select('id,number').eq('year_id', term.year_id).lte('number', term.number).order('number');
    const classAvg = {}, trend = {};
    for (const c of classIds) {
      const by = {}; for (const r of results[c]) (by[r.subject_id] ??= []).push(Number(r.total));
      classAvg[c] = Object.fromEntries(Object.entries(by).map(([k, v]) => [k, v.reduce((a, b) => a + b, 0) / v.length]));
      const per = await Promise.all((yearTerms ?? []).map(async (yt) => [yt, yt.id === term.id ? results[c] : ((await sb.rpc('term_results', { p_term: yt.id, p_class: c })).data ?? [])]));
      for (const [yt, rows] of per) { const seen = new Set(); for (const r of rows) if (!seen.has(r.student_id)) { seen.add(r.student_id); (trend[r.student_id] ??= []).push({ n: yt.number, avg: Number(r.term_average) }); } }
    }
    const [{ data: days }, { data: att }, { data: traits }, { data: rt }] = await Promise.all([
      sb.from('school_days').select('section,days_open').eq('term_id', term.id),
      sb.from('attendance').select('student_id,days_present').eq('term_id', term.id).in('student_id', ids),
      sb.from('rating_traits').select('*').order('name'),
      sb.from('ratings').select('student_id,trait_id,score').eq('term_id', term.id).in('student_id', ids),
    ]);
    const { data: exRows } = await sb.from('term_exclusions').select('student_id,reason').eq('term_id', term.id).in('student_id', ids); const exMap = new Map((exRows ?? []).map((e) => [e.student_id, e.reason]));
    const printed = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    const stamps = {}; for (const sec of ['basic', 'secondary']) { const k = stampKeys(sec); stamps[sec] = { img: await loadImage(base.doc, S[k.stamp], origin), sig: await loadImage(base.doc, S[k.signature] || S[k.legacy], origin), layout: parseLayout(S[k.layout]), date: printed }; }
    const heads = {}; for (const sec of secs) { const { data: h } = await sb.rpc('section_head', { p_section: sec }); if (h?.[0]) heads[sec] = { name: h[0].full_name, title: h[0].title }; }
    const photos = new Map(await Promise.all(allowed.map(async (s) => [s.id, await loadImage(base.doc, s.photo_url, origin)])));
    for (const s of allowed) {
      const cls = clsOf(s.class_id); const rows = (results[s.class_id] ?? []).filter((r) => r.student_id === s.id);
      const dom = (d) => traits.filter((t) => t.domain === d).map((t) => ({ name: t.name, score: rt?.find((r) => r.student_id === s.id && r.trait_id === t.id)?.score }));
      reportPage(ctx, { template: harvard ? 'harvard' : undefined, bw, term, student: s, cls, rows, first: rows[0], inactiveNote: term.is_active === false ? 'This term is inactive for all students.' : exMap.has(s.id) ? 'This term is inactive for this student.' : null, classAvg: classAvg[s.class_id], trend: trend[s.id] ?? [], photo: photos.get(s.id),
        dOpen: days?.find((d) => d.section === cls.section)?.days_open ?? null, att: att?.find((a) => a.student_id === s.id)?.days_present ?? null,
        affective: dom('affective'), psychomotor: dom('psychomotor'), stamp: stamps[cls.section], head: heads[cls.section] });
    }
    return send(await base.doc.save(), allowed.length === 1 ? `report-${allowed[0].last_name}-${allowed[0].first_name}` : `reports-${allowed.length}-students`);
  }
  if (q.kind === 'schedule') {
    for (const s of allowed) {
      const cls = clsOf(s.class_id);
      const { data: lines } = await sb.from('student_fee_lines').select('title,amount_ngn,level,status,term_id').eq('student_id', s.id);
      let items = (lines ?? []).filter((l) => l.term_id === term.id || l.level == null).map((l) => ({ ...l, level: l.level ?? 0 }));
      if (!items.length) { const { data } = await sb.from('fee_items').select('*').eq('term_id', term.id).eq('section', cls.section).order('level').order('title'); items = (data ?? []).filter((i) => (i.level < 3 || i.class_id === s.class_id) && !i.is_extramural); }
      schedulePage(ctx, { term, student: s, cls, items, total: items.reduce((a, i) => a + Number(i.amount_ngn), 0) });
    }
    return send(await base.doc.save(), allowed.length === 1 ? `schedule-${allowed[0].last_name}-${allowed[0].first_name}` : `schedules-${allowed.length}-students`);
  }
  return fail('Unknown request', 400);
}
