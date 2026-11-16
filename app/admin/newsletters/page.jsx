import Link from 'next/link';
import { getSessionRoles, supabaseServer } from '@/lib/supabase-server';
import NewsletterForm from '@/components/NewsletterForm';
import RecordFrame from '@/components/RecordFrame';

export default async function Newsletters() {
  const { roles } = await getSessionRoles();
  const isAdmin = roles.some((r) => r.role === 'admin');
  const secs = roles.filter((r) => r.role === 'exam_officer').map((r) => r.section);
  const { data } = await supabaseServer().from('newsletters').select('id,title,section,created_at').order('created_at', { ascending: false });
  return (<><h1>Newsletters</h1>
    {(isAdmin || secs.length > 0) && <NewsletterForm sections={isAdmin ? ['all', 'basic', 'secondary'] : secs} />}
    <RecordFrame style={{ marginTop: 24 }} noun="newsletters">{(data ?? []).map((n) => (<tr key={n.id}><td>{n.title}</td><td>{n.section ?? 'whole school'}</td>
      <td>{new Date(n.created_at).toLocaleDateString('en-GB')}</td><td><Link className="btn small" href={`/admin/newsletters/${n.id}?from=${encodeURIComponent('/admin/newsletters')}`}>Open</Link></td></tr>))}</RecordFrame></>);
}
