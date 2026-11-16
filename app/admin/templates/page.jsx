import { redirect } from 'next/navigation';
import { getSessionRoles } from '@/lib/supabase-server';
import TemplateList from '@/components/TemplateList';

export default async function Templates() {
  const { roles } = await getSessionRoles();
  if (!roles.some((r) => r.role === 'admin')) redirect('/admin?denied=1');
  return <><h1>File templates</h1><p className="auth-hint">See how every file the system creates looks, using made-up sample data, and download the CSV layouts for bulk uploads.</p><TemplateList /></>;
}
