// ONE place for grade bands and merit points on the website. The database twin is grade_for() / merit_points() in
// supabase/migrations/005_grading_merit.sql; tests/check_grading.mjs fails if the two ever disagree.
// A 70+, B 60-69, C 50-59, D 45-49, E 40-44, F below 40.   Merit points: A=5, B=4, C=3, D=2, E=1, F=0.
export const GRADE_BANDS = [['A', 70, '70+'], ['B', 60, '60-69'], ['C', 50, '50-59'], ['D', 45, '45-49'], ['E', 40, '40-44'], ['F', 0, 'below 40']];
export const GRADE_POINTS = { A: 5, B: 4, C: 3, D: 2, E: 1, F: 0 };
export const GRADE_KEY = 'Grades: ' + GRADE_BANDS.map(([g, , r]) => `${g} ${r}`).join(', ') + '.';
export const GRADE_COLOR = { A: '#1F8A4C', B: '#2F95A3', C: '#E0A800', D: '#E07B1A', E: '#B8541A', F: '#D13B35' };

export function gradeOf(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 'F';
  for (const [g, lo] of GRADE_BANDS) if (n >= lo) return g;
  return 'F';
}
export const meritPoints = (v) => GRADE_POINTS[gradeOf(v)];
