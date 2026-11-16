'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import RecordFrame from './RecordFrame';

const SEC = { basic: 'Basic', secondary: 'Secondary' };

// A parent chooses the session and term, then the section and class, and sees only their own children who match.
export default function ParentResults({ terms, children, currentTerm = '' }) {
  const [term, setTerm] = useState(terms.some((t) => t.id === currentTerm) ? currentTerm : ''); const [section, setSection] = useState(''); const [cls, setCls] = useState('');
  const sections = [...new Set(children.map((c) => c.classes?.section).filter(Boolean))];
  const classes = [...new Map(children.filter((c) => !section || c.classes?.section === section).map((c) => [c.classes?.id, c.classes?.name])).entries()];
  const shown = useMemo(() => children.filter((c) => (!section || c.classes?.section === section) && (!cls || c.classes?.id === cls)), [children, section, cls]);
  if (children.length === 0) return <div className="empty">No children are linked to your account yet. Please ask the school office to match you to your child.</div>;
  return (<>
    <div className="row">
      <div><label htmlFor="pt">Session and term</label><select id="pt" value={term} onChange={(e) => setTerm(e.target.value)}><option value="">Choose</option>{terms.map((t) => <option key={t.id} value={t.id}>{t.academic_years.name}, Term {t.number}</option>)}</select></div>
      <div><label htmlFor="ps">Section</label><select id="ps" value={section} onChange={(e) => { setSection(e.target.value); setCls(''); }}><option value="">All my children's sections</option>{sections.map((s) => <option key={s} value={s}>{SEC[s]}</option>)}</select></div>
      <div><label htmlFor="pc">Class</label><select id="pc" value={cls} onChange={(e) => setCls(e.target.value)}><option value="">All classes</option>{classes.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select></div></div>
    {!term ? <p className="auth-hint" style={{ marginTop: 16 }}>Choose a session and term to see your children's report cards.</p> :
      shown.length === 0 ? <div className="empty" style={{ marginTop: 16 }}>No child of yours is in that section or class.</div> :
        <RecordFrame style={{ marginTop: 16 }} noun="children">{shown.map((c) => (<tr key={c.id}><td><strong>{c.last_name} {c.first_name}</strong><div className="auth-hint">{c.admission_no}</div></td>
          <td><span className="badge">{c.classes?.name}</span> <span className="badge gold">{SEC[c.classes?.section]}</span></td>
          <td style={{ textAlign: 'right' }}><Link className="btn small" href={`/admin/results/${term}/${c.id}?from=${encodeURIComponent('/admin/results')}`}>View report card</Link></td></tr>))}</RecordFrame>}
  </>);
}
