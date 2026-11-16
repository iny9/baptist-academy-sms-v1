// Turns any technical error (network, database, auth, storage, our own checks) into a short, kind message.
// The same function is used by every screen, so a person never sees raw database text.

const RX = {
  offline: /failed to fetch|networkerror|network request failed|load failed|fetch failed|err_internet|err_network|econnrefused|enotfound|etimedout|socket hang up|authretryablefetch|network_offline/i,
  timeout: /timeout|timed out|statement timeout|canceling statement/i,
  badLogin: /invalid login credentials|invalid_credentials|invalid email or password/i,
  unconfirmed: /email not confirmed|email_not_confirmed/i,
  rate: /rate limit|too many requests|over_request_rate|429/i,
  session: /jwt expired|jwt|not authenticated|invalid refresh token|refresh_token|session.*(expired|missing)|pgrst301/i,
  rls: /row-level security|row level security|permission denied|42501|not allowed|forbidden/i,
  dupe: /duplicate key|already exists|23505|unique constraint/i,
  fk: /foreign key|23503|still referenced|violates foreign/i,
  nullv: /null value in column|23502|not-null/i,
  check: /violates check constraint|23514|check constraint/i,
  uuid: /invalid input syntax for type uuid|22p02/i,
  recursion: /infinite recursion/i,
  schema: /could not find the (function|table|column)|schema cache|does not exist|pgrst20[24]|42703|42883|42p01/i,
  size: /payload too large|too large|exceeded the maximum|entity too large|413/i,
  mime: /mime type|invalid file type|unsupported (media|file)/i,
  server: /internal server error|500|502|503|bad gateway|service unavailable/i,
};

// A message we wrote ourselves (database "raise exception" text or UI text) is already friendly: show it as it is.
const technical = /constraint|relation "|violates|syntax|pgrst|column "|function .*\(|sqlstate|stack|undefined|\[object|typeerror|referenceerror|unexpected token|json/i;

export function classify(input) {
  const raw = typeof input === 'string' ? input : (input?.message ?? input?.error_description ?? input?.error ?? '');
  const text = String(raw || '');
  const status = typeof input === 'object' ? input?.status : undefined;
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const is = (k) => RX[k].test(text);

  if (offline || is('offline') || status === 0) return { kind: 'offline', tone: 'warn', title: 'You seem to be offline',
    body: 'We could not reach the school server. Nothing is wrong with your details.', hint: 'Check your data or Wi-Fi, then try again. Anything you typed is still on the screen.' };
  if (is('timeout')) return { kind: 'timeout', tone: 'warn', title: 'That took too long', body: 'The server did not answer in time.', hint: 'Wait a moment and try again. A weak network is the usual cause.' };
  if (is('unconfirmed')) return { kind: 'auth', tone: 'warn', title: 'Please confirm your email first', body: 'Open the invitation or confirmation email we sent you and follow the link.', hint: 'Ask the admin to send a new invitation if you cannot find it.' };
  if (is('badLogin')) return { kind: 'auth', tone: 'err', title: 'Those details do not match', body: 'The email or the password is not correct.', hint: 'Check for spaces or capital letters, or use “Forgot your password?”.' };
  if (is('rate') && !/row/i.test(text)) return { kind: 'rate', tone: 'warn', title: 'Too many tries', body: 'Please slow down for a moment.', hint: 'Wait about a minute, then try again.' };
  if (is('session')) return { kind: 'session', tone: 'warn', title: 'Your session has ended', body: 'For your safety you were signed out after a while.', hint: 'Sign in again to continue.', action: { label: 'Sign in', href: '/login' } };
  if (is('recursion')) return { kind: 'server', tone: 'err', title: 'The database needs an update', body: 'A permissions rule is out of date.', hint: 'Tell the admin to run the latest database files (supabase/README.md).' };
  if (is('schema')) return { kind: 'server', tone: 'err', title: 'The system is being updated', body: 'A part of the database this screen needs is missing.', hint: 'Tell the admin to apply the newest files in supabase/migrations, then run supabase/verify.sql.' };
  if (is('rls')) return { kind: 'perm', tone: 'err', title: 'You do not have permission for that', body: 'Your role is not allowed to make this change.', hint: 'If you think this is a mistake, ask the admin to check your role.' };
  if (is('dupe')) return { kind: 'dupe', tone: 'warn', title: 'That already exists', body: 'Something with the same name or number is already saved.', hint: 'Change the entry or edit the existing one instead.' };
  if (is('fk')) return { kind: 'link', tone: 'warn', title: 'Other records still depend on this', body: 'It cannot be changed or removed while students, scores or assignments are linked to it.', hint: 'Remove or move the linked records first.' };
  if (is('nullv')) return { kind: 'value', tone: 'warn', title: 'A required box is empty', body: 'Please fill in every required box.', hint: 'Boxes marked in red need a value.' };
  if (is('check') || is('uuid')) return { kind: 'value', tone: 'warn', title: 'One of the values is not allowed', body: 'A number is outside its range, or a box has an unusual value.', hint: 'Check the figures and try again.' };
  if (is('size')) return { kind: 'size', tone: 'warn', title: 'That file is too big', body: 'Use a smaller image or file (under 2 MB).', hint: 'You can shrink a photo with any phone gallery app.' };
  if (is('mime')) return { kind: 'size', tone: 'warn', title: 'That file type is not accepted', body: 'Use a JPG, PNG or WebP picture.', hint: '' };
  if (is('server')) return { kind: 'server', tone: 'err', title: 'The server had a hiccup', body: 'This is not your fault.', hint: 'Try again in a minute. If it keeps happening, tell the school office.' };
  if (text && !technical.test(text) && text.length < 280) return { kind: 'custom', tone: 'warn', title: 'Please check this', body: text.replace(/\s+/g, ' ').trim(), hint: '' };
  return { kind: 'unknown', tone: 'err', title: 'Something went wrong', body: 'We could not finish that. Your information is safe.', hint: 'Try again. If it keeps happening, tell the school office.' };
}

export const friendly = classify;
export const isOffline = (e) => classify(e).kind === 'offline';

// For API routes: decides what text from a failed database call may be sent to the browser.
// Messages raised on purpose by our own database functions (SQLSTATE P0001) are written for people and pass through.
// Everything else (table names, constraint names, driver text) is logged on the server and replaced with a plain sentence.
export function publicDbMessage(error, fallback = 'That could not be saved. Please check your entries and try again.') {
  const code = String(error?.code ?? '');
  if (code === 'P0001' && error?.message) return String(error.message);
  console.error('database error', code, String(error?.message ?? ''));
  if (code === '23505') return 'That record already exists.';
  if (code === '23514') return 'One of the values is outside the allowed range.';
  if (code === '23503') return 'This record is linked to other records, so it cannot be changed.';
  if (code === '23502') return 'A required value is missing.';
  if (code === '42501') return 'You are not allowed to do that.';
  return fallback;
}
