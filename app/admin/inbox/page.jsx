import { redirect } from 'next/navigation';
import { getSessionRoles } from '@/lib/supabase-server';
import ParentInbox from '@/components/ParentInbox';

// Parents: messages and reminders from the bursar, newsletters, drafts, and the payments they sent (sent, confirmed, rejected).
export default async function InboxPage() {
  const { roles } = await getSessionRoles();
  if (!roles.some((r) => ['parent'].includes(r.role))) redirect('/admin?denied=1');
  return (<><h1>Inbox</h1><ParentInbox /></>);
}
