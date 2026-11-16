'use client';
import { useState } from 'react';
import Notice from '@/components/Notice';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase-browser';

const FIELDS = [['issue', 'Issue or edition (e.g. Term 1, 2026)'], ['important_dates', 'Important dates'], ['contact', 'Contact information'], ['signed_by', 'Signed by']];

export default function NewsletterForm({ sections }) {
  const router = useRouter(); const [msg, setMsg] = useState(null); const [on, setOn] = useState({});
  async function submit(e) {
    e.preventDefault(); const f = new FormData(e.target); const fields = {};
    for (const [k] of FIELDS) if (on[k] && f.get(k)) fields[k] = String(f.get(k)).slice(0, 2000);
    const section = f.get('section') === 'all' ? null : f.get('section');
    const { error } = await supabaseBrowser().from('newsletters').insert({ section, title: String(f.get('title')).trim(), body: String(f.get('body')), fields });
    if (error) return setMsg({ ok: false, m: error.message });
    e.target.reset(); setOn({}); setMsg({ ok: true, m: 'Newsletter created.' }); router.refresh();
  }
  return (<form className="panel" onSubmit={submit}>
    {msg && <Notice msg={msg} onClose={() => setMsg(null)} />}
    <div className="row"><div><label htmlFor="nt">Title</label><input id="nt" name="title" required minLength={3} maxLength={150} /></div>
      <div><label htmlFor="ns">Audience</label><select id="ns" name="section">{sections.map((s) => <option key={s} value={s}>{s === 'all' ? 'Whole school' : s}</option>)}</select></div></div>
    <label htmlFor="nb">Paste the newsletter content</label><textarea id="nb" name="body" required maxLength={20000} style={{ minHeight: 200 }} />
    <label>Add fields</label>
    <div className="checks">{FIELDS.map(([k, label]) => <label key={k}><input type="checkbox" checked={!!on[k]} onChange={(e) => setOn({ ...on, [k]: e.target.checked })} />{label}</label>)}</div>
    {FIELDS.filter(([k]) => on[k]).map(([k, label]) => <div key={k}><label htmlFor={'n' + k}>{label}</label><textarea id={'n' + k} name={k} style={{ minHeight: 70 }} /></div>)}
    <p><button className="btn">Create newsletter</button></p></form>);
}
