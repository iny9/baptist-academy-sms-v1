// Offline guard: no picture may be written into a database table. Pictures go to storage; the table keeps only a link or a path.
// Flags: bytea columns in SQL, `data:image` literals, and browser code that turns a picture into a data URL (readAsDataURL / toDataURL) and then sends it to a table.
// Run: node tests/check_no_images_in_tables.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs';
const root = new URL('..', import.meta.url).pathname;
const walk = (d) => readdirSync(d).flatMap((n) => { const p = d + '/' + n; return ['node_modules', '.next', 'tests'].includes(n) ? [] : statSync(p).isDirectory() ? walk(p) : [p]; });
let bad = 0; const say = (f, m) => { bad++; console.log(`!! ${f.replace(root, '')}: ${m}`); };
for (const f of [...walk(root + 'app'), ...walk(root + 'components'), ...walk(root + 'lib'), ...walk(root + 'supabase'), ...walk(root + 'express-api')]) {
  if (!/\.(js|jsx|mjs|sql)$/.test(f) || /check_no_images/.test(f) || /008_speed_and_images/.test(f)) continue;
  const t = readFileSync(f, 'utf8');
  if (f.endsWith('.sql')) { if (/\bbytea\b/i.test(t.replace(/--.*$/gm, ''))) say(f, 'bytea column: store the picture in storage instead'); }
  else {
    if (/data:image\/[a-z+]+;base64/.test(t)) say(f, 'embeds a base64 picture');
    if (/readAsDataURL|toDataURL/.test(t) && /\.(insert|update|upsert)\(/.test(t) && !/storage\s*\.\s*from|\.upload\(/.test(t)) say(f, 'turns a picture into a data URL and writes it to a table without uploading to storage');
  }
}
console.log(bad ? `Images in tables: ${bad} problem(s).` : 'Images in tables: none. Every picture is stored as a file; tables keep only links.'); process.exit(bad ? 1 : 0);
