import { redirect } from 'next/navigation';
import Notice from '@/components/Notice';
import { getSessionRoles, supabaseServer } from '@/lib/supabase-server';
import ArchivePanel from '@/components/ArchivePanel';

export default async function Archive() {
  const { roles } = await getSessionRoles();
  if (!roles.some((r) => r.role === 'admin')) redirect('/admin?denied=1');
  const { data, error } = await supabaseServer().rpc('retention_preview', { p_years: 5, p_audit_years: 3 });
  return <><h1>Archive old data</h1>
    <p className="auth-hint">Keeps the live database small and fast. Old attendance, affective/psychomotor ratings and audit entries are moved to archive tables. Scores, report cards and fee records are never archived automatically.</p>
    {error && <Notice error={error} />}
    <ArchivePanel preview={data} /></>;
}
