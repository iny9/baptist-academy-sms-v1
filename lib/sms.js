// SMS through Termii's bulk endpoint. Sender ID must be approved by Termii; DND numbers may need their "dnd" channel.
export function normalisePhone(raw) {
  const d = String(raw ?? '').replace(/[^0-9]/g, '');
  if (/^0[789][01]\d{8}$/.test(d)) return '234' + d.slice(1);
  if (/^234[789][01]\d{8}$/.test(d)) return d;
  return null;
}
export async function sendSms(numbers, text) {
  if (!process.env.TERMII_API_KEY || !process.env.TERMII_SENDER_ID) throw new Error('SMS is not configured (TERMII_API_KEY, TERMII_SENDER_ID).');
  const to = [...new Set(numbers.map(normalisePhone).filter(Boolean))]; let sent = 0;
  for (let i = 0; i < to.length; i += 100) {
    const res = await fetch('https://api.ng.termii.com/api/sms/send/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: process.env.TERMII_API_KEY, to: to.slice(i, i + 100), from: process.env.TERMII_SENDER_ID, sms: text, type: 'plain', channel: 'generic' }) });
    if (!res.ok) throw new Error(`SMS provider rejected the request (${res.status}). ${sent} sent before the error.`);
    sent += Math.min(100, to.length - i);
  }
  return { sent, skipped: numbers.length - to.length };
}
