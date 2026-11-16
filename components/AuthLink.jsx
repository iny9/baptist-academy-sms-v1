'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabaseBrowser } from '@/lib/supabase-browser';

// Checked in the browser so the public page itself can be cached and served instantly.
export default function AuthLink() {
  const [on, setOn] = useState(false);
  useEffect(() => { supabaseBrowser().auth.getSession().then(({ data }) => setOn(!!data.session)).catch(() => {}); }, []);
  return <Link className="btn small" href={on ? '/admin' : '/login'}>{on ? 'Open portal' : 'Sign in'}</Link>;
}
