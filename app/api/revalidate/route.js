import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getSessionRoles } from '@/lib/supabase-server';

// Called after the admin saves website content so the cached home page updates immediately.
export async function POST() {
  const { roles } = await getSessionRoles();
  if (!roles.some((r) => r.role === 'admin')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  revalidatePath('/');
  return NextResponse.json({ ok: true });
}
