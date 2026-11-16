'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Notice from '@/components/Notice';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { SUBS, VARIANT, naira } from '@/lib/schedule-logic';

const SUBS_OF = { basic: ['nursery', 'primary'], secondary: ['junior', 'senior'] };

// Create, change and delete schedule items. Each item is added to the matching students' schedules the moment it is saved.
//   1  bursar: every student of a section          2A section head: every student of the section     2B section head: one sub-section
//   3A class teacher / form master: the whole class   3B class teacher / form master: chosen students of the class
export default function ScheduleBuilder({ term, canL1 = false, l2Sections = [], classes = [], students = [], classesAll = [], items }) {
  const sb = useMemo(() => supabaseBrowser(), []); const router = useRouter();
  const variants = [canL1 && '1', l2Sections.length > 0 && '2A', l2Sections.length > 0 && '2B', classes.length > 0 && '3A', classes.length > 0 && '3B'].filter(Boolean);
  const [v, setV] = useState(variants[0] ?? '1');
  const [section, setSection] = useState(canL1 ? 'both' : l2Sections[0] ?? 'secondary');
  const [cls, setCls] = useState(classes[0]?.id ?? '');
  const [picked, setPicked] = useState(new Set());
  const [msg, setMsg] = useState(null); const [busy, setBusy] = useState(false); const [edit, setEdit] = useState(null);
  const lv = Number(v[0]);
  const sec = lv === 3 ? classes.find((c) => c.id === cls)?.section : section;
  const classStudents = students.filter((s) => s.class_id === cls);
  const mine = (i) => (i.level === 1 && canL1) || (i.level === 2 && l2Sections.includes(i.section)) || (i.level === 3 && classes.some((c) => c.id === i.class_id));
  const ok = (m) => setMsg({ ok: true, m }); const bad = (e) => setMsg({ ok: false, m: e?.message ?? String(e) });

  async function add(e) {
    e.preventDefault(); const f = new FormData(e.target); setBusy(true); setMsg(null);
    const secs = v === '1' && section === 'both' ? ['basic', 'secondary'] : [lv === 3 ? null : section];
    let total = 0;
    for (const s of secs) {
      const { data, error } = await sb.rpc('create_fee_item', { p_term: term, p_variant: v, p_section: s, p_class: lv === 3 ? cls : null, p_sub: v === '2B' ? f.get('sub') : null,
        p_title: String(f.get('title')).trim(), p_amount: Number(f.get('amount')), p_students: v === '3B' ? [...picked] : null });
      if (error) { setBusy(false); return bad(error); }
      total += data.students;
    }
    setBusy(false); e.target.reset(); setPicked(new Set()); ok(`Saved and added to ${total} student schedule(s).`); router.refresh();
  }
  async function save(i) { setBusy(true); const { data, error } = await sb.rpc('update_fee_item', { p_id: i.id, p_title: edit.title, p_amount: Number(edit.amount) }); setBusy(false); if (error) return bad(error); setEdit(null); ok(`Updated. ${data} unpaid line(s) changed; lines already sent, cleared or brought forward keep their old figure.`); router.refresh(); }
  async function del(i) { if (!confirm('Delete this item and remove it from every unpaid schedule?')) return; const { error } = await sb.rpc('delete_fee_item', { p_id: i.id }); error ? bad(error) : (ok('Deleted.'), router.refresh()); }

  const shown = items.filter((i) => !i.is_extramural);
  return (<>
    {msg && <Notice msg={msg} onClose={() => setMsg(null)} />}
    {variants.length > 0 && <form className="panel" onSubmit={add} style={{ marginTop: 16 }}>
      <h3>Add to the schedule</h3>
      <div className="row">
        <div><label htmlFor="sb-v">Level</label><select id="sb-v" value={v} onChange={(e) => { setV(e.target.value); setPicked(new Set()); }}>{variants.map((x) => <option key={x} value={x}>{VARIANT[x]}</option>)}</select></div>
        {lv < 3 && <div><label htmlFor="sb-s">Section</label><select id="sb-s" value={section} onChange={(e) => setSection(e.target.value)}>
          {(v === '1' ? (canL1 ? ['both', 'basic', 'secondary'] : []) : l2Sections).map((s) => <option key={s} value={s}>{s === 'both' ? 'Both sections' : s === 'basic' ? 'Basic' : 'Secondary'}</option>)}</select></div>}
        {v === '2B' && <div><label htmlFor="sb-sub">Sub-section</label><select id="sb-sub" name="sub">{(SUBS_OF[section] ?? []).map((s) => <option key={s} value={s}>{SUBS[s]}</option>)}</select></div>}
        {lv === 3 && <div><label htmlFor="sb-c">Class</label><select id="sb-c" value={cls} onChange={(e) => { setCls(e.target.value); setPicked(new Set()); }}>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>}
        <div><label htmlFor="sb-t">Item</label><input id="sb-t" name="title" required minLength={2} maxLength={100} /></div>
        <div><label htmlFor="sb-a">Amount (₦)</label><input id="sb-a" name="amount" type="number" min="1" step="0.01" required /></div>
        <button className="btn" disabled={busy || (v === '3B' && picked.size === 0)}>{busy ? 'Saving…' : 'Add item'}</button></div>
      {v === '3B' && <div style={{ marginTop: 10 }}><strong>Students ({picked.size} chosen)</strong>{' '}
        <button type="button" className="btn ghost small" onClick={() => setPicked(new Set(classStudents.map((s) => s.id)))}>All</button>{' '}<button type="button" className="btn ghost small" onClick={() => setPicked(new Set())}>None</button>
        <div className="at-days" style={{ marginTop: 6 }}>{classStudents.map((s) => (<label key={s.id} className="at-day" style={{ minWidth: 190, cursor: 'pointer' }}><input type="checkbox" checked={picked.has(s.id)} onChange={() => { const n = new Set(picked); n.has(s.id) ? n.delete(s.id) : n.add(s.id); setPicked(n); }} /> {s.last_name} {s.first_name}</label>))}</div></div>}
      <p className="auth-hint">The item reaches the matching students’ schedules and their parents’ pages as soon as you save. Nothing needs to be “issued”.</p>
    </form>}
    <table style={{ marginTop: 16 }}><thead><tr><th>Level</th><th>Applies to</th><th>Item</th><th>Amount</th><th /></tr></thead><tbody>
      {shown.map((i) => (<tr key={i.id}><td>{VARIANT[i.variant] ?? 'Level ' + i.level}</td>
        <td>{i.section}{i.sub_section ? ` / ${SUBS[i.sub_section]}` : ''}{i.class_id ? ` / ${classesAll.find((c) => c.id === i.class_id)?.name ?? ''}` : ''}</td>
        {edit?.id === i.id ? <><td><input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} maxLength={100} /></td><td><input type="number" min="1" step="0.01" value={edit.amount} onChange={(e) => setEdit({ ...edit, amount: e.target.value })} /></td>
          <td><button className="btn small" disabled={busy} onClick={() => save(i)}>Save</button> <button className="btn ghost small" onClick={() => setEdit(null)}>Cancel</button></td></>
          : <><td>{i.title}</td><td>{naira(i.amount_ngn)}</td><td>{mine(i) && <><button className="btn ghost small" onClick={() => setEdit({ id: i.id, title: i.title, amount: i.amount_ngn })}>Edit</button> <button className="btn danger small" onClick={() => del(i)}>Delete</button></>}</td></>}
      </tr>))}</tbody></table>
    {shown.length === 0 && <p className="auth-hint">No items yet for this term.</p>}
  </>);
}
