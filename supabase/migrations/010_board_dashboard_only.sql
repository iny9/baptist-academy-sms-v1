-- Safe to run more than once.
-- Board members open the DASHBOARD only (can_view_dashboard still admits them). Every other record reader no longer counts them.
begin;
create or replace function can_view_section(s school_section) returns boolean language sql stable security definer set search_path = public as
$$ select is_admin() or role_in_section(array['exam_officer','principal','headmaster']::app_role[], s) $$;
create or replace function can_see_subject_id(p_subject uuid) returns boolean language sql stable security definer set search_path = public as $$
  select is_admin() or role_active('bursar')
    or exists (select 1 from classes c where subject_offered(p_subject, c.id) and (
         role_in_section(array['exam_officer','principal','headmaster']::app_role[], c.section)
         or (role_active('class_teacher') and exists (select 1 from class_teachers t where t.class_id = c.id and t.teacher_id = auth.uid()))
         or (role_active('subject_teacher') and exists (select 1 from class_subject_teachers x where x.class_id = c.id and x.subject_id = p_subject and x.teacher_id = auth.uid()))
         or (role_active('parent') and exists (select 1 from students st join guardians g on g.student_id = st.id where st.class_id = c.id and g.parent_id = auth.uid())))) $$;
create or replace function guardian_directory() returns table (parent_id uuid, parent_name text, email text, phone text, child_name text, class_name text, section school_section, child_gender text)
language sql stable security definer set search_path=public as $$
  select p.id, p.full_name, p.email, p.phone, s.last_name||' '||s.first_name, c.name, c.section, s.gender
  from guardians g join profiles p on p.id=g.parent_id join students s on s.id=g.student_id join classes c on c.id=s.class_id
  where s.status='active' and is_admin() $$;
notify pgrst, 'reload schema';
commit;
