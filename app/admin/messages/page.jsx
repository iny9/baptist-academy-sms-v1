import { redirect } from 'next/navigation';
import { getSessionRoles, supabaseServer } from '@/lib/supabase-server';
import MessageComposer from '@/components/MessageComposer';

export default async function Messages() {
  const { roles } = await getSessionRoles();
  if (!roles.some((r) => r.role === 'admin')) redirect('/admin?denied=1');
  const { data } = await supabaseServer().rpc('guardian_directory');
  return <><h1>Message parents and guardians</h1><MessageComposer rows={data ?? []} /></>;
}
