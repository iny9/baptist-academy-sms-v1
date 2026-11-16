-- Safe to run more than once.
--  1. A teacher can be the class teacher / form master of MORE THAN ONE class.
--  2. A class teacher sees (and downloads) the submitted CA forms of every subject teacher who teaches students in THEIR classes, and only those.
--  3. Row access stays enforced in the database (these functions are the only door; they check the caller's role and class).
--  4. Speed: indexes for the look-ups these changes add.
begin;

-- ======================= 1. one teacher, several classes =======================
do $$ declare r record; begin
  for r in select c.conrelid::regclass::text as t, c.conname from pg_constraint c
           where c.contype = 'u' and (
             (c.conrelid = 'class_teachers'::regclass and c.conkey = array[(select a.attnum from pg_attribute a where a.attrelid = 'class_teachers'::regclass and a.attname = 'teacher_id')])
          or (c.conrelid = 'classes'::regclass and c.conkey = array[(select a.attnum from pg_attribute a where a.attrelid = 'classes'::regclass and a.attname = 'class_teacher_id')]))
  loop execute format('alter table %s drop constraint %I', r.t, r.conname); end loop;
end $$;
create index if not exists class_teachers_teacher on class_teachers (teacher_id, class_id);
create index if not exists classes_class_teacher on classes (class_teacher_id);

create or replace function add_class_teacher(p_class uuid, p_teacher uuid) returns void language plpgsql security definer set search_path=public as $$
declare nxt smallint;
begin
  if not can_manage_class(p_class) then raise exception 'Only the admin or the exam officer of this section can assign class teachers.'; end if;
  if exists (select 1 from class_teachers where class_id = p_class and teacher_id = p_teacher) then raise exception 'That teacher is already on this class.'; end if;
  select coalesce(max(position), 0) + 1 into nxt from class_teachers where class_id = p_class;
  insert into class_teachers (class_id, teacher_id, position) values (p_class, p_teacher, nxt);
end $$;

-- ======================= 2. class teachers and the CA forms of their own classes =======================
create or replace function ca_forms(p_term uuid, p_class uuid default null)
returns table (submission_id uuid, term_id uuid, class_id uuid, class_name text, section school_section, subject_id uuid, subject_name text,
               submitted_by uuid, submitted_by_name text, submitted_as app_role, student_count int, submitted_at timestamptz, mine boolean)
language sql stable security definer set search_path = public as $$
  select s.id, s.term_id, s.class_id, c.name, c.section, s.subject_id, sub.name, s.submitted_by, coalesce(p.full_name, p.email), s.submitted_as,
         s.student_count, s.submitted_at, (s.submitted_by = auth.uid())
  from ca_submissions s join classes c on c.id = s.class_id join subjects sub on sub.id = s.subject_id left join profiles p on p.id = s.submitted_by
  where s.term_id = p_term and (p_class is null or s.class_id = p_class)
    and (can_manage_class(s.class_id)                       -- admin; exam officer of the section
         or leads_class(s.class_id)                         -- class teacher / form master of THIS class
         or (s.submitted_by = auth.uid() and (s.submitted_as is null or role_active(s.submitted_as))))   -- the person who filled it
  order by s.submitted_at desc limit 500 $$;

create or replace function ca_form_sheet(p_term uuid, p_class uuid, p_subject uuid)
returns table (student_id uuid, student_name text, admission_no text, ca1 numeric, ca2 numeric, exam numeric, total numeric, entered_by_name text)
language sql stable security definer set search_path = public as $$
  select st.id, st.last_name || ' ' || st.first_name, st.admission_no, x.ca1, x.ca2, x.exam, x.ca1 + x.ca2 + x.exam, coalesce(p.full_name, p.email)
  from scores x join students st on st.id = x.student_id left join profiles p on p.id = x.updated_by
  where x.term_id = p_term and x.class_id = p_class and x.subject_id = p_subject
    and (can_manage_class(p_class) or leads_class(p_class) or filled_sheet(p_term, p_class, p_subject))
  order by st.last_name, st.first_name $$;

-- ======================= 4. speed =======================
create index if not exists attendance_student_term on attendance (student_id, term_id);
create index if not exists term_exclusions_student_term on term_exclusions (student_id, term_id);
create index if not exists payment_sub_lines_submission on payment_submission_lines (submission_id);
create index if not exists student_fee_lines_student_status on student_fee_lines (student_id, status);
create index if not exists user_roles_user_role on user_roles (user_id, role);
analyze class_teachers; analyze classes; analyze ca_submissions;

do $$ declare f text; begin
  foreach f in array array['ca_forms(uuid,uuid)', 'ca_form_sheet(uuid,uuid,uuid)', 'add_class_teacher(uuid,uuid)']
  loop execute format('revoke execute on function %s from public, anon', f); execute format('grant execute on function %s to authenticated', f); end loop;
end $$;
notify pgrst, 'reload schema';
commit;
