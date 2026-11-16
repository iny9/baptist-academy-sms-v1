// Email through Resend's REST API. No SDK needed.
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Turns Resend's answer into a plain-English reason the admin can act on.
function explain(status, body) {
  const m = String(body?.message ?? body?.error ?? '');
  if (status === 401 || /api key is invalid|missing api key/i.test(m)) return 'The email service did not accept the RESEND_API_KEY. Check the key in your hosting settings and redeploy.';
  if (/domain.*not verified|verify (a|your) domain|only send testing emails to your own/i.test(m)) return 'The sending domain is not verified in Resend, so it can only email your own address. Verify the domain at resend.com/domains and use an address on it in MAIL_FROM.';
  if (/from.*(invalid|format)|invalid .?from/i.test(m)) return 'MAIL_FROM is not valid. Use the form: Baptist Academy <noreply@yourdomain.com>.';
  if (status === 429 || /rate limit|too many/i.test(m)) return 'The email service is limiting how fast we send. Wait a minute and try again.';
  if (status === 403) return 'The email service refused the request' + (m ? ': ' + m : '. Check the domain and the key.');
  if (status === 422 || status === 400) return 'The email service rejected the message' + (m ? ': ' + m : '. Check the subject and the recipient addresses.');
  return `The email service had a problem (${status}). Please try again.`;
}
export class MailError extends Error { constructor(m, sent = 0) { super(m); this.sent = sent; } }

export function mailConfigProblem() {
  if (!process.env.RESEND_API_KEY) return 'Email is not set up yet: RESEND_API_KEY is missing on the server. Add it in your hosting settings and redeploy.';
  const from = process.env.MAIL_FROM;
  if (!from) return 'Email is not set up yet: MAIL_FROM is missing on the server. Add it in your hosting settings and redeploy.';
  if (!/^[^<>@\s][^<>]*<[^<>@\s]+@[^<>@\s]+\.[^<>@\s]+>$|^[^<>@\s]+@[^<>@\s]+\.[^<>@\s]+$/.test(from.trim())) return 'MAIL_FROM is not valid. Use: Baptist Academy <noreply@yourdomain.com> (no extra quotes).';
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return 'The server is missing SUPABASE_SERVICE_ROLE_KEY, which is needed to find the parents\' email addresses.';
  return null;
}

export async function sendBatch(messages) {
  const problem = mailConfigProblem(); if (problem) throw new MailError(problem);
  const from = process.env.MAIL_FROM.trim().replace(/^["']|["']$/g, '');
  const ok = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  const list = messages.filter((m) => ok.test(String(m.to ?? '').trim()));
  if (list.length === 0) throw new MailError('None of the parents has a valid email address on file.');
  let sent = 0;
  for (let i = 0; i < list.length; i += 100) {
    const chunk = list.slice(i, i + 100).map((m) => ({ from, to: [m.to.trim()], subject: m.subject, html: m.html }));
    let res, body = null;
    try {
      res = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(chunk), signal: AbortSignal.timeout(20000),
      });
      body = await res.json().catch(() => null);
    } catch { throw new MailError(`Could not reach the email service. ${sent} email(s) were sent before this.`, sent); }
    if (!res.ok) throw new MailError(explain(res.status, body) + (sent ? ` ${sent} were sent before this.` : ''), sent);
    sent += chunk.length;
  }
  return sent;
}

// Simple per-user limiter (per server instance). Use Upstash/Redis for a shared limit on serverless.
const hits = new Map();
export function allow(key, max = 10, windowMs = 10 * 60 * 1000) {
  const now = Date.now(); const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= max) return false;
  list.push(now); hits.set(key, list); return true;
}

export const wrapEmail = (title, inner) => `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;border:2px solid #1B3A7A;padding:20px"><h2 style="color:#0E2252">${esc(title)}</h2>${inner}<p style="color:#777;font-size:12px">Baptist Academy Jimeta Yola</p></div>`;
export const naira = (n) => 'NGN ' + Number(n).toLocaleString('en-NG', { minimumFractionDigits: 2 });
export const linesTable = (lines) => `<table border="1" cellpadding="6" style="border-collapse:collapse;width:100%"><tr><th align="left">Item</th><th align="right">Amount</th></tr>${lines.map((l) => `<tr><td>${esc(l.title)}</td><td align="right">${naira(l.amount_ngn)}</td></tr>`).join('')}<tr><td><b>Total</b></td><td align="right"><b>${naira(lines.reduce((a, l) => a + Number(l.amount_ngn), 0))}</b></td></tr></table>`;
