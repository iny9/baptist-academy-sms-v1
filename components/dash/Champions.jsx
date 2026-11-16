'use client';
import { memo } from 'react';
import Photo from './Photo';
import { one, TERM_LABEL } from '@/lib/dash-logic';

// Best student by average in each subject for the chosen term / section / sub-section / class.
function Champions({ list, subjects, subject, onSubject, term }) {
  return (
    <section className="gd-glass gd-card" aria-labelledby="gd-ch-h">
      <header className="gd-card-head">
        <div><h3 id="gd-ch-h">Top student by subject</h3><p className="gd-hint">Highest average in each subject. {TERM_LABEL[term]}.</p></div>
        <div className="gd-field"><label htmlFor="gd-ch-sub">Subject</label>
          <select id="gd-ch-sub" value={subject} onChange={(e) => onSubject(e.target.value)}>
            <option value="">All subjects</option>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
      </header>
      {list.length === 0 ? <div className="gd-empty small">No subject scores for this selection.</div> :
        <ul className="gd-champs">
          {list.map((c) => (
            <li key={c.subject_id} className="gd-champ">
              <Photo url={c.photo_url} name={c.student_name} className="sm" />
              <div className="gd-champ-txt">
                <div className="gd-champ-sub">{c.subject_name}</div>
                <div className="gd-champ-name">{c.student_name}</div>
                <div className="gd-champ-meta">{c.class_name}{c.sharing > 1 ? `, level with ${c.sharing - 1} other${c.sharing > 2 ? 's' : ''}` : ''}</div>
              </div>
              <div className="gd-champ-avg"><b>{one(c.average)}</b><span>average</span></div>
            </li>))}
        </ul>}
    </section>
  );
}
export default memo(Champions);
