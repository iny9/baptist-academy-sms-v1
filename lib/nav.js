// One place that decides which links each role sees (the database still enforces access).
export function navFor(names) {
  const has = (...r) => names.some((n) => r.includes(n));
  const isAdmin = has('admin'), mgr = has('admin', 'exam_officer');
  const g = [{ title: 'Overview', items: [{ href: '/admin', label: 'Home', icon: 'home' }] }];
  if (has('admin', 'board_member', 'principal', 'headmaster')) g[0].items.push({ href: '/admin/dashboard', label: 'Dashboard', icon: 'chart' });
  const school = [];
  if (mgr) school.push({ href: '/admin/academics', label: 'Sessions, classes, subjects', icon: 'layers' }, { href: '/admin/teaching', label: 'Teacher assignments', icon: 'users' }, { href: '/admin/subject-status', label: 'Subjects on or off', icon: 'layers' });
  if (has('admin', 'exam_officer', 'class_teacher')) school.push({ href: '/admin/students', label: 'Students', icon: 'cap' });
  if (mgr) school.push({ href: '/admin/term-activity', label: 'Term activity', icon: 'calendar' });
  if (isAdmin) school.push({ href: '/admin/locks', label: 'Lock results', icon: 'lock' });
  if (mgr) school.push({ href: '/admin/students/match', label: 'Match students to parents', icon: 'users' });
  if (mgr) school.push({ href: '/admin/rollover', label: 'Promotion and roll-over', icon: 'trending' });
  if (school.length) g.push({ title: 'School', items: school });
  const acad = [];
  if (has('admin', 'exam_officer', 'class_teacher', 'subject_teacher')) acad.push({ href: '/admin/assessment', label: 'Scores and records', icon: 'edit' });
  if (has('admin', 'exam_officer', 'class_teacher', 'principal', 'headmaster', 'parent')) acad.push({ href: '/admin/results', label: 'Results', icon: 'award' });
  if (mgr) acad.push({ href: '/admin/reports', label: 'Download report cards', icon: 'download' });
  if (has('admin', 'exam_officer', 'subject_teacher', 'class_teacher')) acad.push({ href: '/admin/ca-form', label: 'CA form', icon: 'clipboard' });
  if (has('admin', 'exam_officer', 'subject_teacher', 'class_teacher')) acad.push({ href: '/admin/ca-submissions', label: 'Filled CA forms', icon: 'clipboard' });
  if (has('class_teacher')) acad.push({ href: '/admin/attendance', label: 'Attendance register', icon: 'clipboard' });
  if (has('admin', 'exam_officer', 'principal', 'headmaster')) acad.push({ href: '/admin/attendance/calendar', label: 'Attendance calendar', icon: 'calendar' });
  if (has('admin', 'exam_officer', 'principal', 'headmaster')) acad.push({ href: '/admin/attendance/reports', label: 'Attendance reports', icon: 'chart' });
  if (has('parent')) acad.push({ href: '/admin/attendance/children', label: 'My child’s attendance', icon: 'clipboard' });
  if (has('parent')) acad.push({ href: '/admin/inbox', label: 'Inbox', icon: 'mail' });
  g.push({ title: 'Academics', items: acad });
  const comms = [];
  if (has('admin', 'exam_officer', 'class_teacher', 'parent', 'bursar', 'principal', 'headmaster')) comms.push({ href: '/admin/payments', label: 'Payment schedule', icon: 'wallet' });
  if (has('admin', 'bursar')) comms.push({ href: '/admin/bursar', label: 'Bursar dashboard', icon: 'coins' });
  if (has('admin', 'bursar')) comms.push({ href: '/admin/bursar/records', label: 'Student records', icon: 'clipboard' });
  if (has('admin', 'bursar', 'exam_officer', 'principal', 'headmaster', 'class_teacher')) comms.push({ href: '/admin/debtors', label: 'Outstanding fees', icon: 'clipboard' });
  if (mgr) comms.push({ href: '/admin/newsletters', label: 'Newsletters', icon: 'mail' });
  if (has('admin')) comms.push({ href: '/admin/messages', label: 'Message parents', icon: 'send' });
  if (comms.length) g.push({ title: 'Finance and messages', items: comms });
  const adm = [];
  if (isAdmin) adm.push({ href: '/admin/users', label: 'Users and roles', icon: 'users' }, { href: '/admin/site', label: 'Website content', icon: 'globe' }, { href: '/admin/audit', label: 'Audit log', icon: 'shield' }, { href: '/admin/stamp', label: 'School stamps', icon: 'award' }, { href: '/admin/templates', label: 'File templates', icon: 'file' }, { href: '/admin/archive', label: 'Archive old data', icon: 'archive' });
  if (has('headmaster', 'principal') && !isAdmin) adm.push({ href: '/admin/stamp', label: 'School stamp', icon: 'award' });
  adm.push({ href: '/admin/profile', label: 'My profile', icon: 'user' });
  g.push({ title: 'Account', items: adm });
  return g;
}
export const ROLE_LABEL = { admin: 'Administrator', exam_officer: 'Exam officer', class_teacher: 'Class teacher', subject_teacher: 'Subject teacher',
  principal: 'Principal', board_member: 'Board member', bursar: 'Bursar', headmaster: 'Headmaster/Headmistress', parent: 'Parent/Guardian' };
