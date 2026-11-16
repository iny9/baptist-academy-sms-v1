import { getSessionRoles, supabaseServer } from '@/lib/supabase-server';
import ProfileForm from '@/components/ProfileForm';
export default async function Profile({ searchParams }) {
  const { user } = await getSessionRoles();
  const { data } = await supabaseServer().from('profiles').select('id,email,username,contact_email,gender,must_change_password,full_name,phone,avatar_url').eq('id', user.id).single();
  return <><h1>My profile</h1><ProfileForm profile={data} force={!!data?.must_change_password} /></>;
}
