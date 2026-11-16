// Offline test of grade bands and merit points, and proof that the website and the database agree.   Run: node tests/check_grading.mjs
import { readFileSync } from 'node:fs';
import { gradeOf, meritPoints, GRADE_KEY, GRADE_POINTS } from '../lib/grading.js';
let bad = 0;
const eq = (got, want, msg) => { if (JSON.stringify(got) !== JSON.stringify(want)) { bad++; console.log(`!! ${msg}\n   got  ${JSON.stringify(got)}\n   want ${JSON.stringify(want)}`); } };

// boundaries: A 70+, B 60-69, C 50-59, D 45-49, E 40-44, F below 40
const cases = [[100, 'A'], [70, 'A'], [69.99, 'B'], [60, 'B'], [59.99, 'C'], [50, 'C'], [49.99, 'D'], [45, 'D'], [44.99, 'E'], [40, 'E'], [39.99, 'F'], [0, 'F']];
for (const [v, g] of cases) eq(gradeOf(v), g, `gradeOf(${v})`);
eq(gradeOf(null), 'F', 'null counts as F'); eq(gradeOf('abc'), 'F', 'text counts as F');
eq([75, 65, 55, 47, 42, 10].map(meritPoints), [5, 4, 3, 2, 1, 0], 'merit points A=5 B=4 C=3 D=2 E=1 F=0');
eq(GRADE_POINTS, { A: 5, B: 4, C: 3, D: 2, E: 1, F: 0 }, 'point table');
eq(GRADE_KEY, 'Grades: A 70+, B 60-69, C 50-59, D 45-49, E 40-44, F below 40.', 'the key printed on report cards');

// the SQL in migration 005 must give the same grade for every score from 0 to 100 in steps of 0.01
const sql = readFileSync(new URL('../supabase/migrations/005_grading_merit.sql', import.meta.url), 'utf8');
const body = sql.match(/function grade_for[\s\S]*?\$\$;/)[0];
const steps = [...body.matchAll(/v>=(\d+) then '([A-F])'/g)].map((m) => [Number(m[1]), m[2]]);
eq(steps.length, 5, 'grade_for in SQL has five thresholds plus F');
const sqlGrade = (v) => (steps.find(([lo]) => v >= lo) ?? [0, 'F'])[1];
let mismatch = 0; for (let i = 0; i <= 10000; i++) { const v = i / 100; if (sqlGrade(v) !== gradeOf(v)) mismatch++; }
eq(mismatch, 0, 'website and database grade every score alike');
const pts = Object.fromEntries([...sql.match(/function grade_points[\s\S]*?\$\$;/)[0].matchAll(/when '([A-E])' then (\d)/g)].map((m) => [m[1], Number(m[2])]));
eq({ ...pts, F: 0 }, GRADE_POINTS, 'grade_points in SQL matches the website');

// no leftover old band anywhere in the source (D used to start at 40)
import { readdirSync, statSync } from 'node:fs';
const walk = (d) => readdirSync(d).flatMap((n) => { const p = d + '/' + n; return n === 'node_modules' || n === '.next' ? [] : statSync(p).isDirectory() ? walk(p) : [p]; });
const root = new URL('..', import.meta.url).pathname;
for (const file of walk(root + 'app').concat(walk(root + 'components'), walk(root + 'lib'))) {
  if (!/\.(js|jsx)$/.test(file) || file.endsWith('lib/grading.js')) continue;
  const txt = readFileSync(file, 'utf8');
  if (/D 40-49|'D' : 'F'|v >= 40 \? 'D'/.test(txt)) { bad++; console.log('!! old grade bands still in ' + file); }
}
console.log(bad ? `Grading: ${bad} problem(s).` : 'Grading: all checks pass.'); process.exit(bad ? 1 : 0);
