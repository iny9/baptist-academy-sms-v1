// Is this subject offered in this class? Same rule as the database function subject_offered().
// A subject with no class list is offered in every class of its sub-sections; with a list, only in those classes.
export const limitedTo = (subject) => (subject.subject_classes ?? []).map((k) => k.class_id);
export function offeredIn(subject, cls) {
  if (!cls || !subject.sub_sections.includes(cls.sub_section)) return false;
  const only = limitedTo(subject);
  return only.length === 0 || only.includes(cls.id);
}
