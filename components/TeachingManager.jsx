'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Notice from '@/components/Notice';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { offeredIn } from '@/lib/subject-scope';
import RecordFrame from './RecordFrame';

const label = (p) => p.full_name || p.email;
const who = (list, id) => { const p = list.find((x) => x.id === id); return p ? label(p) : 'Unassigned'; };

export default function TeachingManager({ sections, classes, subjects, assignments, staff, classTeachers, blockers, termName }) {
  const sb = supabaseBrowser(); const router = useRouter(); const [, start] = useTransition();
  const [msg, setMsg] = useState(null); const [sec, setSec] = useState(sections[0]); const [classId, setClassId] = useState('');
  const ok = (m) => { setMsg({ ok: true, m }); start(() => router.refresh()); };
  const bad = (e) => setMsg({ ok: false, m: e.message });

  const secClasses = classes.filter((c) => c.section === sec);
  const cls = secClasses.find((c) => c.id === classId);
  const basic = sec === 'basic';
  const secSubjects = cls ? subjects.filter((s) => offeredIn(s, cls)) : [];
  const ctPool = staff[`${sec}:class_teacher`] ?? [];
  const subjectTeachers = staff[`${sec}:subject_teacher`] ?? [];
  const label2 = basic ? 'Class teachers' : 'Form master';
  const mine = cls ? classTeachers.filter((t) => t.class_id === cls.id).sort((a, b) => a.position - b.position) : [];
  const onThisClass = new Set(mine.map((t) => t.teacher_id));   // a teacher may lead several classes; only this class's own teachers are left out
  const free = ctPool.filter((p) => !onThisClass.has(p.id));
  const secBlockers = blockers.filter((b) => b.section === sec);

  async function addTeacher(e) {
    e.preventDefault(); const id = new FormData(e.target).get('teacher'); if (!id) return;
    const { error } = await sb.rpc('add_class_teacher', { p_class: cls.id, p_teacher: id }); error ? bad(error) : ok(`${basic ? 'Class teacher' : 'Form master'} added.`); e.target.reset();
  }
  async function removeTeacher(id) { const { error } = await sb.rpc('remove_class_teacher', { p_class: cls.id, p_teacher: id }); error ? bad(error) : ok('Removed.'); }
  async function move(i, dir) {
    const ids = mine.map((t) => t.teacher_id); const j = i + dir; if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    const { error } = await sb.rpc('set_class_teacher_order', { p_class: cls.id, p_teachers: ids }); error ? bad(error) : ok('Order saved. The first teacher is the one who enters attendance.');
  }
  async function assign(e) {
    e.preventDefault(); const f = new FormData(e.target);
    const { error } = await sb.from('class_subject_teachers').upsert({ class_id: cls.id, subject_id: f.get('subject'), teacher_id: f.get('teacher') }, { onConflict: 'class_id,subject_id' });
    error ? bad(error) : ok('Subject teacher assigned.');
  }
  async function unassign(id) { const { error } = await sb.from('class_subject_teachers').delete().eq('id', id); error ? bad(error) : ok('Removed.'); }

  return (<>
    {msg && <Notice msg={msg} onClose={() => setMsg(null)} />}
    <div className="panel" style={{ marginBottom: 16 }}>
      <h3>Are all subjects staffed?</h3>
      {secBlockers.length === 0
        ? <p><span className="badge green">Ready</span> Every {basic ? 'class has a class teacher' : 'subject of every class has a teacher'}{termName ? ` (checked for ${termName})` : ''}, for the {basic ? 'Basic' : 'Secondary'} section.</p>
        : <><p><span className="badge gold">Teachers missing</span> These still need a teacher{termName ? ` (checked for ${termName})` : ''}. Results for the {basic ? 'Basic' : 'Secondary'} section are still shown with the scores entered so far. Subjects that a class does not take this term can be switched off under “Subjects on or off”.</p>
          <RecordFrame noun="gaps">{secBlockers.slice(0, 80).map((b, i) => <tr key={i}><td>{b.class_name}</td><td>{b.subject_name ?? '—'}</td><td>{b.problem}</td></tr>)}</RecordFrame>
          {secBlockers.length > 80 && <p className="auth-hint">…and {secBlockers.length - 80} more.</p>}</>}
    </div>
    <div className="row">
      {sections.length > 1 && <div><label htmlFor="sec">Section</label>
        <select id="sec" value={sec} onChange={(e) => { setSec(e.target.value); setClassId(''); }}>{sections.map((s) => <option key={s} value={s}>{s === 'basic' ? 'Basic' : 'Secondary'}</option>)}</select></div>}
      <div><label htmlFor="cl">Class</label>
        <select id="cl" value={classId} onChange={(e) => setClassId(e.target.value)}><option value="">Choose a class</option>
          {secClasses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
    </div>
    {cls && (<>
      <div className="panel" style={{ marginTop: 16 }}>
        <h3>{label2} for {cls.name}</h3>
        {basic ? <p>A Basic class can have several class teachers. They teach <strong>all</strong> its subjects. Number them: <strong>number 1 is the only one who enters attendance.</strong> A teacher can be a class teacher in more than one class.</p>
          : <p>A Secondary class has one form master, who enters its attendance. A teacher can be form master of more than one class.</p>}
        {mine.length === 0 ? <p className="auth-hint">No one assigned yet.</p> :
          <RecordFrame noun="class teachers">{mine.map((t, i) => (<tr key={t.teacher_id}>
            <td style={{ width: 70 }}><span className="ordchip"><b>{t.position}</b></span></td>
            <td>{who(ctPool, t.teacher_id)}{t.position === 1 && <span className="badge gold" style={{ marginLeft: 8 }}>Enters attendance</span>}</td>
            <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
              {basic && <><button type="button" className="btn ghost small" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">↑</button>{' '}
                <button type="button" className="btn ghost small" disabled={i === mine.length - 1} onClick={() => move(i, 1)} aria-label="Move down">↓</button>{' '}</>}
              <button type="button" className="btn danger small" onClick={() => removeTeacher(t.teacher_id)}>Remove</button></td></tr>))}</RecordFrame>}
        {(basic || mine.length === 0) && <form className="row" style={{ marginTop: 12 }} onSubmit={addTeacher}>
          <div><label htmlFor="ct">Add {basic ? 'a class teacher' : 'the form master'}</label>
            <select id="ct" name="teacher" required><option value="">Choose</option>{free.map((p) => <option key={p.id} value={p.id}>{label(p)}</option>)}</select></div>
          <button className="btn">Add</button></form>}
        {free.length === 0 && (basic || mine.length === 0) && <p className="auth-hint">No free teacher with the class teacher role in this section. Give the role under Users and roles.</p>}
      </div>
      {!basic && <form className="panel" style={{ marginTop: 16 }} onSubmit={assign}>
        <h3>Subject teachers for {cls.name}</h3>
        <div className="row">
          <div><label htmlFor="sj">Subject</label><select id="sj" name="subject" required>{secSubjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
          <div><label htmlFor="tc">Teacher</label><select id="tc" name="teacher" required>{subjectTeachers.map((p) => <option key={p.id} value={p.id}>{label(p)}</option>)}</select></div>
          <button className="btn">Assign</button>
        </div>
        <RecordFrame style={{ marginTop: 16 }} noun="subjects">{secSubjects.map((s) => { const a = assignments.find((x) => x.class_id === cls.id && x.subject_id === s.id); return (
          <tr key={s.id}><td>{s.name}</td><td>{a ? who(subjectTeachers, a.teacher_id) : <span className="badge red">No teacher</span>}</td>
            <td style={{ textAlign: 'right' }}>{a && <button type="button" className="btn danger small" onClick={() => unassign(a.id)}>Remove</button>}</td></tr>); })}</RecordFrame>
      </form>}
      {basic && <p className="auth-hint" style={{ marginTop: 14 }}>The Basic section has no subject teachers: the class teachers enter every subject’s scores.</p>}
    </>)}
  </>);
}
