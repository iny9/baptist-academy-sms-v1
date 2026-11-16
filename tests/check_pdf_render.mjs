// Offline smoke test of every report-card PDF template (standard, black-and-white, Harvard; Basic and Secondary; Term 1 and 3).
// With pdf-lib installed it renders real PDFs and checks they are not empty. Without it, it runs against a tiny stand-in so that a typo or
// missing variable in lib/pdf.js still shows up.   Run: node tests/check_pdf_render.mjs
import { mkdtempSync, mkdirSync, cpSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let dir = root, stub = false;
if (!existsSync(join(root, 'node_modules', 'pdf-lib'))) {
  stub = true; dir = mkdtempSync(join(tmpdir(), 'pdfchk-'));
  cpSync(join(root, 'lib'), join(dir, 'lib'), { recursive: true });
  mkdirSync(join(dir, 'node_modules', 'pdf-lib'), { recursive: true });
  writeFileSync(join(dir, 'node_modules', 'pdf-lib', 'package.json'), '{"name":"pdf-lib","type":"module","main":"index.js"}');
  writeFileSync(join(dir, 'node_modules', 'pdf-lib', 'index.js'), `
    const calls = [];
    const page = () => { const p = { calls }; for (const m of ['drawText','drawRectangle','drawCircle','drawEllipse','drawLine','drawSvgPath','drawImage']) p[m] = (...a) => { calls.push([m, a]); }; return p; };
    const font = { widthOfTextAtSize: (s, z) => String(s).length * z * 0.5 };
    export const StandardFonts = { Helvetica: 'h', HelveticaBold: 'hb', TimesRomanBold: 'tb', TimesRoman: 't', TimesRomanItalic: 'ti' };
    export const rgb = (r, g, b) => ({ type: 'RGB', red: r, green: g, blue: b });
    export const grayscale = (g) => ({ type: 'Grayscale', gray: g });
    export const PDFDocument = { create: async () => ({ addPage: () => page(), embedFont: async () => font, embedPng: async () => ({}), embedJpg: async () => ({}), save: async () => new Uint8Array(calls.length + 1) }), _calls: calls };
  `);
}
const { newDoc, reportPage } = await import(pathToFileURL(join(dir, 'lib', 'pdf.js')).href);
const { sampleReport } = await import(pathToFileURL(join(dir, 'lib', 'samples.js')).href);
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('!! ' + m); } };
for (const section of ['secondary', 'basic']) for (const num of [1, 3]) for (const template of [undefined, 'harvard']) for (const bw of [true, false]) {
  const base = await newDoc(); const ctx = { ...base, logo: null, S: { school_name: 'Baptist Academy', address: 'Jimeta, Yola', motto: 'Strive for Excellence' } };
  const name = `${section} term ${num} ${template ?? 'standard'} ${bw ? 'b/w' : 'colour'}`;
  try { reportPage(ctx, { ...sampleReport(num, section), template, bw, head: { name: 'Mrs A. Bello', title: 'Principal' } }); const bytes = await base.doc.save(); ok(bytes.length > 0, name + ': empty'); }
  catch (e) { bad++; console.log(`!! ${name}: ${e.message}`); }
}
// many subjects must shrink rows, not crash
try { const base = await newDoc(); const d = sampleReport(1); d.rows = Array.from({ length: 30 }, (_, i) => ({ ...d.rows[i % d.rows.length], subject_id: 'x' + i })); reportPage({ ...base, logo: null, S: {} }, { ...d, template: 'harvard' }); } catch (e) { bad++; console.log('!! 30 subjects: ' + e.message); }
console.log(bad ? `PDF render: ${bad} problem(s).` : `PDF render: all templates draw${stub ? ' (stand-in pdf-lib; install packages for a real render)' : ''}.`); process.exit(bad ? 1 : 0);
