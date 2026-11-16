import { NextResponse } from 'next/server';
import { supabaseServer, supabaseAdmin, getSessionRoles } from '@/lib/supabase-server';
import { allow } from '@/lib/mail';
import { publicDbMessage } from '@/lib/errors';

export const runtime = 'nodejs';
const isImage = (b) => (b[0] === 0xff && b[1] === 0xd8) || (b[0] === 0x89 && b[1] === 0x50) || (b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57);

export async function POST(request) {
  try { return await handle(request); }
  catch (e) { console.error('student-photo', e?.message); return NextResponse.json({ error: 'The photo could not be saved. Please try again.' }, { status: 500 }); }
}

async function handle(request) {
  const { user, roles } = await getSessionRoles();
  if (!user || !roles.some((r) => ['admin', 'exam_officer', 'class_teacher'].includes(r.role))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!allow('photo:' + user.id, 60)) return NextResponse.json({ error: 'Too many uploads. Try again shortly.' }, { status: 429 });
  const form = await request.formData().catch(() => null);
  const file = form?.get('file'); const studentId = String(form?.get('student_id') ?? '');
  if (!file || typeof file === 'string' || !/^[0-9a-f-]{36}$/i.test(studentId)) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  if (file.size > 3 * 1024 * 1024) return NextResponse.json({ error: 'Photo must be under 3 MB.' }, { status: 413 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!isImage(bytes)) return NextResponse.json({ error: 'Use a JPG, PNG or WebP image.' }, { status: 415 });

  const sb = supabaseServer();
  // administrator and the section's exam officer, or a class teacher / form master of this student's class
  const [{ data: mg }, { data: ld }] = await Promise.all([sb.rpc('manages_student', { p_student: studentId }), sb.rpc('leads_student', { p_student: studentId })]);
  if (!mg && !ld) return NextResponse.json({ error: 'You cannot change this student.' }, { status: 403 });

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ error: 'Photo storage is not configured on the server. Contact the administrator.' }, { status: 500 });
  // The photo is stored exactly as uploaded (already shrunk in the browser). Only the link is saved in the students table; the image lives in storage.
  const png = bytes[0] === 0x89, ext = png ? 'png' : 'jpg', contentType = png ? 'image/png' : 'image/jpeg';
  const path = `${studentId}/${crypto.randomUUID()}.${ext}`;
  const admin = supabaseAdmin();
  const up = await admin.storage.from('student-photos').upload(path, bytes, { contentType });
  if (up.error) return NextResponse.json({ error: /bucket/i.test(up.error.message) ? 'The storage bucket "student-photos" does not exist. Ask the administrator to apply supabase/migrations/001_student_photos_storage.sql.' : 'Could not store the photo.' }, { status: 500 });
  const photo_url = admin.storage.from('student-photos').getPublicUrl(path).data.publicUrl;
  const { error } = await sb.from('students').update({ photo_url }).eq('id', studentId);   // user's own session, so the audit log names the actor
  if (error) return NextResponse.json({ error: publicDbMessage(error) }, { status: 400 });
  return NextResponse.json({ photo_url });
}
