import { notFound } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase-server';
import PrintButton from '@/components/PrintButton';
import BackButton from '@/components/BackButton';
import SendButton from '@/components/SendButton';
import DocHeader from '@/components/DocHeader';

export default async function Newsletter({ params }) {
  const sb = supabaseServer();
  const { data: n } = await sb.from('newsletters').select('*').eq('id', params.id).maybeSingle();
  if (!n) notFound();
  const { data: set } = await sb.from('site_settings').select('key,value');
  const S = Object.fromEntries((set ?? []).map((x) => [x.key, x.value]));
  const F = n.fields ?? {};
  return (<>
    <div className="noprint"><BackButton fallback="/admin/newsletters" label="Back to newsletters" /> <a className="btn" href={`/api/pdf?kind=newsletter&id=${n.id}`}>Download PDF</a> <PrintButton /> <SendButton label="Email to parents" confirmText="Email this newsletter to all parents in its audience?" payload={{ kind: 'newsletter', id: n.id }} /></div>
    <article className="rc" style={{ marginTop: 16 }}>
      <DocHeader S={S} pill="Newsletter" sub={F.issue} />
      <div className="doc">
        <h2 style={{ fontSize: '1.7rem', margin: '6px 0 4px', color: '#0B3640' }}>{n.title}</h2>
        <div style={{ width: 54, height: 3, background: '#F2B705', marginBottom: 14 }} />
        <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.75, fontSize: '1rem' }}>{n.body}</div>
        {F.important_dates && <div className="callout gold"><small>Important dates</small><div style={{ whiteSpace: 'pre-wrap' }}>{F.important_dates}</div></div>}
        {F.contact && <div className="callout"><small>Contact</small><div style={{ whiteSpace: 'pre-wrap' }}>{F.contact}</div></div>}
        {F.signed_by && <div className="sig" style={{ marginTop: 26 }}><div>{F.signed_by}</div></div>}
        <div className="foot"><span>{S.school_name} | {S.motto}</span><span>{new Date(n.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</span></div>
      </div>
    </article></>);
}
