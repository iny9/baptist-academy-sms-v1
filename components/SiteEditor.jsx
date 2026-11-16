'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase-browser';

const SETTINGS = [['school_name', 'School name'], ['motto', 'Motto (shown above the headline)'], ['hero_title', 'Home page headline (leave blank to use the school name)'], ['hero_text', 'Home page sub-headline (leave blank to use the introduction)', true], ['about', 'Introduction', true], ['history', 'History', true],
  ['address', 'Address'], ['phone', 'Phone'], ['email', 'Contact email'], ['footer_text', 'Footer text']];
const OFFICES = ['Principal', 'Headmaster', 'Headmistress', 'Administrator', 'Proprietor'];

async function uploadPhoto(file) {
  if (!file || !file.size) return null;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) throw new Error('Photo must be JPG, PNG or WebP under 2 MB.');
  const sb = supabaseBrowser();
  const path = `${crypto.randomUUID()}.${file.type.split('/')[1]}`;
  const { error } = await sb.storage.from('site-media').upload(path, file);
  if (error) throw error;
  return sb.storage.from('site-media').getPublicUrl(path).data.publicUrl;
}

export default function SiteEditor({ settings, board, leaders }) {
  const sb = supabaseBrowser();
  const router = useRouter();
  const [msg, setMsg] = useState('');
  const val = (k) => settings.find((s) => s.key === k)?.value ?? '';
  const done = (m) => { setMsg(m); fetch('/api/revalidate', { method: 'POST' }).catch(() => {}); router.refresh(); };
  const fail = (e) => setMsg(e.message ?? 'Something went wrong');

  async function saveSettings(e) {
    e.preventDefault();
    const f = new FormData(e.target);
    const rows = SETTINGS.map(([k]) => ({ key: k, value: String(f.get(k) ?? '').slice(0, 5000), updated_at: new Date().toISOString() }));
    const { error } = await sb.from('site_settings').upsert(rows);
    error ? fail(error) : done('Settings saved.');
  }
  async function addBoard(e) {
    e.preventDefault(); const form = e.target; const f = new FormData(form);
    try {
      const photo_url = await uploadPhoto(f.get('photo'));
      const { error } = await sb.from('board_members').insert({ full_name: f.get('full_name'), portfolio: f.get('portfolio'),
        description: f.get('description'), tenure: f.get('tenure') || null, sort_order: Number(f.get('sort_order') || 0), photo_url });
      if (error) throw error; form.reset(); done('Board member added.');
    } catch (err) { fail(err); }
  }
  async function addLeader(e) {
    e.preventDefault(); const form = e.target; const f = new FormData(form);
    const { error } = await sb.from('past_leaders').insert({ full_name: f.get('full_name'), office: f.get('office'),
      start_year: Number(f.get('start_year')), end_year: f.get('end_year') ? Number(f.get('end_year')) : null, note: f.get('note') || null });
    error ? fail(error) : (form.reset(), done('Added to archive.'));
  }
  async function remove(table, id) {
    if (!confirm('Delete this entry?')) return;
    const { error } = await sb.from(table).delete().eq('id', id);
    error ? fail(error) : done('Deleted.');
  }
  async function rename(table, id, field, current) {
    const v = prompt('New value', current);
    if (v === null || !v.trim()) return;
    const { error } = await sb.from(table).update({ [field]: v.trim() }).eq('id', id);
    error ? fail(error) : done('Updated.');
  }

  return (
    <>
      {msg && <div className="msg ok" role="status">{msg}</div>}
      <h2>Header, footer and text</h2>
      <form className="panel" onSubmit={saveSettings}>
        {SETTINGS.map(([k, label, big]) => (<div key={k}><label htmlFor={k}>{label}</label>
          {big ? <textarea id={k} name={k} defaultValue={val(k)} maxLength={5000} /> : <input id={k} name={k} defaultValue={val(k)} maxLength={200} />}</div>))}
        <p><button className="btn">Save settings</button></p>
      </form>

      <h2 style={{ marginTop: 40 }}>Board members</h2>
      <form className="panel" onSubmit={addBoard}>
        <div className="row">
          <div><label htmlFor="bn">Full name</label><input id="bn" name="full_name" required minLength={2} maxLength={120} /></div>
          <div><label htmlFor="bp">Portfolio</label><input id="bp" name="portfolio" required maxLength={120} /></div>
          <div><label htmlFor="bt">Tenure (e.g. 2022 – present)</label><input id="bt" name="tenure" maxLength={40} /></div>
          <div><label htmlFor="bo">Order</label><input id="bo" name="sort_order" type="number" min="0" defaultValue="0" style={{ width: 80 }} /></div>
        </div>
        <label htmlFor="bd">Description</label><textarea id="bd" name="description" maxLength={1000} />
        <label htmlFor="bph">Photo (JPG, PNG, WebP, max 2 MB)</label><input id="bph" name="photo" type="file" accept="image/jpeg,image/png,image/webp" />
        <p><button className="btn">Add board member</button></p>
      </form>
      <table><tbody>{board.map((m) => (
        <tr key={m.id}><td>{m.full_name}</td><td>{m.portfolio}</td>
          <td><button className="btn ghost small" onClick={() => rename('board_members', m.id, 'portfolio', m.portfolio)}>Edit portfolio</button>{' '}
            <button className="btn danger small" onClick={() => remove('board_members', m.id)}>Delete</button></td></tr>))}</tbody></table>

      <h2 style={{ marginTop: 40 }}>Archive of past leaders</h2>
      <form className="panel" onSubmit={addLeader}>
        <div className="row">
          <div><label htmlFor="ln">Full name</label><input id="ln" name="full_name" required minLength={2} maxLength={120} /></div>
          <div><label htmlFor="lo">Office</label><select id="lo" name="office">{OFFICES.map((o) => <option key={o}>{o}</option>)}</select></div>
          <div><label htmlFor="ls">From</label><input id="ls" name="start_year" type="number" min="1900" max="2100" required style={{ width: 100 }} /></div>
          <div><label htmlFor="le">To</label><input id="le" name="end_year" type="number" min="1900" max="2100" style={{ width: 100 }} /></div>
          <div style={{ flex: 1, minWidth: 220 }}><label htmlFor="ln2">One-line note (what they are known for)</label><input id="ln2" name="note" maxLength={200} /></div>
        </div>
        <p><button className="btn">Add to archive</button></p>
      </form>
      <table><tbody>{leaders.map((l) => (
        <tr key={l.id}><td>{l.full_name}</td><td>{l.office}</td><td>{l.start_year} to {l.end_year ?? 'date'}</td>
          <td><button className="btn ghost small" onClick={() => rename('past_leaders', l.id, 'full_name', l.full_name)}>Edit name</button>{' '}
            <button className="btn danger small" onClick={() => remove('past_leaders', l.id)}>Delete</button></td></tr>))}</tbody></table>
    </>
  );
}
