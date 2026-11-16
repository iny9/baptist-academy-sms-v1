'use client';
import { useState } from 'react';
import Notice from '@/components/Notice';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase-browser';

// Home page carousel photos. The picture goes to storage; only its link is saved in the table.
async function shrink(file) {
  const bmp = await createImageBitmap(file); const k = Math.min(1, 1920 / bmp.width);
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
}

export default function SlidesEditor({ slides }) {
  const sb = supabaseBrowser(); const router = useRouter(); const [msg, setMsg] = useState(null); const [busy, setBusy] = useState(false);
  const refresh = (m) => { setMsg({ ok: true, m }); fetch('/api/revalidate', { method: 'POST' }).catch(() => {}); router.refresh(); };
  async function add(e) {
    e.preventDefault(); const form = e.target; const f = new FormData(form); const file = f.get('photo');
    try {
      if (!file?.size || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a JPG, PNG or WebP photo.');
      if (file.size > 12 * 1024 * 1024) throw new Error('Photo is too large (max 12 MB before resizing).');
      setBusy(true);
      const blob = await shrink(file); const path = `hero/${crypto.randomUUID()}.jpg`;
      const up = await sb.storage.from('site-media').upload(path, blob, { contentType: 'image/jpeg' }); if (up.error) throw up.error;
      const url = sb.storage.from('site-media').getPublicUrl(path).data.publicUrl;
      const { error } = await sb.from('hero_slides').insert({ image_url: url, title: f.get('title') || null, subtitle: f.get('subtitle') || null, sort_order: Number(f.get('order') || slides.length) });
      if (error) throw error; form.reset(); refresh('Photo added to the carousel.');
    } catch (err) { setMsg({ ok: false, m: err.message }); } finally { setBusy(false); }
  }
  async function remove(sl) {
    if (!confirm('Remove this photo from the carousel?')) return;
    const { error } = await sb.from('hero_slides').delete().eq('id', sl.id); if (error) return setMsg({ ok: false, m: error.message });
    const path = sl.image_url.split('/site-media/')[1]; if (path) await sb.storage.from('site-media').remove([path]);
    refresh('Removed.');
  }
  return (<>
    <h2 style={{ marginTop: 8 }}>Home page photos (carousel)</h2>
    {msg && <Notice msg={msg} onClose={() => setMsg(null)} />}
    <form className="panel" onSubmit={add}>
      <div className="row"><div><label htmlFor="sp">Photo of the school (landscape works best)</label><input id="sp" name="photo" type="file" accept="image/jpeg,image/png,image/webp" required /></div>
        <div><label htmlFor="st">Caption</label><input id="st" name="title" maxLength={120} /></div>
        <div><label htmlFor="so">Order</label><input id="so" name="order" type="number" min="0" defaultValue={slides.length} style={{ width: 80 }} /></div>
        <button className="btn" disabled={busy}>{busy ? 'Uploading' : 'Add photo'}</button></div>
      <p className="auth-hint">The photo is resized to a web-friendly size and stored as a file; the database keeps only its link. Until you add photos, the home page shows three illustrated school scenes. Real photos of your school will replace them.</p></form>
    <div className="board" style={{ marginTop: 16 }}>{slides.map((sl) => (
      <article className="card" key={sl.id}><div className="ph" style={{ aspectRatio: '16/9' }}><img src={sl.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div>
        <div className="body"><div>{sl.title || 'No caption'}</div><p className="auth-hint">Order {sl.sort_order}</p><button className="btn danger small" onClick={() => remove(sl)}>Remove</button></div></article>))}</div>
  </>);
}
