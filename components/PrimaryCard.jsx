import DocHeader from '@/components/DocHeader';
import Stamp, { fmtDateLong } from '@/components/Stamp';

const WORD = { A: 'Excellent', B: 'Very good', C: 'Good', D: 'Fair', E: 'Weak pass', F: 'Needs help' };
const LEVELS = ['', 'Poor', 'Average', 'Good', 'Very good', 'Excellent'];
const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const ord = (n) => { const v = n % 100, s = ['th', 'st', 'nd', 'rd']; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
import { gradeOf, GRADE_KEY } from '@/lib/grading';
const star = 'M12 2l3 6.5 7 .9-5.1 4.9 1.3 7L12 17.8 5.8 21.3l1.3-7L2 9.4l7-.9z';

// Primary / Nursery report card: sunny, rounded, friendly. (The secondary card keeps its own formal look.)
export default function PrimaryCard({ S, term, st, cls, rows, first, classAvg, trend, dOpen, present, affective, psychomotor, inactiveNote, head }) {
  const third = term.number === 3, cum = term.number >= 2;   // from Term 2 the position follows the cumulative average
  const avg = first ? Number(cum ? first.cumulative_average : first.term_average) : null;
  const pct = dOpen && present != null ? Math.round((present / dOpen) * 100) : null;
  return (<article className="rc pc">
    <DocHeader S={S} pill={`Term ${term.number} progress report`} sub={`${term.academic_years.name} session`} />
    <div className="doc">
      <div className="pc-hero">
        <div className="pc-photo">{st.photo_url ? <img src={st.photo_url} alt="" /> : <svg width="56" height="56" viewBox="0 0 24 24" aria-label="No photo"><circle cx="12" cy="8" r="4" fill="#F6C27B" /><path d="M4 21c0-5 4-7 8-7s8 2 8 7z" fill="#F6C27B" /></svg>}</div>
        <div>
          <h2 className="name">{st.last_name} {st.first_name} {st.other_names ?? ''}</h2>
          <div className="pc-chips"><span>{cls.name}</span><span>{st.gender}</span><span>{st.age_years} years</span>{st.admission_no && <span>Adm. {st.admission_no}</span>}</div>
          <div className="meta">Term {fmt(term.starts_on)} to {fmt(term.ends_on)} · Next term begins {fmt(term.next_term_begins) || 'to be announced'}</div>
        </div>
      </div>
      {inactiveNote && <div className="callout gold"><small>Not active this term</small>{inactiveNote} No scores are counted for this term.</div>}
      <div className="pc-badges">
        <div className="b1"><b>{avg != null ? avg.toFixed(1) : '-'}</b><span>{cum ? 'Cumulative average' : 'Term average'}</span>{avg != null && <em>Grade {gradeOf(avg)}</em>}</div>
        <div className="b2"><b>{first ? ord(first.class_position) : '-'}</b><span>Position</span>{first && <em>of {first.class_size}</em>}</div>
        <div className="b3"><b>{pct != null ? `${pct}%` : '-'}</b><span>Attendance</span>{present != null && <em>{present} of {dOpen} days</em>}</div>
        {third && first?.status ? <div className={first.status === 'Repeat' ? 'b5' : 'b4'}><b style={{ fontSize: '1.05rem' }}>{first.status}</b><span>End of session</span></div> : <div className="b4"><b>{rows.length}</b><span>Subjects</span></div>}
      </div>
      <table className="pc-table">
        <thead><tr><th>Subject</th><th>1st test<small>15</small></th><th>2nd test<small>15</small></th><th>Exam<small>70</small></th><th>Total<small>100</small></th><th>Class avg</th><th>Grade</th><th>Comment</th></tr></thead>
        <tbody>{rows.map((r) => (<tr key={r.subject_id}><td>{r.subject_name}</td><td>{r.ca1}</td><td>{r.ca2}</td><td>{r.exam}</td><td><b>{r.total}</b></td>
          <td>{classAvg?.[r.subject_id] != null ? Number(classAvg[r.subject_id]).toFixed(0) : ''}</td><td><span className={'pc-grade g-' + r.grade}>{r.grade}</span></td><td>{WORD[r.grade]}</td></tr>))}
          {rows.length === 0 && <tr><td colSpan="8">{inactiveNote ?? 'No scores recorded for this term.'}</td></tr>}</tbody>
      </table>
      <div className="two">
        {[['Character and behaviour', affective], ['Skills and activities', psychomotor]].map(([title, list]) => (
          <div className="box pc-box" key={title}><h4>{title}</h4>{list.map((t) => (
            <div className="trait" key={t.name}><span>{t.name}</span>
              <span className="stars" aria-label={t.score ? `${t.score} of 5 stars` : 'not rated'}>{[1, 2, 3, 4, 5].map((k) => <svg key={k} width="13" height="13" viewBox="0 0 24 24"><path d={star} fill={t.score >= k ? '#F59E0B' : 'none'} stroke="#F59E0B" strokeWidth="1.6" /></svg>)}</span>
              <span className="lvl">{t.score ? LEVELS[t.score] : ''}</span></div>))}</div>))}
      </div>
      <div className="two">
        <div className="box pc-box"><h4>My progress this session</h4>{trend.length ? <div className="trend">{trend.map((p) => <div key={p.n} className={p.n === term.number ? 'now' : ''}>{p.avg.toFixed(0)}<i style={{ height: Math.max(3, p.avg * 0.34) }} />T{p.n}</div>)}</div> : <small>No earlier terms recorded.</small>}</div>
        <div className="remark pc-remark"><small>{head?.title ?? 'Headmaster / Headmistress'}’s remark</small><p>{first?.remark ?? ''}</p>{head?.full_name && <div className="rm-by">{head.full_name}, {head.title}</div>}</div>
      </div>
      <div className="sigrow"><div className="key">Stars: 5 Excellent, 4 Very good, 3 Good, 2 Average, 1 Poor. {GRADE_KEY}</div>
        <Stamp S={S} section="basic" date={fmtDateLong()} /></div>
      <div className="foot"><span>{S.school_name} | {S.motto}</span><span>Generated {fmtDateLong()}</span></div>
    </div>
  </article>);
}
