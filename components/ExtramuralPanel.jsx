'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Notice from '@/components/Notice';
import { supabaseBrowser } from '@/lib/supabase-browser';

const naira = (n) => '₦' + Number(n).toLocaleString('en-NG', { minimumFractionDigits: 2 });

// Class teacher / form master: set this term's extra-mural fee for the class, then tick the students attending.
// Ticked students get the line on their schedule at once; their parents and the bursar see it straight away.
export default function ExtramuralPanel({ term, cls, students, fee, enrolled }) {
  const router = useRouter(); const sb = supabaseBrowser();
  const [amount, setAmount] = useState(fee ? String(fee.amount_ngn) : ''); const [title, setTitle] = useState(fee?.title ?? 'Extra-mural lessons');
  const [ticked, setTicked] = useState(new Set(enrolled)); const [msg, setMsg] = useState(null); const [busy, setBusy] = useState(false);
  const toggle = (id) => setTicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  async function saveFee(e) {
    e.preventDefault(); const a = Number(amount);
    if (!(a > 0)) return setMsg({ ok: false, m: 'Enter an amount above zero.' });
    setBusy(true); const { error } = await sb.rpc('set_extramural_fee', { p_term: term, p_class: cls.id, p_amount: a, p_title: title });
    setBusy(false); error ? setMsg({ ok: false, m: error.message }) : (setMsg({ ok: true, m: 'Fee saved. Unpaid lines for ticked students were updated.' }), router.refresh());
  }
  async function saveTicks() {
    setBusy(true); const { data, error } = await sb.rpc('set_extramural_students', { p_term: term, p_class: cls.id, p_students: [...ticked] });
    setBusy(false);
    if (error) return setMsg({ ok: false, m: error.message });
    setMsg({ ok: true, m: `Saved: ${data.added} added, ${data.removed} removed.${data.kept_because_paid_or_claimed ? ` ${data.kept_because_paid_or_claimed} kept because the fee is already paid or sent to the bursar.` : ''}${data.fee_set ? '' : ' Set the fee above so the amount reaches their schedules.'}` });
    router.refresh();
  }
  return (<div className="panel" style={{ marginTop: 16 }}>
    <h3 style={{ marginTop: 0 }}>Extra-mural lessons: {cls.name}</h3>
    {msg && <Notice msg={msg} onClose={() => setMsg(null)} />}
    <form className="row" onSubmit={saveFee}>
      <div style={{ flex: 2, minWidth: 200 }}><label>Lessons</label><input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} /></div>
      <div><label>Fee for this term (₦)</label><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} maxLength={12} required /></div>
      <button className="btn" disabled={busy}>{fee ? 'Update fee' : 'Set fee'}</button></form>
    <p className="auth-hint">{fee ? `Current fee: ${naira(fee.amount_ngn)}.` : 'No fee set yet.'} Tick the students attending this term:</p>
    <div style={{ columnWidth: 220 }}>{students.map((s) => (<label key={s.id} style={{ display: 'block', margin: '4px 0' }}><input type="checkbox" checked={ticked.has(s.id)} onChange={() => toggle(s.id)} /> {s.last_name} {s.first_name}</label>))}</div>
    <p><button className="btn" disabled={busy} onClick={saveTicks}>Save ticked students ({ticked.size})</button></p>
  </div>);
}
