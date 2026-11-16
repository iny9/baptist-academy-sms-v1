// Express API for the privileged operations. The browser still talks to Supabase directly for
// everything Row Level Security can govern; this API holds the service-role key and runs the rest.
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const { createClient } = require('@supabase/supabase-js');

const { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, FRONTEND_URL, RESEND_API_KEY, MAIL_FROM } = process.env;
const anon = () => createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const admin = () => createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const app = express();
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: FRONTEND_URL ? FRONTEND_URL.split(',') : false, methods: ['GET', 'POST'], allowedHeaders: ['Authorization', 'Content-Type'] }));
app.use(express.json({ limit: '100kb' }));
app.use(rateLimit({ windowMs: 10 * 60 * 1000, limit: 100, standardHeaders: true, legacyHeaders: false }));
const strict = rateLimit({ windowMs: 10 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });

// Verify the Supabase access token, then load the caller's roles from the database.
async function auth(req, res, next) {
  const token = (req.headers.authorization ?? '').replace(/^Bearer /, '');
  if (!token) return res.status(401).json({ error: 'Sign in required' });
  const { data, error } = await anon().auth.getUser(token);
  if (error || !data.user) return res.status(401).json({ error: 'Invalid session' });
  const { data: roles } = await admin().from('user_roles').select('role,section').eq('user_id', data.user.id);
  req.user = data.user; req.roles = roles ?? [];
  next();
}
const need = (...allowed) => (req, res, next) => (req.roles.some((r) => allowed.includes(r.role)) ? next() : res.status(403).json({ error: 'Forbidden' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));

const SECTIONAL = ['exam_officer', 'class_teacher', 'subject_teacher', 'principal', 'headmaster'];
const Invite = z.object({
  emails: z.array(z.string().trim().toLowerCase().email().max(254)).min(1).max(20),
  // Only administrators are added by email; everyone else is created by the admin from a name and a role (username + default password).
  roles: z.array(z.object({ role: z.enum(['admin']), section: z.enum(['basic', 'secondary']).nullable() })).min(1).max(1),
}).refine((b) => b.roles.every((r) => SECTIONAL.includes(r.role) === (r.section !== null)), { message: 'Section rules violated' })
  .refine((b) => b.roles.every((r) => (r.role !== 'principal' || r.section === 'secondary') && (r.role !== 'headmaster' || r.section === 'basic')), { message: 'Principal is secondary; headmaster is basic' });

app.post('/api/invite', strict, auth, need('admin'), async (req, res) => {
  const p = Invite.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.issues[0].message });
  const db = admin(); const results = [];
  for (const email of [...new Set(p.data.emails)]) {
    await db.from('invites').delete().eq('email', email).is('consumed_at', null);
    const ins = await db.from('invites').insert({ email, roles: p.data.roles, invited_by: req.user.id });
    if (ins.error) { results.push({ email, ok: false, error: 'Could not save invite' }); continue; }
    const inv = await db.auth.admin.inviteUserByEmail(email, { redirectTo: `${FRONTEND_URL.split(',')[0]}/auth/accept` });
    results.push(inv.error ? { email, ok: false, error: inv.error.message } : { email, ok: true });
  }
  res.json({ results });
});

const Message = z.object({ parent_ids: z.array(z.string().uuid()).min(1).max(300), subject: z.string().trim().min(3).max(150), body: z.string().trim().min(1).max(5000), channel: z.enum(['email', 'sms', 'both']).default('email') });
app.post('/api/message', strict, auth, need('admin', 'board_member'), async (req, res) => {
  const p = Message.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'Invalid request' });
  const { channel } = p.data;
  if (channel !== 'sms' && (!RESEND_API_KEY || !MAIL_FROM)) return res.status(500).json({ error: 'Email is not configured' });
  if (channel !== 'email' && (!process.env.TERMII_API_KEY || !process.env.TERMII_SENDER_ID)) return res.status(500).json({ error: 'SMS is not configured' });
  if (channel !== 'email' && p.data.body.length > 459) return res.status(400).json({ error: 'SMS text is limited to 459 characters' });
  const { data } = await admin().from('user_roles').select('profiles(email,phone)').eq('role', 'parent').in('user_id', p.data.parent_ids);
  let smsSent = 0;
  if (channel !== 'email') {
    const nums = [...new Set((data ?? []).map((r) => String(r.profiles.phone ?? '').replace(/[^0-9]/g, '')).map((d) => (/^0[789][01]\d{8}$/.test(d) ? '234' + d.slice(1) : /^234[789][01]\d{8}$/.test(d) ? d : null)).filter(Boolean))];
    for (let i = 0; i < nums.length; i += 100) {
      const r = await fetch('https://api.ng.termii.com/api/sms/send/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: process.env.TERMII_API_KEY, to: nums.slice(i, i + 100), from: process.env.TERMII_SENDER_ID, sms: `${p.data.subject}: ${p.data.body}`.slice(0, 459), type: 'plain', channel: 'generic' }) });
      if (!r.ok) return res.status(502).json({ error: `SMS provider error (${r.status}); ${smsSent} sent` });
      smsSent += Math.min(100, nums.length - i);
    }
    if (channel === 'sms') return res.json({ sent: smsSent });
  }
  const msgs = (data ?? []).map((r) => ({ from: MAIL_FROM, to: [r.profiles.email], subject: p.data.subject,
    html: `<div style="font-family:Arial,sans-serif"><h2>${esc(p.data.subject)}</h2><p style="white-space:pre-wrap">${esc(p.data.body)}</p><p>Baptist Academy Jimeta Yola</p></div>` }));
  let sent = 0;
  for (let i = 0; i < msgs.length; i += 100) {
    const r = await fetch('https://api.resend.com/emails/batch', { method: 'POST', headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(msgs.slice(i, i + 100)) });
    if (!r.ok) return res.status(502).json({ error: `Email provider error (${r.status}); ${sent} sent` });
    sent += Math.min(100, msgs.length - i);
  }
  res.json({ sent, smsSent });
});

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, _req, res, _next) => { console.error(err); res.status(500).json({ error: 'Server error' }); });
module.exports = app;
