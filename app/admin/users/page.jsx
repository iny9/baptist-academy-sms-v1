import { redirect } from 'next/navigation';
import Notice from '@/components/Notice';
import { getSessionRoles, supabaseServer } from '@/lib/supabase-server';
import InviteForm from '@/components/InviteForm';
import PeopleCreator from '@/components/PeopleCreator';
import UserList from '@/components/UserList';
import UserManager from '@/components/UserManager';

export default async function Users() {
  const { user, roles } = await getSessionRoles();
  if (!roles.some((r) => r.role === 'admin')) redirect('/admin?denied=1');
  const { data, error } = await supabaseServer().from('profiles').select('id,email,username,contact_email,must_change_password,full_name,phone,user_roles(id,role,section)').order('full_name');
  return (<>
    <h1>Users and roles</h1>
    <PeopleCreator />
    <div style={{ height: 16 }} />
    <InviteForm />
    <div style={{ height: 16 }} />
    <UserList users={data ?? []} />
    <h2 style={{ marginTop: 40 }}>Registered users</h2>
    {error && <Notice error={error} />}
    <UserManager users={data ?? []} me={user.id} />
  </>);
}
