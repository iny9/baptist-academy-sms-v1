import Link from 'next/link';
import { notFound } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase-server';
import { isUuid, uuidOr } from '@/lib/validate';
import PrintButton from '@/components/PrintButton';
import BackButton from '@/components/BackButton';
import Receipt from '@/components/Receipt';

export default async function ReceiptPage({ params, searchParams }) {
  if (!['payment', 'item', 'term'].includes(params.kind) || !isUuid(params.id)) notFound();
  const sb = supabaseServer();
  const term = uuidOr(searchParams.term);
  const { data, error } = await sb.rpc('receipt_data', { p_kind: params.kind, p_id: params.id, p_term: term });
  if (error || !data) return (<div className="panel" style={{ maxWidth: 560, margin: '40px auto' }}><h2 style={{ marginTop: 0 }}>No receipt yet</h2>
    <p>{error?.message ?? 'This receipt is not available.'}</p><p><BackButton fallback="/admin/payments" label="Back" /> <Link className="btn ghost" href="/admin/payments">Open payments</Link></p></div>);
  const { data: set } = await sb.from('site_settings').select('key,value');
  const S = Object.fromEntries((set ?? []).map((x) => [x.key, x.value]));
  return (<>
    <p className="noprint"><a className="btn" href={`/api/pdf?kind=receipt&rkind=${params.kind}&id=${params.id}${term ? `&term=${term}` : ''}`}>Download PDF (A4)</a> <PrintButton label="Print" /> <BackButton fallback="/admin/payments" label="Back" /></p>
    <Receipt data={data} S={S} />
  </>);
}
