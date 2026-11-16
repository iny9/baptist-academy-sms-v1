'use client';
import { useState } from 'react';
import Notice from '@/components/Notice';
import { cleanName, cleanText, isEmail } from '@/lib/validate';
import { bySurname } from '@/lib/sort';
const ADM = /^[A-Za-z0-9/_-]{1,30}$/;
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { parseCsv } from '@/lib/csv';
import RecordFrame from './RecordFrame';

const TEMPLATE = 'admission_no,first_name,last_name,other_names,gender,dob,class,student_type,debt_forward\nBA/2026/001,Ada,Okoro,,Female,2013-05-14,JSS1,new,0\nBA/2025/044,Musa,Bello,,Male,2012-02-01,JSS2,continuing,15000\n';
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export default function StudentsManager({ classes, students, canManage, canPhoto = false, isAdmin = false, links = [] }) {
  const sb = supabaseBrowser(); const router = useRouter();
  const [msg, setMsg] = useState(null); const [filter, setFilter] = useState(''); const [secFilter, setSecFilter] = useState(''); const [picked, setPicked] = useState(new Set()); const [report, setReport] = useState(null);
  const ok = (m) => { setMsg({ ok: true, m }); router.refresh(); };
  const bad = (e) => setMsg({ ok: false, m: /duplicate key/.test(e.message ?? '') ? 'That admission number already exists.' : (e.message ?? String(e)) });
  const clsName = (id) => classes.find((c) => c.id === id)?.name ?? '';
  const secOf = (id) => classes.find((c) => c.id === id)?.section;
  const classChoices = classes.filter((c) => !secFilter || c.section === secFilter);
  const shown = students.filter((s) => (!filter || s.class_id === filter) && (!secFilter || secOf(s.class_id) === secFilter)).slice().sort(bySurname);
  const tick = (id) => { const n = new Set(picked); n.has(id) ? n.delete(id) : n.add(id); setPicked(n); };
  const pickSection = (v) => { setSecFilter(v); setFilter(''); setPicked(new Set()); };
  const pickClass = (v) => { setFilter(v); setPicked(new Set()); };

  async function add(e) {
    e.preventDefault(); const form = e.target; const f = new FormData(form); const photo = f.get('photo');
    const debt = canManage ? Number(f.get('debt') || 0) : 0;   // brought-forward money is set by the administrator / exam officer only
    if (!(debt >= 0 && debt <= 100000000)) return bad({ message: 'Brought-forward debt must be zero or more.' });
    const first = cleanName(f.get('first')), last = cleanName(f.get('last')), other = cleanName(f.get('other'), 80), adm = cleanText(f.get('adm'), 30);
    if (!first || !last) return bad({ message: 'First name and surname are needed, using letters only.' });
    if (adm && !ADM.test(adm)) return bad({ message: 'The admission number may use letters, numbers, / _ and - only.' });
    const dobV = String(f.get('dob') ?? ''); if (!/^\d{4}-\d{2}-\d{2}$/.test(dobV) || new Date(dobV) > new Date() || new Date(dobV) < new Date('1990-01-01')) return bad({ message: 'Enter a real date of birth.' });
    if (photo?.size && (!['image/jpeg', 'image/png', 'image/webp'].includes(photo.type))) return bad({ message: 'Photo must be a JPG, PNG or WebP image.' });
    const { data, error } = await sb.from('students').insert({ admission_no: adm || null, first_name: first, last_name: last,
      other_names: other || null, gender: f.get('gender'), dob: f.get('dob'), class_id: f.get('class'), student_type: f.get('stype'), debt_forward_ngn: debt }).select('id').single();
    if (error) return bad(error);
    form.reset();
    if (photo?.size) await uploadPhoto({ id: data.id }, photo, 'Student added. ');
    else ok('Student added.');
  }

  async function importCsv(text) {
    const rows = parseCsv(text); const errors = []; const good = [];
    if (rows.length === 0) return setReport({ errors: ['The file has no data rows.'] });
    if (rows.length > 500) return setReport({ errors: ['Import at most 500 students at a time.'] });
    const seen = new Set();
    rows.forEach((r, i) => {
      const n = i + 2; const cls = classes.find((c) => c.name.toLowerCase() === (r.class ?? '').toLowerCase());
      const gender = ['male', 'female'].includes((r.gender ?? '').toLowerCase()) ? (r.gender[0].toUpperCase() + r.gender.slice(1).toLowerCase()) : null;
      if (!cleanName(r.first_name) || !cleanName(r.last_name)) errors.push(`Row ${n}: first_name and last_name are required.`);
      if (!gender) errors.push(`Row ${n}: gender must be Male or Female.`);
      if (!ISO.test(r.dob ?? '') || isNaN(Date.parse(r.dob)) || new Date(r.dob) > new Date()) errors.push(`Row ${n}: dob must be a past date as YYYY-MM-DD.`);
      if (!cls) errors.push(`Row ${n}: class "${r.class}" does not exist in your sections.`);
      const stype = (r.student_type || 'continuing').toLowerCase(); if (!['new', 'continuing'].includes(stype)) errors.push(`Row ${n}: student_type must be new or continuing.`);
      const debt = Number(r.debt_forward || 0); if (!(debt >= 0)) errors.push(`Row ${n}: debt_forward must be a number, zero or more.`); if (!canManage && debt > 0) errors.push(`Row ${n}: only the administrator or exam officer can enter a brought-forward debt. Leave it 0.`);
      if (r.admission_no && !ADM.test(r.admission_no)) errors.push(`Row ${n}: admission_no may use letters, numbers, / _ and - only.`);
      if (r.admission_no) { if (seen.has(r.admission_no)) errors.push(`Row ${n}: repeated admission_no.`); seen.add(r.admission_no); }
      good.push({ admission_no: r.admission_no || null, first_name: cleanName(r.first_name), last_name: cleanName(r.last_name), other_names: cleanName(r.other_names, 80) || null, gender, dob: r.dob, class_id: cls?.id, student_type: stype, debt_forward_ngn: debt });
    });
    if (errors.length) return setReport({ errors: errors.slice(0, 30) });
    const { error } = await sb.from('students').insert(good);   // one statement: all rows or none
    if (error) return bad(error);
    setReport(null); ok(`${good.length} students imported.`);
  }
  async function onFile(e) {
    const file = e.target.files[0]; e.target.value = '';
    if (!file) return;
    if (file.size > 1024 * 1024 || !/\.csv$/i.test(file.name)) return setReport({ errors: ['Choose a .csv file under 1 MB.'] });
    importCsv(await file.text());
  }
  async function editName(s) {
    const first = prompt('First name', s.first_name); if (first === null) return;
    const last = prompt('Last name', s.last_name); if (last === null) return;
    if (!cleanName(first) || !cleanName(last)) return bad({ message: 'Names cannot be empty, and use letters only.' });
    const { error } = await sb.from('students').update({ first_name: cleanName(first), last_name: cleanName(last) }).eq('id', s.id);
    error ? bad(error) : ok('Name updated.');
  }
  async function setStatus(s, status) {
    const { error } = await sb.from('students').update({ status }).eq('id', s.id); error ? bad(error) : ok('Status updated.');
  }
  async function remove(s) {
    if (!confirm(`Remove ${s.first_name} ${s.last_name} permanently?`)) return;
    const { error } = await sb.from('students').delete().eq('id', s.id); error ? bad(error) : ok('Student removed.');
  }
  // Admin only (the database checks this too). Removes the ticked students for good, with everything stored about them.
  async function bulkDelete() {
    const ids = shown.filter((s) => picked.has(s.id)).map((s) => s.id); if (!ids.length) return;
    const where = filter ? clsName(filter) : secFilter ? `the ${secFilter} section` : 'all classes';
    const typed = prompt(`You are about to PERMANENTLY delete ${ids.length} student(s) from ${where}, together with their scores, attendance, ratings, fee and payment records. This cannot be undone.\n\nType DELETE to confirm.`);
    if (typed === null) return;
    if (typed.trim() !== 'DELETE') return bad({ message: 'Nothing was deleted: you did not type DELETE.' });
    const { data, error } = await sb.rpc('delete_students', { p_students: ids });
    if (error) return bad(error);
    setPicked(new Set()); ok(`${data} student(s) deleted.`);
  }
  async function linkParent(s) {
    const email = (prompt('Parent or guardian email (must already be registered)') ?? '').trim().toLowerCase(); if (!email) return;
    if (!isEmail(email)) return bad({ message: 'That does not look like an email address.' });
    const { error } = await sb.rpc('link_guardian', { p_student: s.id, p_email: email }); error ? bad(error) : ok('Guardian linked.');
  }
  async function uploadPhoto(s, file, prefix = '') {
    if (!file) return;
    try {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Use a JPG, PNG or WebP image.');
      const bmp = await createImageBitmap(file); const k = Math.min(1, 1000 / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(bmp, 0, 0, c.width, c.height);
      const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.88));
      const fd = new FormData(); fd.append('file', blob, 'photo.jpg'); fd.append('student_id', s.id);
      setMsg({ ok: true, m: 'Uploading the photo…' });
      const res = await fetch('/api/student-photo', { method: 'POST', body: fd }); const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || (res.status === 413 ? 'The photo is too large for the server.' : res.status === 403 ? 'You are not allowed to change this photo (admin or exam officer only).' : `The server could not save the photo (error ${res.status}).`));
      ok(prefix + 'Photo saved.');
    } catch (e) { bad(e); }
  }
  function template() {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([TEMPLATE], { type: 'text/csv' })); a.download = 'students-template.csv'; a.click();
  }

  return (<>
    {msg && <Notice msg={msg} onClose={() => setMsg(null)} />}
    {canManage && <p><a className="btn ghost" href="/admin/students/match">Match students to parents</a></p>}
    <form className="panel" onSubmit={add}>
      <h3>Add one student</h3>
      <div className="row">
        <div><label htmlFor="f1">First name</label><input id="f1" name="first" required maxLength={60} /></div>
        <div><label htmlFor="f2">Last name</label><input id="f2" name="last" required maxLength={60} /></div>
        <div><label htmlFor="f3">Other names</label><input id="f3" name="other" maxLength={80} /></div>
      </div>
      <div className="row">
        <div><label htmlFor="f4">Admission no.</label><input id="f4" name="adm" pattern="[A-Za-z0-9/_\-]{1,30}" /></div>
        <div><label>Gender</label><div className="checks"><label><input type="radio" name="gender" value="Male" required />Male</label><label><input type="radio" name="gender" value="Female" />Female</label></div></div>
        <div><label htmlFor="f5">Date of birth</label><input id="f5" name="dob" type="date" required max={new Date().toISOString().slice(0, 10)} /></div>
        <div><label htmlFor="f6">Class</label><select id="f6" name="class" required>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
      </div>
      <div className="row">
        <div><label>New or continuing student</label><div className="checks"><label><input type="radio" name="stype" value="new" required />New</label><label><input type="radio" name="stype" value="continuing" defaultChecked />Continuing</label></div></div>
        {canManage && <div><label htmlFor="f7">Previous debt brought forward (₦)</label><input id="f7" name="debt" type="number" min="0" step="0.01" defaultValue="0" /></div>}
        <div><label htmlFor="f8">Passport photo (JPG, PNG, WebP)</label><input id="f8" name="photo" type="file" accept="image/jpeg,image/png,image/webp" /></div>
      </div>
      <p><button className="btn">Add student</button></p>
    </form>

    <div className="panel" style={{ marginTop: 16 }}>
      <h3>Import many from CSV</h3>
      <p>Columns: admission_no, first_name, last_name, other_names, gender, dob (YYYY-MM-DD), class, student_type (new or continuing), debt_forward (naira). Any debt is added to the student's fee schedule automatically. Nothing is saved unless every row is valid.</p>
      <input type="file" accept=".csv,text/csv" onChange={onFile} aria-label="CSV file" style={{ width: 'auto' }} />{' '}
      <button type="button" className="btn ghost small" onClick={template}>Download template</button>
      {report?.errors && <div className="msg err" role="alert">{report.errors.map((x, i) => <div key={i}>{x}</div>)}</div>}
    </div>

    <div className="row" style={{ margin: '28px 0 8px' }}>
      <div><label htmlFor="fsec">Show section</label>
        <select id="fsec" value={secFilter} onChange={(e) => pickSection(e.target.value)}><option value="">All sections</option><option value="basic">Basic</option><option value="secondary">Secondary</option></select></div>
      <div><label htmlFor="flt">Show class</label>
        <select id="flt" value={filter} onChange={(e) => pickClass(e.target.value)}><option value="">All classes</option>{classChoices.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
      <div>{shown.length} student(s)</div></div>
    {isAdmin && shown.length > 0 && <div className="panel" style={{ marginBottom: 10, padding: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      <strong>Delete many at once</strong>
      <button type="button" className="btn ghost small" onClick={() => setPicked(new Set(shown.map((s) => s.id)))}>Tick all shown ({shown.length})</button>
      <button type="button" className="btn ghost small" onClick={() => setPicked(new Set())} disabled={picked.size === 0}>Clear</button>
      <button type="button" className="btn danger small" onClick={bulkDelete} disabled={picked.size === 0}>Delete {picked.size} selected</button>
      <span className="auth-hint">Choose a section and class above, tick the students (or tick all), then delete. Students whose results are locked cannot be deleted until the term is unlocked.</span></div>}
    <RecordFrame noun="students" head={<thead><tr>{isAdmin && <th style={{ width: 36 }} />}<th>Photo</th><th>Name</th><th>Parents</th><th>Class</th><th>Gender</th><th>Age</th><th>Status</th><th></th></tr></thead>}>
      {shown.map((s) => (
        <tr key={s.id} style={s.status !== 'active' ? { opacity: .6 } : null}>
          {isAdmin && <td><input type="checkbox" checked={picked.has(s.id)} onChange={() => tick(s.id)} aria-label={`Select ${s.last_name} ${s.first_name}`} /></td>}
          <td>{s.photo_url ? <img src={s.photo_url} alt="" width="36" height="44" style={{ objectFit: 'cover', borderRadius: 4 }} /> : <span aria-hidden>-</span>}</td>
          <td>{s.last_name} {s.first_name} {s.other_names ?? ''}<div style={{ color: 'var(--muted)', fontSize: '.8rem' }}>{s.admission_no}</div></td>
          <td style={{ fontSize: '.85rem' }}>{links.filter((l) => l.student_id === s.id).map((l) => l.parent_name || l.parent_email).join(', ') || <span className="badge gold">Not matched</span>}</td>
          <td>{clsName(s.class_id)}<div><span className="badge" style={{ marginTop: 2 }}>{s.student_type === 'new' ? 'New' : 'Continuing'}</span>{Number(s.debt_forward_ngn) > 0 && <span className="badge red" style={{ marginLeft: 4 }}>B/F ₦{Number(s.debt_forward_ngn).toLocaleString('en-NG')}</span>}</div></td><td>{s.gender}</td><td>{s.age_years}</td>
          <td><select aria-label="Status" value={s.status} onChange={(e) => setStatus(s, e.target.value)} style={{ width: 'auto' }}>
            {['active', 'transferred', 'deceased', ...(s.status === 'graduated' ? ['graduated'] : [])].map((x) => <option key={x}>{x}</option>)}</select></td>
          <td><button className="btn ghost small" onClick={() => editName(s)}>Edit name</button>{' '}
            {canManage && <a className="btn ghost small" href="/admin/students/match">Match parents</a>}{' '}
            {(canManage || canPhoto) && <label className="btn ghost small" style={{ display: 'inline-block', margin: 0, cursor: 'pointer' }}>Photo<input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { uploadPhoto(s, e.target.files[0]); e.target.value = ''; }} /></label>}{' '}
            <button className="btn danger small" onClick={() => remove(s)}>Remove</button></td></tr>))}
    </RecordFrame>
  </>);
}
