import { gradeOf, GRADE_KEY, meritPoints } from '@/lib/grading';

const LEVELS = ['', 'Poor', 'Average', 'Good', 'Very good', 'Excellent'];
const WORD = { A: 'Excellent', B: 'Very good', C: 'Good', D: 'Fair', E: 'Weak pass', F: 'Needs help' };
const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
const ord = (n) => { const v = n % 100, s = ['th', 'st', 'nd', 'rd']; return n + (s[(v - 20) % 10] || s[v] || s[0]); };

// Formal, Harvard-style transcript: serif type, hairline rules, no colour at all, so it prints the same on any printer.
// Administrator only (the page decides); the PDF twin is harvardReportPage() in lib/pdf.js.
export default function HarvardCard({ S, term, st, cls, rows, first, classAvg, dOpen, present, affective, psychomotor, head, inactiveNote, stampNode }) {
  const basic = cls.section === 'basic', third = term.number === 3, cum = term.number >= 2;
  const avg = first ? Number(cum ? first.cumulative_average : first.term_average) : null;
  const merit = rows.reduce((a, r) => a + meritPoints(r.total), 0);
  const pct = dOpen && present != null ? Math.round((present / dOpen) * 100) : null;
  return (
    <article className="hv" aria-label="Harvard-style report card">
      <header className="hv-head">
        <img src="/logo-96.webp" alt="" width="52" height="52" />
        <h1>{(S.school_name ?? 'Baptist Academy').toUpperCase()}</h1>
        <p className="hv-addr">{S.address}</p>
        <div className="hv-rule" />
        <h2>{basic ? 'OFFICIAL PROGRESS REPORT' : 'OFFICIAL ACADEMIC REPORT'}</h2>
        <p className="hv-sub">Term {term.number}, {term.academic_years.name} session</p>
      </header>
      <section className="hv-particulars">
        <dl>
          <div><dt>Name</dt><dd>{st.last_name}, {st.first_name} {st.other_names ?? ''}</dd></div>
          <div><dt>Class</dt><dd>{cls.name}</dd></div>
          <div><dt>Admission no.</dt><dd>{st.admission_no ?? '-'}</dd></div>
        </dl>
        <dl>
          <div><dt>Sex / age</dt><dd>{st.gender}, {st.age_years} years</dd></div>
          <div><dt>Term dates</dt><dd>{fmt(term.starts_on)} to {fmt(term.ends_on)}</dd></div>
          <div><dt>Next term</dt><dd>{fmt(term.next_term_begins) || 'To be announced'}</dd></div>
        </dl>
        {st.photo_url && <img className="hv-photo" src={st.photo_url} alt="" />}
      </section>
      {inactiveNote && <p className="hv-note">{inactiveNote} No scores are counted for this term.</p>}
      <section className="hv-strip">
        <div><span>{cum ? 'Cumulative average' : 'Term average'}</span><b>{avg != null ? `${avg.toFixed(1)} (${gradeOf(avg)})` : '-'}</b></div>
        <div><span>Position</span><b>{first ? `${ord(first.class_position)} of ${first.class_size}` : '-'}</b></div>
        <div><span>Merit score</span><b>{merit}</b></div>
        <div><span>{third && first?.status ? 'End of session' : 'Subjects'}</span><b>{third && first?.status ? first.status.toUpperCase() : rows.length}</b></div>
      </section>
      <table className="hv-table">
        <thead><tr><th>Subject</th><th>CA 1</th><th>CA 2</th><th>Exam</th><th>Total</th><th>Class avg</th><th>Grade</th><th>Pts</th><th>{basic ? 'Comment' : 'Remark'}</th></tr></thead>
        <tbody>
          {rows.map((r) => (<tr key={r.subject_id}><td>{r.subject_name}</td><td>{r.ca1}</td><td>{r.ca2}</td><td>{r.exam}</td><td><b>{r.total}</b></td>
            <td>{classAvg?.[r.subject_id] != null ? Number(classAvg[r.subject_id]).toFixed(0) : ''}</td><td><b>{r.grade}</b></td><td>{meritPoints(r.total)}</td><td className="hv-w">{WORD[r.grade]}</td></tr>))}
          {rows.length === 0 && <tr><td colSpan="9"><i>{inactiveNote ?? 'No scores recorded for this term.'}</i></td></tr>}
        </tbody>
      </table>
      <p className="hv-att"><b>ATTENDANCE</b> {present != null ? `School opened ${dOpen} times. Present ${present}. Absent ${dOpen - present}. Attendance ${pct}%.` : 'Attendance not recorded.'}</p>
      <section className="hv-cols">
        {[[basic ? 'Character and behaviour' : 'Affective domain', affective], [basic ? 'Skills and activities' : 'Psychomotor domain', psychomotor]].map(([title, list]) => (
          <div key={title}><h3>{title.toUpperCase()}</h3>{list.map((t) => <div className="hv-line" key={t.name}><span>{t.name}</span><span>{t.score ? `${t.score} - ${LEVELS[t.score]}` : '-'}</span></div>)}</div>))}
      </section>
      <p className="hv-key">Ratings: 5 Excellent, 4 Very good, 3 Good, 2 Average, 1 Poor. {GRADE_KEY} Pts: A=5 B=4 C=3 D=2 E=1 F=0.</p>
      <section className="hv-remark"><h3>{(head?.title ?? (basic ? 'Headmaster / Headmistress' : 'Principal')).toUpperCase()}’S REMARK</h3><p><i>{first?.remark ?? ''}</i></p>
        {head?.full_name && <div className="hv-by">{head.full_name}, {head.title}</div>}</section>
      <div className="hv-stamp">{stampNode}</div>
      <footer className="hv-foot"><span>{S.school_name} | {S.motto}</span><span>Printed {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</span></footer>
    </article>
  );
}
