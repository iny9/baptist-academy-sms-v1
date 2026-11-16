'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { csvSafe } from '@/lib/validate';
import DocHeader from '@/components/DocHeader';

const naira = (n) => '₦' + Number(n).toLocaleString('en-NG', { minimumFractionDigits: 2 });
const ST = { pending: 'Unpaid', claimed: 'Awaiting bursar', confirmed: 'Paid' , ignored: 'Cleared (ignored)', carried: 'Brought forward' };

// One child's money across all terms and sessions. Filter to a session or term, print (A4) or download as CSV.
export default function RecordView({ student, lines, S, currentTerm = '' }) {
  // opens on the running session and term when this child has fees in it, otherwise on everything
  const hit = lines.find((l) => l.term_id === currentTerm);
  const [year, setYear] = useState(hit?.year_name ?? ''); const [term, setTerm] = useState(hit ? currentTerm : '');
  const years = [...new Set(lines.map((l) => l.year_name))];
  const terms = [...new Map(lines.filter((l) => !year || l.year_name === year).map((l) => [l.term_id, l])).values()];
  const shown = lines.filter((l) => (!year || l.year_name === year) && (!term || l.term_id === term));
  const groups = useMemo(() => { const m = new Map(); for (const l of shown) (m.get(l.term_id) ?? m.set(l.term_id, { l, list: [] }).get(l.term_id)).list.push(l); return [...m.values()]; }, [shown]);   // eslint-disable-line
  const sum = (a) => a.reduce((x, l) => x + Number(l.amount_ngn), 0);
  const paid = sum(shown.filter((l) => l.status === 'confirmed' || l.status === 'ignored')), owing = sum(shown.filter((l) => !['confirmed', 'ignored', 'carried'].includes(l.status)));

  function csv() {
    const rows = [['Session', 'Term', 'Item', 'Amount (NGN)', 'Status', 'Teller reference', 'Confirmed on'], ...shown.map((l) => [l.year_name, l.term_number, l.title, l.amount_ngn, ST[l.status], l.claim_reference ?? '', l.confirmed_at ? new Date(l.confirmed_at).toLocaleDateString('en-GB') : ''])];
    const text = rows.map((r) => r.map((c) => `"${csvSafe(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' })); a.download = `finance-${student.last_name}-${student.first_name}.csv`; a.click(); URL.revokeObjectURL(a.href);
  }
  return (<div style={{ marginTop: 20 }}>
    <div className="row noprint">
      <div><label htmlFor="y">Session</label><select id="y" value={year} onChange={(e) => { setYear(e.target.value); setTerm(''); }}><option value="">All sessions</option>{years.map((y) => <option key={y}>{y}</option>)}</select></div>
      <div><label htmlFor="t">Term</label><select id="t" value={term} onChange={(e) => setTerm(e.target.value)}><option value="">All terms</option>{terms.map((l) => <option key={l.term_id} value={l.term_id}>{l.year_name}, Term {l.term_number}</option>)}</select></div>
      <a className="btn" href={`/api/pdf?kind=record&student=${student.id}${year ? `&year=${encodeURIComponent(year)}` : ''}${term ? `&term=${term}` : ''}`}>Download PDF (A4)</a> <button className="btn ghost" onClick={csv}>Download CSV</button> <button className="btn ghost" onClick={() => window.print()}>Print</button></div>
    <article className="rc" style={{ marginTop: 14 }}>
      <DocHeader S={S} pill="Financial record" sub={year || 'All sessions'} />
      <div className="doc">
        <h2 className="name" style={{ marginBottom: 2 }}>{student.last_name} {student.first_name}</h2>
        <div className="meta">{student.classes?.name} | {student.classes?.section === 'secondary' ? 'Secondary' : 'Basic'} section{student.admission_no ? ` | Adm. ${student.admission_no}` : ''}</div>
        {groups.length === 0 && <p>No fee lines were found for this selection.</p>}
        {groups.map(({ l, list }) => (<div key={l.term_id} style={{ breakInside: 'avoid', marginTop: 12 }}>
          <div className="grp"><span><small>{l.year_name}</small>Term {l.term_number}{l.term_is_cleared ? ' (cleared)' : ''}</span><span>{naira(sum(list))}</span></div>
          {list.map((x) => (<div className="line" key={x.line_id}><span>{x.title}{x.claim_reference ? ` (ref ${x.claim_reference})` : ''}</span><span>{naira(x.amount_ngn)} &nbsp; <b>{ST[x.status]}</b>{x.status === 'confirmed' && <> <Link className="noprint" href={`/admin/receipts/item/${x.line_id}`}>receipt</Link></>}</span></div>))}
          {l.term_is_cleared && <div className="noprint" style={{ textAlign: 'right' }}><Link href={`/admin/receipts/term/${student.id}?term=${l.term_id}`}>Term receipt</Link></div>}
        </div>))}
        <div className="grand"><span>PAID {naira(paid)}</span><b>OUTSTANDING {naira(owing)}</b></div>
        <div className="foot"><span>{S.school_name}</span><span>Generated {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</span></div>
      </div></article></div>);
}
