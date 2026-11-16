// Small server-side guards shared by the API routes.
import { randomInt } from 'node:crypto';

// Browsers always send Origin on a cross-site POST. If it is there and not ours, refuse (CSRF defence in depth; cookies are also SameSite=Lax).
export function sameOrigin(request) {
  const o = request.headers.get('origin');
  if (!o) return true;
  try { return new URL(o).origin === new URL(request.url).origin; } catch { return false; }
}

// 12 characters, letters and digits (no look-alikes), always at least one of each.
export function randomPassword(len = 12) {
  const L = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ', D = '23456789', all = L + D;
  const pick = (s) => s[randomInt(s.length)];
  const chars = [pick(L), pick(D)];
  while (chars.length < len) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) { const j = randomInt(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join('');
}
export { randomInt };
