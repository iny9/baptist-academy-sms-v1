// Small input guards. Database calls are already parameterised (Supabase / PostgREST never builds SQL from text),
// so these checks keep values the right shape and stop odd input before it travels.
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v) => typeof v === 'string' && UUID.test(v);
export const uuidOr = (v) => (isUuid(v) ? v : undefined);
export const uuidList = (v, max = 200) => String(v ?? '').split(',').filter(Boolean).slice(0, max);

// Removes control characters and collapses spaces; never trusts the length
export const cleanText = (v, max = 200) => String(v ?? '').replace(/[\u0000-\u001F\u007F\u200B-\u200F\u2028\u2029]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
// Names: letters, marks, spaces, hyphen, apostrophe, full stop
export const cleanName = (v, max = 60) => cleanText(v, max).replace(/[^\p{L}\p{M}\s.'’-]/gu, '');
export const isEmail = (v) => /^[^@\s]{1,64}@[^@\s]{1,255}\.[^@\s]{2,}$/.test(String(v ?? '').trim());
export const isPhone = (v) => /^[0-9+() -]{7,20}$/.test(String(v ?? '').trim());
export const wholeNumber = (v, min, max) => { const s = String(v ?? '').trim(); if (!/^\d{1,4}$/.test(s)) return null; const n = Number(s); return n >= min && n <= max ? n : null; };
export const score = (v, max) => { const s = String(v ?? '').trim(); if (!/^\d{1,3}(\.\d{1,2})?$/.test(s)) return null; const n = Number(s); return n >= 0 && n <= max ? n : null; };

// Spreadsheet programs run text that starts with = + - @ as a formula. Used for every CSV the system writes.
export const csvSafe = (v) => { const s = String(v ?? ''); return /^[=+\-@\t\r]/.test(s) ? "'" + s : s; };

// Only same-site /admin paths are allowed after sign-in
export const safeNext = (n) => (typeof n === 'string' && /^\/admin(\/[A-Za-z0-9_\-/]*)?$/.test(n) && !n.includes('//') ? n : '/admin');
