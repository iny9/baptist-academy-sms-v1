'use client';
import Icon from './Icon';

const PDFS = [
  ['report-primary', 'Report card: Primary / Nursery (Basic)', 'Sunny, rounded design with coloured badges, stars for character and skills, a comment word per subject, and the headmaster/headmistress stamp at the bottom right. Samples for Term 1 and Term 3.', 'award'],
  ['report-primary-harvard', 'Report card: Primary / Nursery (Basic), Harvard style', 'Formal black-and-white transcript: serif type, hairline rules, merit points per subject, ratings written as words. Administrator only for printing and download.', 'file'],
  ['report-secondary', 'Report card: Secondary', 'The formal navy design with score bars against the class average, dot ratings, and the principal’s stamp at the bottom right. Samples for Term 1 and Term 3 (Promoted).', 'award'],
  ['report-secondary-harvard', 'Report card: Secondary, Harvard style', 'The same formal transcript layout for the Secondary section: CA 1, CA 2, exam, total, class average, grade, points and a remark per subject. Administrator only for printing and download.', 'file'],
  ['schedule', 'Payment schedule', 'A student’s fees by level with paid, awaiting and unpaid markers, brought-forward balance and outstanding total.', 'wallet'],
  ['debtors', 'Outstanding fees list', 'Students with unpaid fees, grouped by student, with the total owing. Scope follows the person’s role.', 'clipboard'],
  ['ca-form', 'CA form: Secondary (one subject per class)', 'Numbered class list, in surname order, with blank columns for 1st CA, 2nd CA, exam and total.', 'edit'],
  ['ca-basic', 'CA sheet: Basic (one page per child)', 'One page for each child listing every subject of the term, with blank 1st test, 2nd test, exam and total boxes.', 'edit'],
  ['newsletter', 'Newsletter', 'Title, pasted content, important dates, contact box and signature line.', 'mail'],
];
const CSVS = [
  ['students-template.csv', 'Students import (CSV)', 'admission_no,first_name,last_name,other_names,gender,dob,class,student_type,debt_forward\nBA/2026/001,Ada,Okoro,,Female,2013-05-14,JSS1,new,0\nBA/2025/044,Musa,Bello,,Male,2012-02-01,JSS2,continuing,15000\n', 'Bulk-add students. student_type is new or continuing. debt_forward is any balance owed from before, in naira.'],
  ['scores-template.csv', 'Scores upload (CSV)', 'admission_no,ca1,ca2,exam\nBA/2026/001,12,13,52\nBA/2025/044,14,12,58\n', 'Subject teachers (Secondary) and class teachers (Basic) upload one subject for one class and term. 1st CA and 2nd CA 0 to 15, exam 0 to 70.'],
];
const download = (name, text) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' })); a.download = name; a.click(); };

export default function TemplateList() {
  return (<>
    <h2>PDF documents</h2>
    <div className="actions">{PDFS.map(([k, t, d, i]) => (
      <div className="action" key={k} style={{ flexDirection: 'column' }}>
        <div style={{ display: 'flex', gap: 14 }}><div className="ico"><Icon name={i} size={22} /></div><div><strong>{t}</strong><span>{d}</span></div></div>
        <div><a className="btn small" href={`/api/pdf?kind=template&name=${k}`} target="_blank" rel="noreferrer"><Icon name="file" size={15} />View sample</a>{' '}
          <a className="btn ghost small" href={`/api/pdf?kind=template&name=${k}`} download><Icon name="download" size={15} />Download</a></div></div>))}</div>
    <h2 style={{ marginTop: 28 }}>CSV layouts</h2>
    <div className="actions">{CSVS.map(([f, t, text, d]) => (
      <div className="action" key={f} style={{ flexDirection: 'column' }}>
        <div style={{ display: 'flex', gap: 14 }}><div className="ico"><Icon name="layers" size={22} /></div><div><strong>{t}</strong><span>{d}</span></div></div>
        <div><button className="btn small" onClick={() => download(f, text)}><Icon name="download" size={15} />Download template</button></div></div>))}</div>
  </>);
}
