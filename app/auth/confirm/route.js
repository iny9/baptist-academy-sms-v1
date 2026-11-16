import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';

// Receives invitation and password-reset links built from the email templates (see README, "Email templates").
const TYPES = ['invite', 'recovery', 'signup', 'email', 'magiclink'];

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get('token_hash'); const type = searchParams.get('type');
  let next = searchParams.get('next') ?? '/reset-password';
  if (!/^\/[A-Za-z0-9_\-/]*$/.test(next) || next.includes('//')) next = '/reset-password';   // block open redirects
  if (token_hash && TYPES.includes(type)) {
    const { error } = await supabaseServer().auth.verifyOtp({ type, token_hash });
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }
  return NextResponse.redirect(`${origin}/login?error=link`);
}
