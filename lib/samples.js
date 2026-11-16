// Fake data used to show "how a file looks" without touching real records.
const subjBasic = ['Mathematics', 'English Language', 'Basic Science', 'Social Studies', 'Civic Education', 'Computer Studies', 'Agricultural Science', 'Handwriting', 'Phonics', 'Christian Religious Studies', 'Verbal Reasoning', 'Creative Arts'];
const subj = ['Mathematics', 'English Language', 'Basic Science', 'Social Studies', 'Civic Education', 'Computer Studies', 'Agricultural Science', 'Business Studies', 'Christian Religious Studies', 'French', 'Yoruba', 'Home Economics'];
import { gradeOf as grade } from './grading.js';
export function sampleReport(num = 3, section = 'secondary') {
  const basic = section === 'basic';
  const rows = (basic ? subjBasic : subj).map((s, i) => { const ca1 = 8 + (i * 3) % 8, ca2 = 7 + (i * 5) % 9, exam = 30 + (i * 11) % 38, total = ca1 + ca2 + exam; return { subject_id: 's' + i, subject_name: s, ca1, ca2, exam, total, grade: grade(total) }; });
  return { term: { number: num, academic_years: { name: '2026/2027' }, starts_on: '2026-09-14', ends_on: '2026-12-18', next_term_begins: '2027-01-11' },
    student: { first_name: 'Adaeze', last_name: 'Okonkwo', other_names: 'Chidinma', gender: 'Female', age_years: basic ? 9 : 13, admission_no: 'BA/2026/014' }, cls: basic ? { name: 'Primary 4', section: 'basic' } : { name: 'JSS1', section: 'secondary' }, stamp: { sample: true, layout: { sign: { x: 0.52, y: 0.58, w: 0.5 }, date: { x: 0.5, y: 0.8, size: 0.09 } } },
    rows, first: { class_size: 42, class_position: 3, term_average: 61.4, cumulative_average: 63.2, terms_counted: 3, status: num === 3 ? 'Promoted' : null, remark: 'A good result, put more effort' },
    classAvg: Object.fromEntries(rows.map((r, i) => [r.subject_id, 48 + (i * 7) % 25])), trend: [{ n: 1, avg: 58.2 }, { n: 2, avg: 60.9 }, { n: 3, avg: 61.4 }].slice(0, num), dOpen: 60, att: 55,
    affective: ['Punctuality', 'Neatness', 'Politeness', 'Honesty', 'Relationship with others', 'Self-control', 'Attentiveness', 'Perseverance'].map((name, i) => ({ name, score: 3 + (i % 3) })),
    psychomotor: ['Handwriting', 'Fluency', 'Games', 'Sports', 'Handling of tools', 'Drawing and painting', 'Musical skills'].map((name, i) => ({ name, score: 2 + (i % 4) })) };
}
export const sampleSchedule = () => { const r = sampleReport(1); return { term: r.term, student: r.student, cls: r.cls, total: 178500, items: [
  { level: 0, title: 'Balance brought forward', amount_ngn: 10000, status: 'pending' }, { level: 1, title: 'Tuition', amount_ngn: 120000, status: 'confirmed' }, { level: 1, title: 'Development levy', amount_ngn: 10000, status: 'confirmed' },
  { level: 2, title: 'ICT and library', amount_ngn: 15000, status: 'claimed' }, { level: 2, title: 'Sports and house activities', amount_ngn: 8500, status: 'pending' }, { level: 3, title: 'Class excursion', amount_ngn: 10000, status: 'pending' }, { level: 3, title: 'Workbooks', amount_ngn: 5000, status: 'pending' }] }; };
export const sampleNewsletter = () => ({ title: 'Welcome to the First Term, 2026/2027', body: 'Dear parents and guardians,\n\nWe welcome every family back to a new session. This is where the body of the newsletter appears, exactly as the exam officer or admin pastes it.\n\nThank you for your continued support.', fields: { issue: 'Term 1, 2026', important_dates: 'Resumption: 14 September\nMid-term break: 26 October\nVacation: 18 December', contact: 'School office, Jimeta, Yola. Open Monday to Friday, 8am to 3pm.', signed_by: 'The Principal' } });
export const sampleDebtors = () => ({ scope: 'All sections, 2026/2027 session, Term 1', session: '2026/2027', generatedFor: 'Bursar',
  groups: [{ name: 'Bello Musa', className: 'JSS1', status: 'active', items: [{ title: 'Balance brought forward', amount: 10000, status: 'pending' }, { title: 'ICT and library', amount: 15000, status: 'pending' }] },
    { name: 'Danjuma Ruth', className: 'JSS1', status: 'active', items: [{ title: 'Tuition', amount: 120000, status: 'claimed' }] },
    { name: 'Eze Chinedu', className: 'Primary 4', status: 'transferred', items: [{ title: 'Class excursion', amount: 10000, status: 'pending' }] }] });
export const sampleCaForm = () => ({ term: sampleReport(1).term, className: 'JSS1', subject: 'Mathematics', students: ['Bello Musa', 'Danjuma Ruth', 'Eze Chinedu', 'Okonkwo Adaeze', 'Yakubu Aisha', 'Mshelia Peter', 'Okoro Ngozi', 'Ibrahim Zainab'] });

export const sampleBasicCa = () => ({ term: sampleReport(1).term, className: 'Primary 4', children: ['Bello Musa', 'Danjuma Ruth', 'Okonkwo Adaeze'].map((name) => ({ name, subjects: subjBasic.slice().sort() })) });
