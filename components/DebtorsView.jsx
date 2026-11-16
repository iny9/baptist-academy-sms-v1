'use client';
import { useMemo, useState } from 'react';
import Icon from './Icon';
import RecordFrame from './RecordFrame';

const naira = (n) => '₦' + Number(n).toLocaleString('en-NG', { minimumFractionDigits: 2 });

export default function DebtorsView({ years, terms, year, term, rows }) {
  const [section, setSection] = useState(''); const [cls, setCls] = useState('');
  const classes = [...new Map(rows.map((r) => [r.class_id, r.class_name])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const shown = useMemo(() => rows.filter((r) => (!section || r.section === section) && (!cls || r.class_id === cls)), [rows, section, cls]);
  const groups = useMemo(() => { const m = new Map(); for (const r of shown) (m.get(r.student_id) ?? m.set(r.student_id, { r, list: [] }).get(r.student_id)).list.push(r); return [...m.values()].sort((a, b) => a.r.class_name.localeCompare(b.r.class_name) || a.r.student_name.localeCompare(b.r.student_name)); }, [shown]);
  const total = shown.reduce((a, r) => a + Number(r.amount_ngn), 0);
  const pdf = `/api/pdf?kind=debtors&year=${year}${term ? `&term=${term}` : ''}${section ? `&section=${section}` : ''}${cls ? `&class=${cls}` : ''}`;
  return (<>
    <form method="get" className="row">
      <div><label htmlFor="y">Session</label><select id="y" name="year" defaultValue={year} required><option value="">Choose</option>{years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}</select></div>
      <div><label htmlFor="t">Term</label><select id="t" name="term" defaultValue={term}><option value="">All terms in the session</option>{terms.map((t) => <option key={t.id} value={t.id}>Term {t.number}{years.find((y) => y.id === t.year_id) ? ` (${years.find((y) => y.id === t.year_id).name})` : ''}</option>)}</select></div>
      <button className="btn">Load</button></form>
    {year && <>
      <div className="row" style={{ marginTop: 16 }}>
        <div><label htmlFor="s">Section</label><select id="s" value={section} onChange={(e) => { setSection(e.target.value); setCls(''); }}><option value="">All sections</option><option value="basic">Basic</option><option value="secondary">Secondary</option></select></div>
        <div><label htmlFor="c">Class</label><select id="c" value={cls} onChange={(e) => setCls(e.target.value)}><option value="">All classes</option>{classes.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select></div>
        <a className="btn" href={pdf}><Icon name="download" size={16} />Download PDF</a></div>
      <div className="stats" style={{ marginTop: 16 }}>
        <div className="stat"><div className="ico"><Icon name="users" size={22} /></div><div><div className="n">{groups.length}</div><div className="l">Students owing</div></div></div>
        <div className="stat"><div className="ico"><Icon name="wallet" size={22} /></div><div><div className="n">{naira(total)}</div><div className="l">Total outstanding</div></div></div></div>
      {groups.length === 0 ? <div className="empty">No outstanding fees for this selection.</div> :
        <RecordFrame noun="students" head={<thead><tr><th>Student</th><th>Class</th><th>Items</th><th style={{ textAlign: 'right' }}>Owing</th></tr></thead>}>
          {groups.map(({ r, list }) => (<tr key={r.student_id}><td>{r.student_name}{r.student_status !== 'active' && <span className="badge gold" style={{ marginLeft: 6 }}>{r.student_status}</span>}</td><td>{r.class_name}</td>
            <td style={{ fontSize: '.85rem' }}>{list.map((l) => `${l.title}${l.status === 'claimed' ? ' (awaiting confirmation)' : ''}`).join(', ')}</td>
            <td style={{ textAlign: 'right', fontWeight: 700 }}>{naira(list.reduce((a, l) => a + Number(l.amount_ngn), 0))}</td></tr>))}</RecordFrame>}</>}
  </>);
}
