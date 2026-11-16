'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Notice from '@/components/Notice';
import Stamp, { parseLayout, fmtDateLong } from '@/components/Stamp';
import { supabaseBrowser } from '@/lib/supabase-browser';

// Makes near-white pixels transparent in the browser, then returns a PNG.
async function clearBackground(file, maxW = 800) {
  const bmp = await createImageBitmap(file);
  const c = document.createElement('canvas'); c.width = Math.min(bmp.width, maxW); c.height = Math.round(bmp.height * (c.width / bmp.width));
  const ctx = c.getContext('2d'); ctx.drawImage(bmp, 0, 0, c.width, c.height);
  const img = ctx.getImageData(0, 0, c.width, c.height); const d = img.data;
  for (let i = 0; i < d.length; i += 4) { const min = Math.min(d[i], d[i + 1], d[i + 2]); if (min > 215) d[i + 3] = 0; else if (min > 170) d[i + 3] = Math.round(((215 - min) / 45) * 255); }
  ctx.putImageData(img, 0, 0);
  return new Promise((res) => c.toBlob(res, 'image/png'));
}
const okFile = (f) => f && ['image/jpeg', 'image/png', 'image/webp'].includes(f.type) && f.size > 0 && f.size <= 2 * 1024 * 1024;
const clamp = (n) => Math.min(1, Math.max(0, n));

export default function StampManager({ sections, settings }) {
  const router = useRouter(); const sb = supabaseBrowser();
  const [sec, setSec] = useState(sections[0]); const [msg, setMsg] = useState(null); const [busy, setBusy] = useState(false);
  const S = settings;
  const [stampBlob, setStampBlob] = useState(null); const [sigBlob, setSigBlob] = useState(null);
  const [stampUrl, setStampUrl] = useState(S['stamp_' + sec] || ''); const [sigUrl, setSigUrl] = useState(S['stamp_signature_' + sec] || '');
  const [layout, setLayout] = useState(parseLayout(S['stamp_layout_' + sec])); const [mode, setMode] = useState('sign');
  const urls = useRef([]);
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);
  useEffect(() => { setStampBlob(null); setSigBlob(null); setStampUrl(S['stamp_' + sec] || ''); setSigUrl(S['stamp_signature_' + sec] || ''); setLayout(parseLayout(S['stamp_layout_' + sec])); }, [sec]);  // eslint-disable-line

  async function pick(e, kind) {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    if (!okFile(f)) return setMsg({ ok: false, m: 'Use a JPG, PNG or WebP picture under 2 MB.' });
    try {
      const blob = await clearBackground(f, kind === 'stamp' ? 700 : 600); const u = URL.createObjectURL(blob); urls.current.push(u);
      if (kind === 'stamp') { setStampBlob(blob); setStampUrl(u); setMsg({ ok: false, info: true, m: 'Background removed. Now click on the picture where the stamp says “Sign”, then where it says “Date”.' }); }
      else { setSigBlob(blob); setSigUrl(u); }
    } catch { setMsg({ ok: false, m: 'That picture could not be read. Try another one.' }); }
  }
  function place(e) {
    const r = e.currentTarget.getBoundingClientRect(); const x = clamp((e.clientX - r.left) / r.width), y = clamp((e.clientY - r.top) / r.height);
    setLayout((l) => ({ ...l, [mode]: { ...l[mode], x: +x.toFixed(3), y: +y.toFixed(3) } }));
    if (mode === 'sign') setMode('date');
  }
  async function upload(blob, folder) {
    const path = `stamps/${crypto.randomUUID()}.png`;
    const up = await sb.storage.from('site-media').upload(path, blob, { contentType: 'image/png' }); if (up.error) throw up.error;
    return sb.storage.from('site-media').getPublicUrl(path).data.publicUrl;
  }
  async function save() {
    setBusy(true);
    try {
      const a = stampBlob ? await upload(stampBlob) : null; const b = sigBlob ? await upload(sigBlob) : null;
      const { error } = await sb.rpc('set_stamp', { p_section: sec, p_stamp_url: a, p_signature_url: b, p_layout: layout });
      if (error) throw error;
      setMsg({ ok: true, m: 'Saved. The stamp now appears at the bottom right of every report card, with the signature and the date of printing placed on it.' }); router.refresh();
    } catch (err) { setMsg({ ok: false, m: err.message }); } finally { setBusy(false); }
  }
  const fake = { ['stamp_' + sec]: stampUrl, ['stamp_signature_' + sec]: sigUrl, ['stamp_layout_' + sec]: JSON.stringify(layout) };
  const title = sec === 'basic' ? 'Headmaster / Headmistress (Basic)' : 'Principal (Secondary)';
  return (<>
    {msg && <Notice msg={msg} onClose={() => setMsg(null)} />}
    <div className="panel">
      {sections.length > 1 && <><label htmlFor="ss">Whose stamp</label><select id="ss" value={sec} onChange={(e) => setSec(e.target.value)} style={{ maxWidth: 320 }}>{sections.map((s) => <option key={s} value={s}>{s === 'basic' ? 'Basic section' : 'Secondary section'}</option>)}</select></>}
      <h3 style={{ marginTop: 10 }}>{title}</h3>
      <div className="row">
        <div><label htmlFor="sf">1. Stamp picture</label><input id="sf" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => pick(e, 'stamp')} /><small className="auth-hint">Photograph or scan the stamp on white paper. The white background is removed for you.</small></div>
        <div><label htmlFor="sg">2. Signature picture</label><input id="sg" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => pick(e, 'sig')} /><small className="auth-hint">Sign on white paper. It is placed where the stamp says “Sign”.</small></div>
      </div>
      {stampUrl ? (<>
        <h3 style={{ marginTop: 16 }}>3. Show where “Sign” and “Date” are</h3>
        <div className="row"><button type="button" className={'btn small' + (mode === 'sign' ? '' : ' ghost')} onClick={() => setMode('sign')}>Place signature</button>
          <button type="button" className={'btn small' + (mode === 'date' ? '' : ' ghost')} onClick={() => setMode('date')}>Place date</button>
          <div><label htmlFor="sw">Signature size</label><input id="sw" type="range" min="0.2" max="0.9" step="0.02" value={layout.sign.w} onChange={(e) => setLayout({ ...layout, sign: { ...layout.sign, w: +e.target.value } })} /></div>
          <div><label htmlFor="ds">Date size</label><input id="ds" type="range" min="0.05" max="0.16" step="0.005" value={layout.date.size} onChange={(e) => setLayout({ ...layout, date: { ...layout.date, size: +e.target.value } })} /></div></div>
        <p className="auth-hint">Click the picture to place the {mode === 'sign' ? 'signature' : 'date'}. This is how it will look on a report card:</p>
        <div style={{ position: 'relative', width: 260, cursor: 'crosshair', background: '#fff', border: '1px dashed var(--line-strong)', borderRadius: 12, padding: 12 }}>
          <div style={{ position: 'relative' }}><Stamp S={fake} section={sec} date={fmtDateLong()} width={236} />
            <div onClick={place} style={{ position: 'absolute', inset: 0 }} role="button" tabIndex={0} aria-label="Click to place the signature or the date" /></div></div>
      </>) : <p className="auth-hint" style={{ marginTop: 14 }}>Upload the stamp picture to continue.</p>}
      <p style={{ marginTop: 16 }}><button className="btn" onClick={save} disabled={busy || !stampUrl}>{busy ? 'Saving…' : 'Save stamp'}</button></p>
    </div>
  </>);
}
