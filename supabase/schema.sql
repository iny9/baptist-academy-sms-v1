-- Baptist Academy SMS: full schema for a NEW, EMPTY Supabase project.
-- Run this once in the Supabase SQL editor, then apply the files in supabase/migrations in numeric order,
-- then run supabase/verify.sql. It should return no rows.

-- ======================================================================
-- schema.sql
-- ======================================================================
-- Baptist Academy SMS : schema (run in Supabase SQL editor)
create extension if not exists "pgcrypto";

create type app_role as enum (
  'admin','exam_officer','class_teacher','subject_teacher',
  'principal','board_member','headmaster','parent','bursar'
);
create type school_section as enum ('basic','secondary');

-- ---------- core identity ----------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text check (char_length(full_name) <= 120),
  phone text check (phone ~ '^[0-9+() -]{7,20}$'),
  avatar_url text,
  created_at timestamptz not null default now()
);

-- A user may hold many roles. Exam officers, teachers, principal, headmaster are tied to one section.
create table user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  role app_role not null,
  section school_section,
  created_at timestamptz not null default now(),
  unique nulls not distinct (user_id, role, section),
  check ((role in ('exam_officer','class_teacher','subject_teacher','principal','headmaster')) = (section is not null)),
  check (role <> 'principal' or section = 'secondary'),
  check (role <> 'headmaster' or section = 'basic')
);
create index on user_roles (user_id);

create table invites (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  roles jsonb not null,            -- [{"role":"parent","section":null}, ...]
  invited_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  consumed_at timestamptz
);
create unique index invites_pending_email on invites (email) where consumed_at is null;

-- ---------- public website content ----------
create table site_settings (
  key text primary key,
  value text not null default '',
  updated_at timestamptz not null default now()
);
create table board_members (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(full_name) between 2 and 120),
  portfolio text not null check (char_length(portfolio) <= 120),
  description text not null default '' check (char_length(description) <= 1000),
  photo_url text,
  sort_order int not null default 0
);
create table past_leaders (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(full_name) between 2 and 120),
  office text not null check (office in ('Principal','Headmaster','Headmistress','Administrator','Proprietor')),
  start_year int not null check (start_year between 1900 and 2100),
  end_year int check (end_year between 1900 and 2100),
  photo_url text,
  check (end_year is null or end_year >= start_year)
);

-- ---------- helpers ----------
create or replace function has_role(r app_role) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from user_roles where user_id = auth.uid() and role = r);
$$;

-- On signup: create profile, apply roles from the admin's invite.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare inv invites%rowtype; item jsonb;
begin
  insert into profiles (id, email, full_name)
  values (new.id, lower(new.email), new.raw_user_meta_data->>'full_name');
  select * into inv from invites where email = lower(new.email) and consumed_at is null;
  if found then
    for item in select * from jsonb_array_elements(inv.roles) loop
      insert into user_roles (user_id, role, section)
      values (new.id, (item->>'role')::app_role, nullif(item->>'section','')::school_section)
      on conflict do nothing;
    end loop;
    update invites set consumed_at = now() where id = inv.id;
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- ---------- Row Level Security ----------
alter table profiles enable row level security;
alter table user_roles enable row level security;
alter table invites enable row level security;
alter table site_settings enable row level security;
alter table board_members enable row level security;
alter table past_leaders enable row level security;

create policy "profiles self read" on profiles for select using (id = auth.uid() or has_role('admin'));
create policy "profiles self update" on profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy "profiles admin all" on profiles for all using (has_role('admin')) with check (has_role('admin'));

create policy "roles self read" on user_roles for select using (user_id = auth.uid() or has_role('admin'));
create policy "roles admin write" on user_roles for all using (has_role('admin')) with check (has_role('admin'));

create policy "invites admin" on invites for all using (has_role('admin')) with check (has_role('admin'));

-- public site content: anyone reads, only admin writes
create policy "settings read" on site_settings for select using (true);
create policy "settings admin" on site_settings for all using (has_role('admin')) with check (has_role('admin'));
create policy "board read" on board_members for select using (true);
create policy "board admin" on board_members for all using (has_role('admin')) with check (has_role('admin'));
create policy "leaders read" on past_leaders for select using (true);
create policy "leaders admin" on past_leaders for all using (has_role('admin')) with check (has_role('admin'));

-- ---------- storage ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-media','site-media', true, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
create policy "media read" on storage.objects for select using (bucket_id = 'site-media');
create policy "media admin write" on storage.objects for insert with check (bucket_id = 'site-media' and has_role('admin'));
create policy "media admin update" on storage.objects for update using (bucket_id = 'site-media' and has_role('admin'));
create policy "media admin delete" on storage.objects for delete using (bucket_id = 'site-media' and has_role('admin'));

-- ---------- seed ----------
insert into site_settings (key, value) values
 ('school_name','Baptist Academy Jimeta Yola'),
 ('motto','Strive for Excellence'),
 ('about','Baptist Academy Jimeta Yola is a Christian school with a Basic section (Nursery and Primary) and a Secondary section (Junior and Senior).'),
 ('history','Edit this text from Admin > Website to tell the story of the school.'),
 ('address','Jimeta, Yola, Adamawa State, Nigeria'),
 ('phone',''),('email',''),
 ('footer_text','Baptist Academy Jimeta Yola. All rights reserved.')
on conflict do nothing;

-- FIRST ADMIN: after signing up your own account, run:
-- insert into user_roles (user_id, role) select id,'admin' from profiles where email='YOU@example.com';

-- ======================================================================
-- ======================================================================
-- academic structure, staff assignment, students. Run AFTER schema.sql.
create type student_status as enum ('active','transferred','deceased','graduated');
create type sub_section_name as enum ('nursery','primary','junior','senior');

-- ---------- helpers ----------
create or replace function is_admin() returns boolean language sql stable security definer set search_path=public as
$$ select exists (select 1 from user_roles where user_id=auth.uid() and role='admin') $$;

create or replace function can_manage_section(s school_section) returns boolean language sql stable security definer set search_path=public as
$$ select is_admin() or exists (select 1 from user_roles where user_id=auth.uid() and role='exam_officer' and section=s) $$;

-- staff in a section holding a role (used for dropdowns; exam officers cannot read all profiles)
create or replace function staff_in_section(sec school_section, r app_role)
returns table (id uuid, full_name text, email text) language sql stable security definer set search_path=public as $$
  select p.id, p.full_name, p.email from profiles p join user_roles ur on ur.user_id=p.id
  where ur.role=r and ur.section=sec and can_manage_section(sec) order by p.full_name nulls last, p.email $$;

-- ---------- sessions and terms ----------
create table academic_years (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (name ~ '^[0-9]{4}/[0-9]{4}$'),
  target_average numeric(5,2) not null default 50 check (target_average between 0 and 100),
  created_at timestamptz not null default now()
);
create table terms (
  id uuid primary key default gen_random_uuid(),
  year_id uuid not null references academic_years(id) on delete cascade,
  number smallint not null check (number between 1 and 3),
  starts_on date not null,
  ends_on date not null,
  next_term_begins date,
  unique (year_id, number),
  check (ends_on > starts_on),
  check (next_term_begins is null or next_term_begins > ends_on)
);

-- ---------- classes and subjects ----------
create table classes (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 40),
  section school_section not null,
  sub_section sub_section_name not null,
  class_teacher_id uuid unique references profiles(id) on delete set null,  -- unique: one teacher leads one class
  unique (name, section),
  check ((section='basic' and sub_section in ('nursery','primary')) or (section='secondary' and sub_section in ('junior','senior')))
);
create table subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  section school_section not null,
  unique (name, section)
);
create table class_subject_teachers (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  teacher_id uuid not null references profiles(id) on delete restrict,
  unique (class_id, subject_id)
);

-- Integrity rules that plain constraints cannot express
create or replace function check_class_teacher() returns trigger language plpgsql as $$
begin
  if new.class_teacher_id is not null and not exists
    (select 1 from user_roles where user_id=new.class_teacher_id and section=new.section and role='class_teacher')
  then raise exception 'Teacher must hold the class teacher role in the % section', new.section; end if;
  return new;
end $$;
create trigger trg_class_teacher before insert or update on classes for each row execute function check_class_teacher();

create or replace function check_subject_assignment() returns trigger language plpgsql as $$
declare c school_section; s school_section;
begin
  select section into c from classes where id=new.class_id;
  select section into s from subjects where id=new.subject_id;
  if c <> s then raise exception 'Subject and class belong to different sections'; end if;
  if not exists (select 1 from user_roles where user_id=new.teacher_id and role='subject_teacher' and section=c)
  then raise exception 'Teacher is not a subject teacher in the % section (no teaching across sections)', c; end if;
  return new;
end $$;
create trigger trg_subject_assignment before insert or update on class_subject_teachers for each row execute function check_subject_assignment();

-- ---------- students and guardians ----------
create table students (
  id uuid primary key default gen_random_uuid(),
  admission_no text unique check (admission_no ~ '^[A-Za-z0-9/_-]{1,30}$'),
  first_name text not null check (char_length(first_name) between 1 and 60),
  last_name text not null check (char_length(last_name) between 1 and 60),
  other_names text check (char_length(other_names) <= 80),
  gender text not null check (gender in ('Male','Female')),
  dob date not null check (dob between date '1990-01-01' and current_date),
  photo_url text,
  class_id uuid not null references classes(id) on delete restrict,
  status student_status not null default 'active',
  status_note text,
  created_at timestamptz not null default now()
);
create index on students (class_id);
create table guardians (
  parent_id uuid not null references profiles(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  primary key (parent_id, student_id)
);

-- Age is always computed, never typed in
create view students_with_age with (security_invoker = true) as
  select s.*, date_part('year', age(current_date, s.dob))::int as age_years from students s;

-- ---------- RLS ----------
alter table academic_years enable row level security;  alter table terms enable row level security;
alter table classes enable row level security;         alter table subjects enable row level security;
alter table class_subject_teachers enable row level security;
alter table students enable row level security;        alter table guardians enable row level security;

create policy "years read staff" on academic_years for select using (auth.uid() is not null);
create policy "years admin" on academic_years for all using (is_admin()) with check (is_admin());
create policy "terms read staff" on terms for select using (auth.uid() is not null);
create policy "terms admin" on terms for all using (is_admin()) with check (is_admin());

create policy "classes read" on classes for select using (
  can_manage_section(section) or class_teacher_id = auth.uid()
  or exists (select 1 from class_subject_teachers x where x.class_id=classes.id and x.teacher_id=auth.uid())
  or exists (select 1 from students st join guardians g on g.student_id=st.id where st.class_id=classes.id and g.parent_id=auth.uid()));
create policy "classes manage" on classes for all using (can_manage_section(section)) with check (can_manage_section(section));

create policy "subjects read" on subjects for select using (auth.uid() is not null);
create policy "subjects manage" on subjects for all using (can_manage_section(section)) with check (can_manage_section(section));

create policy "assign read" on class_subject_teachers for select using (
  teacher_id = auth.uid() or exists (select 1 from classes c where c.id=class_id and (can_manage_section(c.section) or c.class_teacher_id=auth.uid())));
create policy "assign manage" on class_subject_teachers for all
  using (exists (select 1 from classes c where c.id=class_id and can_manage_section(c.section)))
  with check (exists (select 1 from classes c where c.id=class_id and can_manage_section(c.section)));

create policy "students read" on students for select using (
  exists (select 1 from classes c where c.id=class_id and (can_manage_section(c.section) or c.class_teacher_id=auth.uid()))
  or exists (select 1 from class_subject_teachers x where x.class_id=students.class_id and x.teacher_id=auth.uid())
  or exists (select 1 from guardians g where g.student_id=students.id and g.parent_id=auth.uid())
  or has_role('board_member') or has_role('principal') or has_role('headmaster'));
create policy "students manage" on students for all
  using (exists (select 1 from classes c where c.id=class_id and can_manage_section(c.section)))
  with check (exists (select 1 from classes c where c.id=class_id and can_manage_section(c.section)));
-- class/form teachers may edit or remove students in their own class only
create policy "students class teacher edit" on students for update
  using (exists (select 1 from classes c where c.id=class_id and c.class_teacher_id=auth.uid()))
  with check (exists (select 1 from classes c where c.id=class_id and c.class_teacher_id=auth.uid()));
create policy "students class teacher delete" on students for delete
  using (exists (select 1 from classes c where c.id=class_id and c.class_teacher_id=auth.uid()));

create policy "guardians read" on guardians for select using (parent_id = auth.uid() or is_admin()
  or exists (select 1 from students s join classes c on c.id=s.class_id where s.id=student_id and can_manage_section(c.section)));
create policy "guardians manage" on guardians for all
  using (exists (select 1 from students s join classes c on c.id=s.class_id where s.id=student_id and can_manage_section(c.section)))
  with check (exists (select 1 from students s join classes c on c.id=s.class_id where s.id=student_id and can_manage_section(c.section)));

-- ---------- seed standard classes (edit freely in the app) ----------
insert into classes (name, section, sub_section)
select n, s::school_section, ss::sub_section_name from (values
 ('Nursery 1','basic','nursery'),('Nursery 2','basic','nursery'),('Nursery 3','basic','nursery'),
 ('Primary 1','basic','primary'),('Primary 2','basic','primary'),('Primary 3','basic','primary'),('Primary 4','basic','primary'),('Primary 5','basic','primary'),
 ('JSS1','secondary','junior'),('JSS2','secondary','junior'),('JSS3','secondary','junior'),
 ('SSS1','secondary','senior'),('SSS2','secondary','senior'),('SSS3','secondary','senior')) v(n,s,ss)
on conflict do nothing;

-- Link a registered parent (by email) to a student. Parents can be linked to many students across sections.
create or replace function link_guardian(p_student uuid, p_email text) returns void
language plpgsql security definer set search_path=public as $$
declare sec school_section; pid uuid;
begin
  select c.section into sec from students s join classes c on c.id=s.class_id where s.id=p_student;
  if sec is null or not can_manage_section(sec) then raise exception 'Not allowed'; end if;
  select p.id into pid from profiles p join user_roles ur on ur.user_id=p.id
    where p.email=lower(trim(p_email)) and ur.role='parent';
  if pid is null then raise exception 'No registered parent or guardian with that email. Invite them first.'; end if;
  insert into guardians (parent_id, student_id) values (pid, p_student) on conflict do nothing;
end $$;

-- A class teacher can only change status/name, never move a student to another class (enforced here)
create or replace function lock_class_change() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.class_id <> old.class_id and not (
    exists (select 1 from classes c where c.id=old.class_id and can_manage_section(c.section)) and
    exists (select 1 from classes c where c.id=new.class_id and can_manage_section(c.section)))
  then raise exception 'Only the admin or an exam officer of that section can move a student between classes'; end if;
  return new;
end $$;
create trigger trg_lock_class before update on students for each row execute function lock_class_change();

-- ======================================================================
-- ======================================================================
-- assessment records, results engine.

create table school_days (               -- times school opened, same for every student in a section/term
  term_id uuid not null references terms(id) on delete cascade,
  section school_section not null,
  days_open smallint not null check (days_open between 0 and 130),
  primary key (term_id, section)
);
create table attendance (
  student_id uuid not null references students(id) on delete cascade,
  term_id uuid not null references terms(id) on delete cascade,
  days_present smallint not null check (days_present >= 0),
  primary key (student_id, term_id)
);
create table rating_traits (
  id uuid primary key default gen_random_uuid(),
  domain text not null check (domain in ('affective','psychomotor')),
  name text not null check (char_length(name) between 2 and 60),
  unique (domain, name)
);
create table ratings (
  student_id uuid not null references students(id) on delete cascade,
  term_id uuid not null references terms(id) on delete cascade,
  trait_id uuid not null references rating_traits(id) on delete cascade,
  score smallint not null check (score between 1 and 5),   -- 1 Poor, 2 Average, 3 Good, 4 Very good, 5 Excellent
  primary key (student_id, term_id, trait_id)
);
create table scores (
  student_id uuid not null references students(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  term_id uuid not null references terms(id) on delete cascade,   -- a term only exists inside a created session
  ca1 numeric(5,2) not null default 0 check (ca1 between 0 and 15),
  ca2 numeric(5,2) not null default 0 check (ca2 between 0 and 15),
  exam numeric(5,2) not null default 0 check (exam between 0 and 70),
  updated_by uuid references profiles(id),
  primary key (student_id, subject_id, term_id)
);

insert into rating_traits (domain, name) values
 ('affective','Punctuality'),('affective','Neatness'),('affective','Politeness'),('affective','Honesty'),
 ('affective','Relationship with others'),('affective','Self-control'),('affective','Attentiveness'),('affective','Perseverance'),
 ('psychomotor','Handwriting'),('psychomotor','Fluency'),('psychomotor','Games'),('psychomotor','Sports'),
 ('psychomotor','Handling of tools'),('psychomotor','Drawing and painting'),('psychomotor','Musical skills')
on conflict do nothing;

-- ---------- access helpers ----------
create or replace function student_section(p_student uuid) returns school_section language sql stable security definer set search_path=public as
$$ select c.section from students s join classes c on c.id=s.class_id where s.id=p_student $$;

create or replace function manages_student(p_student uuid) returns boolean language sql stable security definer set search_path=public as
$$ select can_manage_section(student_section(p_student)) $$;

create or replace function leads_student(p_student uuid) returns boolean language sql stable security definer set search_path=public as
$$ select exists (select 1 from students s join classes c on c.id=s.class_id where s.id=p_student and c.class_teacher_id=auth.uid()) $$;

create or replace function teaches_student(p_student uuid, p_subject uuid) returns boolean language sql stable security definer set search_path=public as
$$ select exists (select 1 from students s join class_subject_teachers x on x.class_id=s.class_id
   where s.id=p_student and x.subject_id=p_subject and x.teacher_id=auth.uid()) $$;

create or replace function parent_of(p_student uuid) returns boolean language sql stable security definer set search_path=public as
$$ select exists (select 1 from guardians where student_id=p_student and parent_id=auth.uid()) $$;

-- attendance cannot exceed days school opened
create or replace function check_attendance() returns trigger language plpgsql security definer set search_path=public as $$
declare d smallint;
begin
  select days_open into d from school_days where term_id=new.term_id and section=student_section(new.student_id);
  if d is null then raise exception 'Set the number of times school opened for this term first'; end if;
  if new.days_present > d then raise exception 'Days present (%) cannot exceed days school opened (%)', new.days_present, d; end if;
  return new;
end $$;
create trigger trg_attendance before insert or update on attendance for each row execute function check_attendance();

-- scores: only for active students
create or replace function check_score_student() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if not exists (select 1 from students where id=new.student_id and status='active') then raise exception 'Student is not active'; end if;
  new.updated_by := auth.uid();
  return new;
end $$;
create trigger trg_score_student before insert or update on scores for each row execute function check_score_student();

-- ---------- RLS ----------
alter table school_days enable row level security; alter table attendance enable row level security;
alter table rating_traits enable row level security; alter table ratings enable row level security; alter table scores enable row level security;

create policy "days read" on school_days for select using (auth.uid() is not null);
create policy "days manage" on school_days for all using (can_manage_section(section)) with check (can_manage_section(section));
create policy "traits read" on rating_traits for select using (auth.uid() is not null);
create policy "traits admin" on rating_traits for all using (is_admin()) with check (is_admin());

create policy "att read" on attendance for select using (manages_student(student_id) or leads_student(student_id) or parent_of(student_id));
create policy "att write class teacher" on attendance for all using (leads_student(student_id) or manages_student(student_id))
  with check (leads_student(student_id) or manages_student(student_id));

create policy "rating read" on ratings for select using (manages_student(student_id) or leads_student(student_id) or parent_of(student_id));
create policy "rating write" on ratings for all using (manages_student(student_id)) with check (manages_student(student_id));

create policy "score read" on scores for select using (manages_student(student_id) or leads_student(student_id)
  or teaches_student(student_id, subject_id) or parent_of(student_id));
create policy "score write" on scores for all using (manages_student(student_id) or teaches_student(student_id, subject_id))
  with check (manages_student(student_id) or teaches_student(student_id, subject_id));

-- ---------- grading ----------
create or replace function grade_for(v numeric) returns text language sql immutable as $$
  select case when v>=70 then 'A' when v>=60 then 'B' when v>=50 then 'C' when v>=40 then 'D' else 'F' end $$;
create or replace function remark_for(v numeric) returns text language sql immutable as $$
  select case when v>=90 then 'An excellent performance, keep it up.'
              when v>=70 then 'A very good result'
              when v>=50 then 'A good result, put more effort'
              when v>=40 then 'Below average performance'
              else 'Please sit up and work harder and smarter.' end $$;

-- ---------- results engine (security invoker: RLS decides who sees what) ----------
create or replace function term_results(p_term uuid, p_class uuid)
returns table (student_id uuid, subject_id uuid, subject_name text, ca1 numeric, ca2 numeric, exam numeric, total numeric,
               grade text, term_average numeric, cumulative_average numeric, class_position int, class_size int,
               status text, remark text, term_number smallint)
language sql stable security invoker as $$
with t as (select tt.id, tt.number, tt.year_id, y.target_average from terms tt join academic_years y on y.id=tt.year_id where tt.id=p_term),
roster as (select s.id from students s where s.class_id=p_class and s.status='active'),
sc as (select x.student_id, x.subject_id, sub.name subject_name, x.ca1, x.ca2, x.exam, (x.ca1+x.ca2+x.exam) total
       from scores x join subjects sub on sub.id=x.subject_id
       where x.term_id=p_term and x.student_id in (select id from roster)),
ta as (select student_id, round(avg(total),2) a from sc group by student_id),
per_term as (select x.student_id, x.term_id, avg(x.ca1+x.ca2+x.exam) a from scores x join terms tt on tt.id=x.term_id
       where tt.year_id=(select year_id from t) and x.student_id in (select id from roster) group by 1,2),
cum as (select student_id, round(avg(a),2) c from per_term group by 1),
ranked as (select ta.student_id, ta.a,
       case when (select number from t)=3 then cum.c end as c,
       rank() over (order by case when (select number from t)=3 then cum.c else ta.a end desc) pos
       from ta left join cum using (student_id))
select sc.student_id, sc.subject_id, sc.subject_name, sc.ca1, sc.ca2, sc.exam, sc.total, grade_for(sc.total),
       r.a, r.c, r.pos::int, (select count(*) from roster)::int,
       case when (select number from t)=3 then case when r.c >= (select target_average from t) then 'Promoted' else 'Repeat' end end,
       remark_for(case when (select number from t)=3 then r.c else r.a end),
       (select number from t)
from sc join ranked r using (student_id)
order by sc.subject_name $$;

-- ======================================================================
-- ======================================================================
-- roll-over, dashboards, payments, newsletters.

-- ---------- section-scoped viewing (fixes principal/headmaster saw all sections) ----------
create or replace function can_view_section(s school_section) returns boolean language sql stable security definer set search_path=public as
$$ select is_admin() or has_role('board_member') or exists (select 1 from user_roles
     where user_id=auth.uid() and section=s and role in ('exam_officer','principal','headmaster')) $$;

drop policy "students read" on students;
create policy "students read" on students for select using (
  exists (select 1 from classes c where c.id=class_id and (can_view_section(c.section) or c.class_teacher_id=auth.uid()))
  or exists (select 1 from class_subject_teachers x where x.class_id=students.class_id and x.teacher_id=auth.uid())
  or exists (select 1 from guardians g where g.student_id=students.id and g.parent_id=auth.uid()));
create or replace function manages_student(p_student uuid) returns boolean language sql stable security definer set search_path=public as
$$ select can_manage_section(student_section(p_student)) $$;
create policy "score view heads" on scores for select using (can_view_section(student_section(student_id)));

-- ---------- class progression and frozen history ----------
alter table classes add column next_class_id uuid references classes(id) on delete set null;
alter table classes add column is_terminal boolean not null default false;   -- Primary 5, JSS3, SSS3: shown as "Graduated"
do $$ declare pairs text[][] := array[['Nursery 1','Nursery 2'],['Nursery 2','Nursery 3'],['Nursery 3','Primary 1'],['Primary 1','Primary 2'],
  ['Primary 2','Primary 3'],['Primary 3','Primary 4'],['Primary 4','Primary 5'],['Primary 5','JSS1'],['JSS1','JSS2'],['JSS2','JSS3'],
  ['JSS3','SSS1'],['SSS1','SSS2'],['SSS2','SSS3']]; p text[];
begin foreach p slice 1 in array pairs loop
  update classes c set next_class_id=(select id from classes where name=p[2]) where c.name=p[1]; end loop;
  update classes set is_terminal=true where name in ('Primary 5','JSS3','SSS3'); end $$;

alter table scores add column class_id uuid references classes(id);
update scores x set class_id=(select class_id from students s where s.id=x.student_id);
create or replace function check_score_student() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if not exists (select 1 from students where id=new.student_id and status='active') then raise exception 'Student is not active'; end if;
  new.updated_by := auth.uid();
  if tg_op='INSERT' or new.class_id is null then new.class_id := (select class_id from students where id=new.student_id); end if;
  return new;
end $$;

create or replace function lock_class_change() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if current_setting('app.rollover', true) = '1' then return new; end if;
  if new.class_id <> old.class_id and not (
    exists (select 1 from classes c where c.id=old.class_id and can_manage_section(c.section)) and
    exists (select 1 from classes c where c.id=new.class_id and can_manage_section(c.section)))
  then raise exception 'Only the admin or an exam officer of that section can move a student between classes'; end if;
  return new;
end $$;

-- Move the ticked students up one class. SSS3 students (no next class) become Graduated and leave the active roll.
create or replace function promote_students(p_ids uuid[]) returns int language plpgsql security definer set search_path=public as $$
declare sid uuid; cls classes; n int := 0;
begin
  perform set_config('app.rollover','1',true);
  foreach sid in array p_ids loop
    select c.* into cls from students s join classes c on c.id=s.class_id where s.id=sid and s.status='active';
    if cls.id is null or not can_manage_section(cls.section) then continue; end if;
    if cls.next_class_id is null then update students set status='graduated' where id=sid;
    else update students set class_id=cls.next_class_id where id=sid; end if;
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------- results engine v2: frozen class membership, "Graduated" for terminal classes ----------
create or replace function term_results(p_term uuid, p_class uuid)
returns table (student_id uuid, subject_id uuid, subject_name text, ca1 numeric, ca2 numeric, exam numeric, total numeric,
               grade text, term_average numeric, cumulative_average numeric, class_position int, class_size int,
               status text, remark text, term_number smallint)
language sql stable security invoker as $$
with t as (select tt.id, tt.number, tt.year_id, y.target_average from terms tt join academic_years y on y.id=tt.year_id where tt.id=p_term),
yr as (select x.student_id from scores x join terms tt on tt.id=x.term_id where tt.year_id=(select year_id from t) and x.class_id=p_class group by 1),
roster as (
  select s.id from students s where s.status='active' and (s.id in (select student_id from yr)
     or (s.class_id=p_class and s.id not in (select x.student_id from scores x join terms tt on tt.id=x.term_id where tt.year_id=(select year_id from t))))),
sc as (select x.student_id, x.subject_id, sub.name subject_name, x.ca1, x.ca2, x.exam, (x.ca1+x.ca2+x.exam) total
       from scores x join subjects sub on sub.id=x.subject_id
       where x.term_id=p_term and x.class_id=p_class and x.student_id in (select id from roster)),
ta as (select student_id, round(avg(total),2) a from sc group by student_id),
per_term as (select x.student_id, x.term_id, avg(x.ca1+x.ca2+x.exam) a from scores x join terms tt on tt.id=x.term_id
       where tt.year_id=(select year_id from t) and x.class_id=p_class and x.student_id in (select id from roster) group by 1,2),
cum as (select student_id, round(avg(a),2) c from per_term group by 1),
ranked as (select ta.student_id, ta.a, case when (select number from t)=3 then cum.c end as c,
       rank() over (order by case when (select number from t)=3 then cum.c else ta.a end desc) pos from ta left join cum using (student_id))
select sc.student_id, sc.subject_id, sc.subject_name, sc.ca1, sc.ca2, sc.exam, sc.total, grade_for(sc.total),
       r.a, r.c, r.pos::int, (select count(*) from roster)::int,
       case when (select number from t)=3 then
         case when r.c >= (select target_average from t)
              then case when (select is_terminal from classes where id=p_class) then 'Graduated' else 'Promoted' end
              else 'Repeat' end end,
       remark_for(case when (select number from t)=3 then r.c else r.a end), (select number from t)
from sc join ranked r using (student_id) order by sc.subject_name $$;

-- ---------- dashboard data ----------
create or replace function dashboard_rows(p_term uuid)
returns table (student_id uuid, student_name text, gender text, photo_url text, class_name text, section school_section,
               sub_section sub_section_name, subject_name text, total numeric)
language sql stable security definer set search_path=public as $$
  select s.id, s.last_name||' '||s.first_name, s.gender, s.photo_url, c.name, c.section, c.sub_section, sub.name, (x.ca1+x.ca2+x.exam)
  from scores x join students s on s.id=x.student_id join classes c on c.id=x.class_id join subjects sub on sub.id=x.subject_id
  where x.term_id=p_term and s.status='active' and can_view_section(c.section) $$;

-- ---------- payment schedule ----------
create table fee_items (
  id uuid primary key default gen_random_uuid(),
  term_id uuid not null references terms(id) on delete cascade,
  level smallint not null check (level between 1 and 3),   -- 1 school term fee, 2 section levy, 3 class levy
  section school_section not null,
  class_id uuid references classes(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 100),
  amount_ngn numeric(12,2) not null check (amount_ngn > 0),
  created_by uuid default auth.uid() references profiles(id),
  check ((level = 3) = (class_id is not null))
);
create or replace function check_fee_item() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.class_id is not null and (select section from classes where id=new.class_id) <> new.section
  then raise exception 'Class does not belong to that section'; end if;
  return new;
end $$;
create trigger trg_fee_item before insert or update on fee_items for each row execute function check_fee_item();
create or replace function parent_sees_fee(p_section school_section, p_class uuid, p_level smallint) returns boolean
language sql stable security definer set search_path=public as $$
  select exists (select 1 from guardians g join students s on s.id=g.student_id join classes c on c.id=s.class_id
    where g.parent_id=auth.uid() and c.section=p_section and (p_level < 3 or s.class_id = p_class)) $$;
create or replace function leads_class(p_class uuid) returns boolean language sql stable security definer set search_path=public as
$$ select exists (select 1 from classes where id=p_class and class_teacher_id=auth.uid()) $$;

alter table fee_items enable row level security;
create policy "fees read" on fee_items for select using (can_view_section(section) or parent_sees_fee(section, class_id, level)
  or (class_id is not null and leads_class(class_id))
  or exists (select 1 from classes c where c.section=fee_items.section and c.class_teacher_id=auth.uid() and level < 3));
create policy "fees write" on fee_items for all
  using (can_manage_section(section) or (level = 3 and leads_class(class_id)))
  with check ((level < 3 and can_manage_section(section)) or (level = 3 and (can_manage_section(section) or leads_class(class_id))));

-- ---------- newsletters ----------
create table newsletters (
  id uuid primary key default gen_random_uuid(),
  section school_section,                        -- null = whole school (admin only)
  title text not null check (char_length(title) between 3 and 150),
  body text not null check (char_length(body) between 1 and 20000),
  fields jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid() references profiles(id),
  created_at timestamptz not null default now()
);
alter table newsletters enable row level security;
create policy "news read" on newsletters for select using (auth.uid() is not null);
create policy "news write" on newsletters for all
  using ((section is null and is_admin()) or (section is not null and can_manage_section(section)))
  with check ((section is null and is_admin()) or (section is not null and can_manage_section(section)));

-- ======================================================================
-- ======================================================================
-- hardening fixes from the security review, avatars, guardian directory.

-- (S2) Users may change only name, phone and avatar on their own profile; never email.
create or replace function protect_profile() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if is_admin() then return new; end if;
  if new.email <> old.email or new.id <> old.id then raise exception 'Email cannot be changed here'; end if;
  return new;
end $$;
create trigger trg_protect_profile before update on profiles for each row execute function protect_profile();

-- (S3) Class teachers may change only names and status of students in their class.
create or replace function protect_student_fields() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if current_setting('app.rollover', true) = '1' or manages_student(old.id) then return new; end if;
  if new.admission_no is distinct from old.admission_no or new.gender <> old.gender or new.dob <> old.dob
     or new.photo_url is distinct from old.photo_url or new.class_id <> old.class_id
  then raise exception 'Class teachers may only edit names and status'; end if;
  return new;
end $$;
create trigger trg_protect_student before update on students for each row execute function protect_student_fields();

-- Avatars: each user writes only inside their own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars','avatars', true, 1048576, array['image/jpeg','image/png','image/webp']) on conflict (id) do nothing;
create policy "avatar read" on storage.objects for select using (bucket_id='avatars');
create policy "avatar insert own" on storage.objects for insert with check (bucket_id='avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatar update own" on storage.objects for update using (bucket_id='avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatar delete own" on storage.objects for delete using (bucket_id='avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Guardian directory for admin and board members (filter by name, class, section, child's gender in the app).
create or replace function guardian_directory()
returns table (parent_id uuid, parent_name text, email text, phone text, child_name text, class_name text, section school_section, child_gender text)
language sql stable security definer set search_path=public as $$
  select p.id, p.full_name, p.email, p.phone, s.last_name||' '||s.first_name, c.name, c.section, s.gender
  from guardians g join profiles p on p.id=g.parent_id join students s on s.id=g.student_id join classes c on c.id=s.class_id
  where s.status='active' and (is_admin() or has_role('board_member')) $$;

-- ======================================================================
-- ======================================================================
-- audit log, student photo storage.

-- ---------- append-only audit log (admin can read; nobody can edit or delete rows) ----------
create table audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid,                       -- auth.uid(); null for system or service-role actions
  actor_email text,
  action text not null,             -- INSERT / UPDATE / DELETE
  table_name text not null,
  record_key text,
  old_row jsonb,
  new_row jsonb
);
create index on audit_log (at desc);
create index on audit_log (table_name, at desc);
alter table audit_log enable row level security;
create policy "audit admin read" on audit_log for select using (is_admin());
revoke insert, update, delete, truncate on audit_log from anon, authenticated;

create or replace function audit_row() returns trigger language plpgsql security definer set search_path=public as $$
declare o jsonb := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end;
        n jsonb := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end;
        r jsonb := coalesce(n, o); k text;
begin
  k := coalesce(r->>'id', concat_ws('/', r->>'student_id', r->>'subject_id', r->>'term_id', r->>'trait_id', r->>'class_id', r->>'user_id', r->>'role', r->>'section'));
  if tg_op = 'UPDATE' and o = n then return new; end if;
  insert into audit_log (actor, actor_email, action, table_name, record_key, old_row, new_row)
  values (auth.uid(), (select email from profiles where id = auth.uid()), tg_op, tg_table_name, k, o, n);
  return coalesce(new, old);
end $$;

create or replace function audit_immutable() returns trigger language plpgsql as $$
begin raise exception 'The audit log cannot be changed'; end $$;
create trigger audit_no_update before update or delete on audit_log for each row execute function audit_immutable();

do $$ declare t text; begin
  foreach t in array array['scores','students','attendance','ratings','user_roles','fee_items','academic_years','terms','classes',
                           'subjects','class_subject_teachers','school_days','guardians','newsletters','invites'] loop
    execute format('create trigger audit_%1$s after insert or update or delete on %1$I for each row execute function audit_row()', t);
  end loop; end $$;

-- ---------- student photos ----------
-- Public read of unguessable paths; only the server (service role) writes. Students' photos are personal data of minors:
-- see docs/SECURITY_REVIEW.md for the signed-URL upgrade path.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('student-photos','student-photos', true, 3145728, array['image/jpeg','image/png','image/webp']) on conflict (id) do nothing;
create policy "student photo read" on storage.objects for select using (bucket_id='student-photos');

-- ======================================================================
-- fix rls
-- ======================================================================
-- FIX: infinite recursion between row-level-security policies. (safe to run on top of an existing setup).
-- Problem: the policies on classes, students, class_subject_teachers and guardians each queried the other tables directly,
-- so Postgres refused to evaluate them ("infinite recursion detected in policy"). The pages then received an error
-- and showed empty lists. Fix: do those lookups inside SECURITY DEFINER helper functions, which do not re-trigger the policies.

create or replace function class_section(p uuid) returns school_section language sql stable security definer set search_path=public as
$$ select section from classes where id = p $$;
create or replace function can_manage_class(p uuid) returns boolean language sql stable security definer set search_path=public as
$$ select can_manage_section(class_section(p)) $$;
create or replace function can_view_class(p uuid) returns boolean language sql stable security definer set search_path=public as
$$ select can_view_section(class_section(p)) $$;
create or replace function teaches_class(p uuid) returns boolean language sql stable security definer set search_path=public as
$$ select exists (select 1 from class_subject_teachers where class_id = p and teacher_id = auth.uid()) $$;
create or replace function parent_of_class(p uuid) returns boolean language sql stable security definer set search_path=public as
$$ select exists (select 1 from students s join guardians g on g.student_id = s.id where s.class_id = p and g.parent_id = auth.uid()) $$;

-- classes
drop policy if exists "classes read" on classes;
create policy "classes read" on classes for select using (
  can_view_section(section) or class_teacher_id = auth.uid() or teaches_class(id) or parent_of_class(id));

-- class_subject_teachers
drop policy if exists "assign read" on class_subject_teachers;
drop policy if exists "assign manage" on class_subject_teachers;
create policy "assign read" on class_subject_teachers for select using (teacher_id = auth.uid() or can_view_class(class_id) or leads_class(class_id));
create policy "assign manage" on class_subject_teachers for all using (can_manage_class(class_id)) with check (can_manage_class(class_id));

-- students
drop policy if exists "students read" on students;
drop policy if exists "students manage" on students;
drop policy if exists "students class teacher edit" on students;
drop policy if exists "students class teacher delete" on students;
create policy "students read" on students for select using (can_view_class(class_id) or leads_class(class_id) or teaches_class(class_id) or parent_of(id));
create policy "students manage" on students for all using (can_manage_class(class_id)) with check (can_manage_class(class_id));
create policy "students class teacher edit" on students for update using (leads_class(class_id)) with check (leads_class(class_id));
create policy "students class teacher delete" on students for delete using (leads_class(class_id));

-- guardians
drop policy if exists "guardians read" on guardians;
drop policy if exists "guardians manage" on guardians;
create policy "guardians read" on guardians for select using (parent_id = auth.uid() or is_admin() or manages_student(student_id));
create policy "guardians manage" on guardians for all using (manages_student(student_id)) with check (manages_student(student_id));

-- ======================================================================
-- subjects multi section
-- ======================================================================
-- a subject is created once and offered in one or more sub-sections (Nursery, Primary, Junior, Senior).
-- Safe on an existing database: it merges same-named subjects and keeps all scores and assignments.

begin;

-- 1. New column, filled from the old single section
alter table subjects add column sub_sections sub_section_name[] not null default '{}';
update subjects set sub_sections = case section when 'basic' then array['nursery','primary']::sub_section_name[]
                                                 else array['junior','senior']::sub_section_name[] end;

-- 2. Merge subjects that exist twice under the same name (e.g. Mathematics in Basic and in Secondary)
alter table scores disable trigger user;
alter table class_subject_teachers disable trigger user;
do $$ declare r record; keep uuid; begin
  for r in select name from subjects group by name having count(*) > 1 loop
    select id into keep from subjects where name = r.name order by id limit 1;
    update subjects set sub_sections = (select array_agg(distinct u order by u) from subjects s, unnest(s.sub_sections) u where s.name = r.name) where id = keep;
    update class_subject_teachers set subject_id = keep where subject_id in (select id from subjects where name = r.name and id <> keep);
    update scores set subject_id = keep where subject_id in (select id from subjects where name = r.name and id <> keep);
    delete from subjects where name = r.name and id <> keep;
  end loop;
end $$;
alter table scores enable trigger user;
alter table class_subject_teachers enable trigger user;

-- 3. Drop the old single-section column and its rules
drop policy if exists "subjects manage" on subjects;
alter table subjects drop constraint if exists subjects_name_section_key;
alter table subjects drop column section;
alter table subjects add constraint subjects_name_key unique (name);
alter table subjects add constraint subjects_has_sub_sections check (cardinality(sub_sections) > 0);

-- 4. Helpers
create or replace function section_of_sub(s sub_section_name) returns school_section language sql immutable as
$$ select case when s in ('nursery','primary') then 'basic'::school_section else 'secondary'::school_section end $$;

-- Admin: any subject. Exam officer: only subjects whose sub-sections all lie inside their own section.
create or replace function can_manage_subject(subs sub_section_name[]) returns boolean language sql stable security definer set search_path=public as $$
  select is_admin() or (cardinality(subs) > 0 and exists (
    select 1 from user_roles ur where ur.user_id = auth.uid() and ur.role = 'exam_officer'
      and not exists (select 1 from unnest(subs) u where section_of_sub(u) <> ur.section))) $$;

create policy "subjects manage" on subjects for all using (can_manage_subject(sub_sections)) with check (can_manage_subject(sub_sections));

-- 5. Integrity: a subject can only be given to a class whose sub-section offers it; teacher must belong to that class's section
create or replace function check_subject_assignment() returns trigger language plpgsql security definer set search_path=public as $$
declare cs sub_section_name; csec school_section; subs sub_section_name[];
begin
  select sub_section, section into cs, csec from classes where id = new.class_id;
  select sub_sections into subs from subjects where id = new.subject_id;
  if not (cs = any(subs)) then raise exception 'This subject is not offered in % classes. Add that sub-section to the subject first.', cs; end if;
  if not exists (select 1 from user_roles where user_id = new.teacher_id and role = 'subject_teacher' and section = csec)
  then raise exception 'Teacher is not a subject teacher in the % section (no teaching across sections)', csec; end if;
  return new;
end $$;

-- Cannot remove a sub-section from a subject while a class in it still has that subject assigned
create or replace function check_subject_update() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if exists (select 1 from class_subject_teachers x join classes c on c.id = x.class_id
             where x.subject_id = new.id and not (c.sub_section = any(new.sub_sections))) then
    raise exception 'A class in a sub-section you are removing still has this subject assigned. Remove that assignment first.';
  end if;
  return new;
end $$;
create trigger trg_subject_update before update of sub_sections on subjects for each row execute function check_subject_update();

commit;

-- ======================================================================
-- b finance storage
-- ======================================================================
-- part B: finance workflow, student fields, links-only files, retention, index and JSON hygiene.
--

-- ===================== 1. Students: new/continuing, brought-forward debt, photo is a link only =====================
alter table students add column if not exists student_type text not null default 'continuing' check (student_type in ('new','continuing'));
alter table students add column if not exists debt_forward_ngn numeric(12,2) not null default 0 check (debt_forward_ngn >= 0);
alter table students add constraint students_photo_is_link check (photo_url is null or (photo_url ~ '^https://' and char_length(photo_url) <= 500));
alter table profiles add constraint profiles_avatar_is_link check (avatar_url is null or (avatar_url ~ '^https://' and char_length(avatar_url) <= 500));
alter table board_members add constraint board_photo_is_link check (photo_url is null or (photo_url ~ '^https://' and char_length(photo_url) <= 500));
alter table past_leaders add constraint leaders_photo_is_link check (photo_url is null or (photo_url ~ '^https://' and char_length(photo_url) <= 500));
alter table board_members add column if not exists tenure text check (char_length(tenure) <= 40);
alter table past_leaders add column if not exists note text check (char_length(note) <= 200);
alter table site_settings add constraint site_settings_value_len check (char_length(value) <= 10000);

-- Class teachers still may not change identity or money fields
create or replace function protect_student_fields() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if current_setting('app.rollover', true) = '1' or manages_student(old.id) then return new; end if;
  if new.admission_no is distinct from old.admission_no or new.gender <> old.gender or new.dob <> old.dob
     or new.photo_url is distinct from old.photo_url or new.class_id <> old.class_id
     or new.student_type <> old.student_type or new.debt_forward_ngn <> old.debt_forward_ngn
  then raise exception 'Class teachers may only edit names and status'; end if;
  return new;
end $$;

-- ===================== 2. Home page carousel (image links only) =====================
create table hero_slides (
  id uuid primary key default gen_random_uuid(),
  image_url text not null check (image_url ~ '^https://' and char_length(image_url) <= 500),
  title text check (char_length(title) <= 120),
  subtitle text check (char_length(subtitle) <= 300),
  sort_order int not null default 0
);
alter table hero_slides enable row level security;
create policy "slides read" on hero_slides for select using (true);
create policy "slides admin" on hero_slides for all using (is_admin()) with check (is_admin());
create trigger audit_hero_slides after insert or update or delete on hero_slides for each row execute function audit_row();

-- ===================== 3. Fee schedule permissions =====================
create or replace function can_view_fees(s school_section) returns boolean language sql stable security definer set search_path=public as
$$ select is_admin() or has_role('bursar') or exists (select 1 from user_roles where user_id=auth.uid() and section=s and role in ('exam_officer','principal','headmaster')) $$;
create or replace function leads_in_section(s school_section) returns boolean language sql stable security definer set search_path=public as
$$ select exists (select 1 from classes where section=s and class_teacher_id=auth.uid()) $$;
-- Level 1: bursar only. Level 2: principal (secondary) or headmaster (basic) of that section only. Level 3: that class's teacher only.
create or replace function fee_writer(lv smallint, sec school_section, cls uuid) returns boolean language sql stable security definer set search_path=public as $$
  select case lv
    when 1 then has_role('bursar')
    when 2 then exists (select 1 from user_roles where user_id=auth.uid() and section=sec and role in ('principal','headmaster'))
    when 3 then leads_class(cls)
    else false end $$;

drop policy if exists "fees read" on fee_items;
drop policy if exists "fees write" on fee_items;
create policy "fees read" on fee_items for select using (
  can_view_fees(section) or parent_sees_fee(section, class_id, level) or leads_in_section(section) or (class_id is not null and leads_class(class_id)));
create policy "fees write" on fee_items for all using (fee_writer(level, section, class_id)) with check (fee_writer(level, section, class_id));

-- ===================== 4. Per-student fee lines: issued, claimed paid, confirmed by the bursar =====================
create table student_fee_lines (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  term_id uuid not null references terms(id) on delete cascade,
  fee_item_id uuid references fee_items(id) on delete set null,
  kind text not null check (kind in ('fee','brought_forward')),
  level smallint check (level between 1 and 3),
  title text not null check (char_length(title) between 2 and 100),
  amount_ngn numeric(12,2) not null check (amount_ngn > 0),
  status text not null default 'pending' check (status in ('pending','claimed','confirmed')),
  claimed_at timestamptz, claimed_by uuid references profiles(id), claim_reference text check (char_length(claim_reference) <= 80),
  confirmed_at timestamptz, confirmed_by uuid references profiles(id), review_note text check (char_length(review_note) <= 200),
  created_at timestamptz not null default now(),
  check ((kind = 'fee') = (level is not null))
);
create unique index sfl_fee_unique on student_fee_lines (student_id, term_id, fee_item_id) where fee_item_id is not null;
create unique index sfl_bf_unique on student_fee_lines (student_id) where kind = 'brought_forward';
create index sfl_term_status on student_fee_lines (term_id, status);
alter table student_fee_lines enable row level security;
-- Reads only. Every change goes through the functions below, so nobody can edit amounts or statuses directly.
create policy "lines read" on student_fee_lines for select using (
  is_admin() or has_role('bursar') or can_view_fees(student_section(student_id)) or leads_student(student_id) or parent_of(student_id));
create trigger audit_sfl after update or delete on student_fee_lines for each row execute function audit_row();

-- Brought-forward debt becomes an outstanding line automatically
create or replace function ensure_bf(p_student uuid, p_term uuid default null) returns void language plpgsql security definer set search_path=public as $$
declare t uuid := coalesce(p_term, (select id from terms order by starts_on desc limit 1)); d numeric;
begin
  select debt_forward_ngn into d from students where id = p_student;
  if t is null then return; end if;
  if d > 0 then
    insert into student_fee_lines (student_id, term_id, kind, title, amount_ngn) values (p_student, t, 'brought_forward', 'Balance brought forward', d)
    on conflict do nothing;
    update student_fee_lines set amount_ngn = d where student_id = p_student and kind = 'brought_forward' and status = 'pending';
  else
    delete from student_fee_lines where student_id = p_student and kind = 'brought_forward' and status = 'pending';
  end if;
end $$;
create or replace function trg_student_debt() returns trigger language plpgsql security definer set search_path=public as $$
begin perform ensure_bf(new.id); return new; end $$;
create trigger students_debt after insert or update of debt_forward_ngn on students for each row execute function trg_student_debt();
update students set debt_forward_ngn = debt_forward_ngn;   -- creates lines for any existing students with a balance

-- Bursar (or admin) issues the schedule for a term (optionally one class): copies the fee items each student owes
create or replace function issue_schedule(p_term uuid, p_class uuid default null) returns int language plpgsql security definer set search_path=public as $$
declare n int; s record;
begin
  if not (is_admin() or has_role('bursar')) then raise exception 'Only the bursar can issue schedules'; end if;
  insert into student_fee_lines (student_id, term_id, fee_item_id, kind, level, title, amount_ngn)
  select st.id, p_term, f.id, 'fee', f.level, f.title, f.amount_ngn
  from students st join classes c on c.id = st.class_id
  join fee_items f on f.term_id = p_term and f.section = c.section and (f.level < 3 or f.class_id = st.class_id)
  where st.status = 'active' and (p_class is null or st.class_id = p_class)
  on conflict do nothing;
  get diagnostics n = row_count;
  for s in select id from students where status = 'active' and (p_class is null or class_id = p_class) and debt_forward_ngn > 0 loop perform ensure_bf(s.id, p_term); end loop;
  return n;
end $$;

-- Parent ticks what they paid
create or replace function claim_payment(p_lines uuid[], p_reference text default null) returns int language plpgsql security definer set search_path=public as $$
declare n int;
begin
  update student_fee_lines l set status = 'claimed', claimed_at = now(), claimed_by = auth.uid(), claim_reference = left(p_reference, 80), review_note = null
  where l.id = any(p_lines) and l.status = 'pending' and parent_of(l.student_id);
  get diagnostics n = row_count;
  return n;
end $$;

-- Bursar confirms (or rejects a claim, or records a payment received at the office)
create or replace function confirm_payment(p_lines uuid[], p_accept boolean, p_note text default null) returns int language plpgsql security definer set search_path=public as $$
declare n int;
begin
  if not has_role('bursar') then raise exception 'Only the bursar can confirm payments'; end if;
  if p_accept then
    update student_fee_lines set status = 'confirmed', confirmed_at = now(), confirmed_by = auth.uid(), review_note = left(p_note, 200)
    where id = any(p_lines) and status in ('claimed', 'pending');
  else
    update student_fee_lines set status = 'pending', claimed_at = null, claimed_by = null, claim_reference = null, review_note = left(p_note, 200)
    where id = any(p_lines) and status = 'claimed';
  end if;
  get diagnostics n = row_count;
  return n;
end $$;

-- One reader for the bursar dashboard, debtor lists and summaries. Scope is decided inside:
-- admin/bursar all; principal, headmaster and exam officer their section; class teacher their own class.
create or replace function fee_ledger(p_term uuid default null, p_year uuid default null)
returns table (line_id uuid, student_id uuid, student_name text, admission_no text, student_status student_status, class_id uuid, class_name text, section school_section,
               term_id uuid, term_number smallint, year_name text, kind text, level smallint, title text, amount_ngn numeric, status text,
               claimed_at timestamptz, claim_reference text, confirmed_at timestamptz, review_note text)
language sql stable security definer set search_path=public as $$
  select l.id, s.id, s.last_name || ' ' || s.first_name, s.admission_no, s.status, c.id, c.name, c.section,
         t.id, t.number, y.name, l.kind, l.level, l.title, l.amount_ngn, l.status, l.claimed_at, l.claim_reference, l.confirmed_at, l.review_note
  from student_fee_lines l join students s on s.id = l.student_id join classes c on c.id = s.class_id
  join terms t on t.id = l.term_id join academic_years y on y.id = t.year_id
  where (p_term is null or l.term_id = p_term) and (p_year is null or t.year_id = p_year)
    and (is_admin() or has_role('bursar') or can_view_fees(c.section) or c.class_teacher_id = auth.uid()) $$;

-- Parent names for the report-card picker (admin and exam officers, only for students they manage)
create or replace function guardian_links() returns table (parent_id uuid, parent_name text, parent_email text, student_id uuid)
language sql stable security definer set search_path=public as $$
  select p.id, p.full_name, p.email, g.student_id from guardians g join profiles p on p.id = g.parent_id where is_admin() or manages_student(g.student_id) $$;

-- ===================== 5. Retention: move old attendance, ratings and audit rows to archive tables =====================
create table attendance_archive (like attendance);
alter table attendance_archive add primary key (student_id, term_id);
create table ratings_archive (like ratings);
alter table ratings_archive add primary key (student_id, term_id, trait_id);
create table audit_log_archive (like audit_log);
alter table audit_log_archive add primary key (id);
alter table attendance_archive enable row level security; alter table ratings_archive enable row level security; alter table audit_log_archive enable row level security;
create policy "att archive admin" on attendance_archive for select using (is_admin());
create policy "rating archive admin" on ratings_archive for select using (is_admin());
create policy "audit archive admin" on audit_log_archive for select using (is_admin());

create or replace function audit_immutable() returns trigger language plpgsql as $$
begin
  if current_setting('app.retention', true) = '1' then return coalesce(old, new); end if;
  raise exception 'The audit log cannot be changed';
end $$;

create or replace function retention_preview(p_years int default 5, p_audit_years int default 3) returns jsonb language sql stable security definer set search_path=public as $$
  select case when is_admin() then jsonb_build_object(
    'attendance', (select count(*) from attendance a join terms t on t.id = a.term_id where t.ends_on < current_date - make_interval(years => p_years)),
    'ratings', (select count(*) from ratings r join terms t on t.id = r.term_id where t.ends_on < current_date - make_interval(years => p_years)),
    'audit', (select count(*) from audit_log where at < now() - make_interval(years => p_audit_years))) end $$;

create or replace function run_retention(p_years int default 5, p_audit_years int default 3) returns jsonb language plpgsql security definer set search_path=public as $$
declare a int; r int; l int;
begin
  if not is_admin() then raise exception 'Admin only'; end if;
  if p_years < 2 or p_audit_years < 1 then raise exception 'Keep at least 2 years of attendance and 1 year of audit history'; end if;
  perform set_config('app.retention', '1', true);
  insert into attendance_archive select a.* from attendance a join terms t on t.id = a.term_id where t.ends_on < current_date - make_interval(years => p_years) on conflict do nothing;
  delete from attendance a using terms t where t.id = a.term_id and t.ends_on < current_date - make_interval(years => p_years); get diagnostics a = row_count;
  insert into ratings_archive select x.* from ratings x join terms t on t.id = x.term_id where t.ends_on < current_date - make_interval(years => p_years) on conflict do nothing;
  delete from ratings x using terms t where t.id = x.term_id and t.ends_on < current_date - make_interval(years => p_years); get diagnostics r = row_count;
  insert into audit_log_archive select * from audit_log where at < now() - make_interval(years => p_audit_years) on conflict do nothing;
  delete from audit_log where at < now() - make_interval(years => p_audit_years); get diagnostics l = row_count;
  return jsonb_build_object('attendance', a, 'ratings', r, 'audit', l);
end $$;
-- Scores and report-card data are the permanent academic record and are never archived automatically.
-- Optional automatic yearly run (enable the pg_cron extension in Supabase first):
--   select cron.schedule('yearly-retention', '0 3 1 9 *', $$select run_retention(5, 3)$$);   -- NOTE: needs a postgres-role wrapper; see docs

-- ===================== 6. Index and JSON hygiene =====================
drop index if exists user_roles_user_id_idx;          -- duplicate: the unique (user_id, role, section) already starts with user_id
drop index if exists audit_log_at_idx;                -- listing is ordered by id
drop index if exists audit_log_table_name_at_idx;
create index audit_log_table_id on audit_log (table_name, id desc);
create index if not exists scores_term_class on scores (term_id, class_id);     -- results and dashboards
create index if not exists attendance_term on attendance (term_id);
create index if not exists ratings_term on ratings (term_id);
create index if not exists guardians_student on guardians (student_id);
create index if not exists fee_items_term on fee_items (term_id, section);

alter table newsletters add constraint newsletters_fields_small check (pg_column_size(fields) <= 4096);
alter table invites add constraint invites_roles_small check (pg_column_size(roles) <= 2048);

-- Audit rows now keep only the columns that changed on an update, not the whole row
create or replace function audit_row() returns trigger language plpgsql security definer set search_path=public as $$
declare o jsonb := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end;
        n jsonb := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end;
        r jsonb := coalesce(n, o); k text; o2 jsonb; n2 jsonb;
begin
  k := coalesce(r->>'id', concat_ws('/', r->>'student_id', r->>'subject_id', r->>'term_id', r->>'trait_id', r->>'class_id', r->>'user_id', r->>'role', r->>'section'));
  if tg_op = 'UPDATE' then
    select jsonb_object_agg(key, value), jsonb_object_agg(key, o -> key) into n2, o2 from jsonb_each(n) where (o -> key) is distinct from value;
    if n2 is null then return new; end if;
    o := o2; n := n2;
  end if;
  insert into audit_log (actor, actor_email, action, table_name, record_key, old_row, new_row)
  values (auth.uid(), (select email from profiles where id = auth.uid()), tg_op, tg_table_name, k, o, n);
  return coalesce(new, old);
end $$;

-- ======================================================================
-- roles matching
-- ======================================================================
-- strict role visibility, parent matching, results that rank the whole class, and a refreshed students view.
--

-- ===== 1. Rebuild the students view (it was created before the new student columns existed, so it could not see them) =====
drop view if exists students_with_age;
create view students_with_age with (security_invoker = true) as
  select s.*, date_part('year', age(current_date, s.dob))::int as age_years from students s;

-- ===== 2. Subjects: only visible where they concern you =====
-- Admin, board and bursar see all. Staff see subjects offered in their own section. Parents see subjects offered in their children's sub-sections.
create or replace function can_see_subject(subs sub_section_name[]) returns boolean language sql stable security definer set search_path=public as $$
  select is_admin() or has_role('board_member') or has_role('bursar')
    or exists (select 1 from user_roles ur where ur.user_id = auth.uid() and ur.section is not null
               and exists (select 1 from unnest(subs) u where section_of_sub(u) = ur.section))
    or exists (select 1 from guardians g join students s on s.id = g.student_id join classes c on c.id = s.class_id
               where g.parent_id = auth.uid() and c.sub_section = any(subs)) $$;
drop policy if exists "subjects read" on subjects;
create policy "subjects read" on subjects for select using (can_see_subject(sub_sections));

-- ===== 3. Newsletters: whole-school ones for everyone signed in; section ones only for that section's staff and parents =====
create or replace function can_read_newsletter(sec school_section) returns boolean language sql stable security definer set search_path=public as $$
  select (sec is null and auth.uid() is not null) or is_admin() or has_role('board_member')
    or exists (select 1 from user_roles where user_id = auth.uid() and section = sec)
    or exists (select 1 from guardians g join students s on s.id = g.student_id join classes c on c.id = s.class_id where g.parent_id = auth.uid() and c.section = sec) $$;
drop policy if exists "news read" on newsletters;
create policy "news read" on newsletters for select using (can_read_newsletter(section));

-- ===== 4. Results: rank the WHOLE class, then return only the rows the caller may see =====
-- Before, a parent's query could only see their own child, so every child was "1st of 1" and class averages were the child's own scores.
create or replace function term_results(p_term uuid, p_class uuid)
returns table (student_id uuid, subject_id uuid, subject_name text, ca1 numeric, ca2 numeric, exam numeric, total numeric,
               grade text, term_average numeric, cumulative_average numeric, class_position int, class_size int,
               status text, remark text, term_number smallint)
language sql stable security definer set search_path=public as $$
with t as (select tt.id, tt.number, tt.year_id, y.target_average from terms tt join academic_years y on y.id=tt.year_id where tt.id=p_term),
yr as (select x.student_id from scores x join terms tt on tt.id=x.term_id where tt.year_id=(select year_id from t) and x.class_id=p_class group by 1),
roster as (
  select s.id from students s where s.status='active' and (s.id in (select student_id from yr)
     or (s.class_id=p_class and s.id not in (select x.student_id from scores x join terms tt on tt.id=x.term_id where tt.year_id=(select year_id from t))))),
sc as (select x.student_id, x.subject_id, sub.name subject_name, x.ca1, x.ca2, x.exam, (x.ca1+x.ca2+x.exam) total
       from scores x join subjects sub on sub.id=x.subject_id
       where x.term_id=p_term and x.class_id=p_class and x.student_id in (select id from roster)),
ta as (select student_id, round(avg(total),2) a from sc group by student_id),
per_term as (select x.student_id, x.term_id, avg(x.ca1+x.ca2+x.exam) a from scores x join terms tt on tt.id=x.term_id
       where tt.year_id=(select year_id from t) and x.class_id=p_class and x.student_id in (select id from roster) group by 1,2),
cum as (select student_id, round(avg(a),2) c from per_term group by 1),
ranked as (select ta.student_id, ta.a, case when (select number from t)=3 then cum.c end as c,
       rank() over (order by case when (select number from t)=3 then cum.c else ta.a end desc) pos from ta left join cum using (student_id))
select sc.student_id, sc.subject_id, sc.subject_name, sc.ca1, sc.ca2, sc.exam, sc.total, grade_for(sc.total),
       r.a, r.c, r.pos::int, (select count(*) from roster)::int,
       case when (select number from t)=3 then
         case when r.c >= (select target_average from t)
              then case when (select is_terminal from classes where id=p_class) then 'Graduated' else 'Promoted' end
              else 'Repeat' end end,
       remark_for(case when (select number from t)=3 then r.c else r.a end), (select number from t)
from sc join ranked r using (student_id)
-- who may see which rows: staff of that class's section (and its class teacher) see everyone; a parent sees only their own children
where can_view_class(p_class) or leads_class(p_class) or parent_of(sc.student_id)
order by sc.subject_name $$;

create or replace function class_subject_averages(p_term uuid, p_class uuid) returns table (subject_id uuid, average numeric)
language sql stable security definer set search_path=public as $$
  select x.subject_id, round(avg(x.ca1 + x.ca2 + x.exam), 1)
  from scores x join students s on s.id = x.student_id
  where x.term_id = p_term and x.class_id = p_class and s.status = 'active'
    and (can_view_class(p_class) or leads_class(p_class) or exists (select 1 from scores y where y.term_id = p_term and y.class_id = p_class and parent_of(y.student_id)))
  group by x.subject_id $$;

-- ===== 5. Matching students to parents =====
-- Admin sees every parent. An exam officer sees parents already linked to students in their section, plus parents not linked to anyone yet.
create or replace function matching_parents() returns table (parent_id uuid, parent_name text, email text, phone text, children int)
language sql stable security definer set search_path=public as $$
  select p.id, p.full_name, p.email, p.phone,
         (select count(*) from guardians g where g.parent_id = p.id and (is_admin() or manages_student(g.student_id)))::int
  from profiles p join user_roles ur on ur.user_id = p.id and ur.role = 'parent'
  where is_admin() or (
    exists (select 1 from user_roles me where me.user_id = auth.uid() and me.role = 'exam_officer')
    and (not exists (select 1 from guardians g where g.parent_id = p.id)
         or exists (select 1 from guardians g where g.parent_id = p.id and manages_student(g.student_id))))
  order by p.full_name nulls last, p.email $$;

create or replace function parent_children(p_parent uuid) returns table (student_id uuid, student_name text, admission_no text, class_name text, section school_section, status student_status)
language sql stable security definer set search_path=public as $$
  select s.id, s.last_name || ' ' || s.first_name, s.admission_no, c.name, c.section, s.status
  from guardians g join students s on s.id = g.student_id join classes c on c.id = s.class_id
  where g.parent_id = p_parent and (is_admin() or manages_student(s.id)) order by c.section, c.name, s.last_name $$;

create or replace function link_guardian_id(p_student uuid, p_parent uuid) returns void language plpgsql security definer set search_path=public as $$
begin
  if not (is_admin() or manages_student(p_student)) then raise exception 'You cannot change this student'; end if;
  if not exists (select 1 from user_roles where user_id = p_parent and role = 'parent') then raise exception 'That user is not a registered parent or guardian'; end if;
  insert into guardians (parent_id, student_id) values (p_parent, p_student) on conflict do nothing;
end $$;

create or replace function unlink_guardian(p_student uuid, p_parent uuid) returns void language plpgsql security definer set search_path=public as $$
begin
  if not (is_admin() or manages_student(p_student)) then raise exception 'You cannot change this student'; end if;
  delete from guardians where student_id = p_student and parent_id = p_parent;
end $$;

-- ======================================================================
-- roles terms scores
-- ======================================================================
-- role management safety, term activity (all students or chosen students), whole-sheet CA scores.
--

-- ======================= 1. Roles: safe to add, change and remove =======================
-- There must always be at least one administrator (also stops deleting the last admin's account).
create or replace function protect_last_admin() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if old.role = 'admin' and (tg_op = 'DELETE' or new.role <> 'admin') then
    if not exists (select 1 from user_roles where role = 'admin' and id <> old.id) then
      raise exception 'There must always be at least one administrator. Give someone else the admin role first.';
    end if;
  end if;
  return coalesce(new, old);
end $$;
create trigger trg_protect_last_admin before update or delete on user_roles for each row execute function protect_last_admin();

-- Removing or changing a role also removes what depended on it, so nothing is left pointing at someone who no longer holds the role.
create or replace function cleanup_role_links() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op = 'UPDATE' and new.role = old.role and new.section is not distinct from old.section then return new; end if;
  if old.role = 'class_teacher' then
    update classes set class_teacher_id = null where class_teacher_id = old.user_id and section = old.section;
  elsif old.role = 'subject_teacher' then
    delete from class_subject_teachers x using classes c where c.id = x.class_id and x.teacher_id = old.user_id and c.section = old.section;
  elsif old.role = 'parent' then
    delete from guardians where parent_id = old.user_id;
  end if;
  return coalesce(new, old);
end $$;
create trigger trg_cleanup_role_links after update or delete on user_roles for each row execute function cleanup_role_links();

-- Deleting a user must not be blocked by the history they leave behind: keep the records, drop the reference.
alter table invites drop constraint if exists invites_invited_by_fkey;
alter table invites add constraint invites_invited_by_fkey foreign key (invited_by) references profiles(id) on delete set null;
alter table fee_items drop constraint if exists fee_items_created_by_fkey;
alter table fee_items add constraint fee_items_created_by_fkey foreign key (created_by) references profiles(id) on delete set null;
alter table newsletters drop constraint if exists newsletters_created_by_fkey;
alter table newsletters add constraint newsletters_created_by_fkey foreign key (created_by) references profiles(id) on delete set null;
alter table scores drop constraint if exists scores_updated_by_fkey;
alter table scores add constraint scores_updated_by_fkey foreign key (updated_by) references profiles(id) on delete set null;
alter table student_fee_lines drop constraint if exists student_fee_lines_claimed_by_fkey;
alter table student_fee_lines add constraint student_fee_lines_claimed_by_fkey foreign key (claimed_by) references profiles(id) on delete set null;
alter table student_fee_lines drop constraint if exists student_fee_lines_confirmed_by_fkey;
alter table student_fee_lines add constraint student_fee_lines_confirmed_by_fkey foreign key (confirmed_by) references profiles(id) on delete set null;
alter table class_subject_teachers drop constraint if exists class_subject_teachers_teacher_id_fkey;
alter table class_subject_teachers add constraint class_subject_teachers_teacher_id_fkey foreign key (teacher_id) references profiles(id) on delete cascade;

-- ======================= 2. Term activity =======================
alter table terms add column if not exists is_active boolean not null default true;
alter table terms add column if not exists inactive_reason text check (char_length(inactive_reason) <= 200);

-- Students for whom a term is inactive (a row means "inactive for this student in this term")
create table term_exclusions (
  student_id uuid not null references students(id) on delete cascade,
  term_id uuid not null references terms(id) on delete cascade,
  reason text check (char_length(reason) <= 200),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (student_id, term_id)
);
create index term_exclusions_term on term_exclusions (term_id);
alter table term_exclusions enable row level security;
create policy "exclusions read" on term_exclusions for select using (
  is_admin() or manages_student(student_id) or leads_student(student_id) or parent_of(student_id) or can_view_section(student_section(student_id)));
create trigger audit_term_exclusions after insert or update or delete on term_exclusions for each row execute function audit_row();

create or replace function term_is_open(p_term uuid, p_student uuid default null) returns boolean language sql stable security definer set search_path=public as $$
  select coalesce((select is_active from terms where id = p_term), false)
     and (p_student is null or not exists (select 1 from term_exclusions where student_id = p_student and term_id = p_term)) $$;

create or replace function set_term_active(p_term uuid, p_active boolean, p_reason text default null) returns void language plpgsql security definer set search_path=public as $$
begin
  if not is_admin() then raise exception 'Only the admin can change a term for all students'; end if;
  update terms set is_active = p_active, inactive_reason = case when p_active then null else left(p_reason, 200) end where id = p_term;
end $$;

-- Admin (any student) or exam officer (students of their section): mark a term inactive or active for chosen students
create or replace function set_student_term_activity(p_term uuid, p_students uuid[], p_inactive boolean, p_reason text default null) returns int language plpgsql security definer set search_path=public as $$
declare sid uuid; n int := 0;
begin
  foreach sid in array p_students loop
    if not (is_admin() or manages_student(sid)) then continue; end if;
    if p_inactive then
      insert into term_exclusions (student_id, term_id, reason, created_by) values (sid, p_term, left(p_reason, 200), auth.uid())
      on conflict (student_id, term_id) do update set reason = excluded.reason;
    else
      delete from term_exclusions where student_id = sid and term_id = p_term;
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

-- No entries for an inactive term, or for a student it is inactive for
create or replace function check_score_student() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if not exists (select 1 from students where id = new.student_id and status = 'active') then raise exception 'Student is not active'; end if;
  if not term_is_open(new.term_id) then raise exception 'This term is inactive. No entries can be made for it.'; end if;
  if not term_is_open(new.term_id, new.student_id) then raise exception 'This term is inactive for this student. No entries can be made for it.'; end if;
  new.updated_by := auth.uid();
  if tg_op = 'INSERT' or new.class_id is null then new.class_id := (select class_id from students where id = new.student_id); end if;
  return new;
end $$;

create or replace function check_attendance() returns trigger language plpgsql security definer set search_path=public as $$
declare d smallint;
begin
  if not term_is_open(new.term_id) then raise exception 'This term is inactive. No entries can be made for it.'; end if;
  if not term_is_open(new.term_id, new.student_id) then raise exception 'This term is inactive for this student. No entries can be made for it.'; end if;
  select days_open into d from school_days where term_id = new.term_id and section = student_section(new.student_id);
  if d is null then raise exception 'Set the number of times school opened for this term first'; end if;
  if new.days_present > d then raise exception 'Days present (%) cannot exceed days school opened (%)', new.days_present, d; end if;
  return new;
end $$;

create or replace function check_rating_open() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if not term_is_open(new.term_id) then raise exception 'This term is inactive. No entries can be made for it.'; end if;
  if not term_is_open(new.term_id, new.student_id) then raise exception 'This term is inactive for this student. No entries can be made for it.'; end if;
  return new;
end $$;
create trigger trg_rating_open before insert or update on ratings for each row execute function check_rating_open();

create or replace function check_days_open() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if not term_is_open(new.term_id) then raise exception 'This term is inactive. No entries can be made for it.'; end if;
  return new;
end $$;
create trigger trg_days_open before insert or update on school_days for each row execute function check_days_open();

-- ======================= 3. CA scores are saved as a whole sheet or not at all =======================
drop policy if exists "score write" on scores;      -- no direct inserts or edits any more: everything goes through save_scores()

create or replace function save_scores(p_term uuid, p_class uuid, p_subject uuid, p_rows jsonb) returns int language plpgsql security definer set search_path=public as $$
declare r jsonb; sid uuid; a numeric; b numeric; x numeric; eligible uuid[]; given uuid[] := '{}'; n int := 0;
begin
  if not exists (select 1 from class_subject_teachers where class_id = p_class and subject_id = p_subject) then raise exception 'That subject is not assigned to this class'; end if;
  if not (can_manage_class(p_class) or exists (select 1 from class_subject_teachers where class_id = p_class and subject_id = p_subject and teacher_id = auth.uid())) then
    raise exception 'You are not allowed to enter scores for this subject and class'; end if;
  if not term_is_open(p_term) then raise exception 'This term is inactive. No entries can be made for it.'; end if;
  select array_agg(s.id) into eligible from students s
    where s.class_id = p_class and s.status = 'active' and not exists (select 1 from term_exclusions e where e.student_id = s.id and e.term_id = p_term);
  if eligible is null then raise exception 'No student in this class is active for this term'; end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'Invalid score sheet'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    sid := nullif(r->>'student_id', '')::uuid;
    if sid is null or not (sid = any (eligible)) then raise exception 'The sheet includes a student who is not active in this class for this term'; end if;
    if sid = any (given) then raise exception 'A student appears twice in the sheet'; end if;
    if nullif(btrim(r->>'ca1'), '') is null or nullif(btrim(r->>'ca2'), '') is null or nullif(btrim(r->>'exam'), '') is null then
      raise exception 'Every student needs a 1st CA, a 2nd CA and an exam score. Nothing was saved because at least one box is empty.'; end if;
    a := (r->>'ca1')::numeric; b := (r->>'ca2')::numeric; x := (r->>'exam')::numeric;
    if a < 0 or a > 15 or b < 0 or b > 15 or x < 0 or x > 70 then raise exception 'Scores out of range: CA must be 0 to 15 and exam 0 to 70. Nothing was saved.'; end if;
    given := given || sid;
  end loop;
  if cardinality(given) <> cardinality(eligible) then
    raise exception '% student(s) have no scores in the sheet. Every student in the class must have 1st CA, 2nd CA and exam entered. Nothing was saved.', cardinality(eligible) - cardinality(given); end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    insert into scores (student_id, subject_id, term_id, ca1, ca2, exam) values ((r->>'student_id')::uuid, p_subject, p_term, (r->>'ca1')::numeric, (r->>'ca2')::numeric, (r->>'exam')::numeric)
    on conflict (student_id, subject_id, term_id) do update set ca1 = excluded.ca1, ca2 = excluded.ca2, exam = excluded.exam;
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function clear_scores(p_term uuid, p_class uuid, p_subject uuid) returns int language plpgsql security definer set search_path=public as $$
declare n int;
begin
  if not is_admin() then raise exception 'Only the admin can clear a score sheet'; end if;
  delete from scores where term_id = p_term and class_id = p_class and subject_id = p_subject; get diagnostics n = row_count; return n;
end $$;

-- How complete each subject's sheet is for a class and term
create or replace function score_completeness(p_term uuid, p_class uuid) returns table (subject_id uuid, subject_name text, eligible int, complete int)
language sql stable security definer set search_path=public as $$
  with elig as (select s.id from students s where s.class_id = p_class and s.status = 'active' and term_is_open(p_term)
                and not exists (select 1 from term_exclusions e where e.student_id = s.id and e.term_id = p_term))
  select cst.subject_id, sub.name, (select count(*) from elig)::int,
         (select count(*) from scores x where x.term_id = p_term and x.class_id = p_class and x.subject_id = cst.subject_id and x.student_id in (select id from elig))::int
  from class_subject_teachers cst join subjects sub on sub.id = cst.subject_id
  where cst.class_id = p_class and (can_view_class(p_class) or leads_class(p_class) or teaches_class(p_class))
  order by sub.name $$;

-- ======================= 4. Results and dashboards respect term activity =======================
-- The cumulative average for a third term divides by the number of ACTIVE terms for that student: terms inactive for everyone,
-- and terms inactive for that student, are left out. An active term with no scores counts as 0, so gaps are visible, not hidden.
drop function if exists term_results(uuid, uuid);
create function term_results(p_term uuid, p_class uuid)
returns table (student_id uuid, subject_id uuid, subject_name text, ca1 numeric, ca2 numeric, exam numeric, total numeric,
               grade text, term_average numeric, cumulative_average numeric, class_position int, class_size int,
               status text, remark text, term_number smallint, terms_counted int)
language sql stable security definer set search_path=public as $$
with t as (select tt.id, tt.number, tt.year_id, tt.is_active, y.target_average from terms tt join academic_years y on y.id = tt.year_id where tt.id = p_term),
yr as (select x.student_id from scores x join terms tt on tt.id = x.term_id where tt.year_id = (select year_id from t) and x.class_id = p_class group by 1),
roster as (
  select s.id from students s
  where (select is_active from t) and s.status = 'active'
    and not exists (select 1 from term_exclusions e where e.student_id = s.id and e.term_id = p_term)
    and (s.id in (select student_id from yr)
         or (s.class_id = p_class and s.id not in (select x.student_id from scores x join terms tt on tt.id = x.term_id where tt.year_id = (select year_id from t))))),
sc as (select x.student_id, x.subject_id, sub.name subject_name, x.ca1, x.ca2, x.exam, (x.ca1 + x.ca2 + x.exam) total
       from scores x join subjects sub on sub.id = x.subject_id
       where x.term_id = p_term and x.class_id = p_class and x.student_id in (select id from roster)),
ta as (select student_id, round(avg(total), 2) a from sc group by student_id),
active_terms as (select tt.id from terms tt where tt.year_id = (select year_id from t) and tt.is_active),
st_terms as (select r.id as student_id, a.id as term_id from roster r cross join active_terms a
             where not exists (select 1 from term_exclusions e where e.student_id = r.id and e.term_id = a.id)),
term_avg as (select st.student_id, st.term_id,
             coalesce((select avg(x.ca1 + x.ca2 + x.exam) from scores x where x.student_id = st.student_id and x.term_id = st.term_id and x.class_id = p_class), 0) a
             from st_terms st),
cum as (select student_id, round(avg(a), 2) c, count(*)::int n from term_avg group by student_id),
ranked as (select ta.student_id, ta.a, case when (select number from t) = 3 then cum.c end as c, cum.n,
       rank() over (order by case when (select number from t) = 3 then cum.c else ta.a end desc) pos
       from ta left join cum using (student_id))
select sc.student_id, sc.subject_id, sc.subject_name, sc.ca1, sc.ca2, sc.exam, sc.total, grade_for(sc.total),
       r.a, r.c, r.pos::int, (select count(*) from roster)::int,
       case when (select number from t) = 3 then
         case when r.c >= (select target_average from t)
              then case when (select is_terminal from classes where id = p_class) then 'Graduated' else 'Promoted' end
              else 'Repeat' end end,
       remark_for(case when (select number from t) = 3 then r.c else r.a end), (select number from t), r.n
from sc join ranked r using (student_id)
where can_view_class(p_class) or leads_class(p_class) or parent_of(sc.student_id)
order by sc.subject_name $$;

create or replace function class_subject_averages(p_term uuid, p_class uuid) returns table (subject_id uuid, average numeric)
language sql stable security definer set search_path=public as $$
  select x.subject_id, round(avg(x.ca1 + x.ca2 + x.exam), 1)
  from scores x join students s on s.id = x.student_id
  where x.term_id = p_term and x.class_id = p_class and s.status = 'active' and term_is_open(p_term, s.id)
    and (can_view_class(p_class) or leads_class(p_class) or exists (select 1 from scores y where y.term_id = p_term and y.class_id = p_class and parent_of(y.student_id)))
  group by x.subject_id $$;

create or replace function dashboard_rows(p_term uuid)
returns table (student_id uuid, student_name text, gender text, photo_url text, class_name text, section school_section,
               sub_section sub_section_name, subject_name text, total numeric)
language sql stable security definer set search_path=public as $$
  select s.id, s.last_name||' '||s.first_name, s.gender, s.photo_url, c.name, c.section, c.sub_section, sub.name, (x.ca1+x.ca2+x.exam)
  from scores x join students s on s.id=x.student_id join classes c on c.id=x.class_id join subjects sub on sub.id=x.subject_id
  where x.term_id=p_term and s.status='active' and can_view_section(c.section) and term_is_open(p_term, s.id) $$;


-- ======================================================================
-- basic attendance stamps
-- ======================================================================
-- several class teachers per Basic class (ordered), subject inactivity, results gate, attendance by the first class teacher only,
-- bulk attendance, teacher-as-parent, section stamps, indexes. Safe to run on a database with data.

-- ======================= 1. Class teachers: many per Basic class, ordered 1, 2, 3 =======================
create table if not exists class_teachers (
  class_id uuid not null references classes(id) on delete cascade,
  teacher_id uuid not null references profiles(id) on delete cascade,
  position smallint not null check (position between 1 and 20),
  primary key (class_id, teacher_id),
  unique (teacher_id),                                           -- a teacher belongs to one class
  unique (class_id, position) deferrable initially deferred       -- the first teacher is position 1
);
create index if not exists class_teachers_class on class_teachers (class_id);
-- no ON CONFLICT here: Postgres does not allow it with a deferrable constraint
insert into class_teachers (class_id, teacher_id, position)
select c.id, c.class_teacher_id, 1 from classes c
where c.class_teacher_id is not null
  and not exists (select 1 from class_teachers t where t.class_id = c.id or t.teacher_id = c.class_teacher_id);

create or replace function check_class_teachers() returns trigger language plpgsql security definer set search_path=public as $$
declare sec school_section;
begin
  select section into sec from classes where id = new.class_id;
  if not exists (select 1 from user_roles where user_id = new.teacher_id and section = sec and role = 'class_teacher') then
    raise exception 'This person does not hold the class teacher role in the % section.', sec; end if;
  if sec = 'secondary' and exists (select 1 from class_teachers where class_id = new.class_id and teacher_id <> new.teacher_id) then
    raise exception 'A Secondary class has one form master. Basic classes can have several class teachers.'; end if;
  return new;
end $$;
drop trigger if exists trg_check_class_teachers on class_teachers;
create trigger trg_check_class_teachers before insert or update on class_teachers for each row execute function check_class_teachers();

-- classes.class_teacher_id now only mirrors position 1; nobody edits it directly
create or replace function sync_class_lead() returns trigger language plpgsql security definer set search_path=public as $$
declare cid uuid := coalesce(new.class_id, old.class_id);
begin
  update classes set class_teacher_id = (select teacher_id from class_teachers where class_id = cid and position = 1) where id = cid;
  return null;
end $$;
drop trigger if exists trg_sync_class_lead on class_teachers;
create trigger trg_sync_class_lead after insert or update or delete on class_teachers for each row execute function sync_class_lead();

create or replace function block_direct_lead_edit() returns trigger language plpgsql as $$
begin
  if new.class_teacher_id is distinct from old.class_teacher_id and pg_trigger_depth() = 1 then
    raise exception 'Class teachers are changed from the Teacher assignments page (the first one is the lead).'; end if;
  return new;
end $$;
drop trigger if exists trg_block_lead_edit on classes;
create trigger trg_block_lead_edit before update on classes for each row execute function block_direct_lead_edit();
drop trigger if exists trg_class_teacher on classes;   -- replaced by check_class_teachers on the new table

create or replace function leads_class(p_class uuid) returns boolean language sql stable security definer set search_path=public as
$$ select exists (select 1 from class_teachers where class_id = p_class and teacher_id = auth.uid()) $$;
create or replace function is_first_teacher(p_class uuid) returns boolean language sql stable security definer set search_path=public as
$$ select exists (select 1 from class_teachers where class_id = p_class and teacher_id = auth.uid() and position = 1) $$;
create or replace function leads_student(p_student uuid) returns boolean language sql stable security definer set search_path=public as
$$ select exists (select 1 from students s join class_teachers t on t.class_id = s.class_id where s.id = p_student and t.teacher_id = auth.uid()) $$;
create or replace function first_teacher_of_student(p_student uuid) returns boolean language sql stable security definer set search_path=public as
$$ select exists (select 1 from students s join class_teachers t on t.class_id = s.class_id where s.id = p_student and t.teacher_id = auth.uid() and t.position = 1) $$;
create or replace function leads_in_section(s school_section) returns boolean language sql stable security definer set search_path=public as
$$ select exists (select 1 from class_teachers t join classes c on c.id = t.class_id where c.section = s and t.teacher_id = auth.uid()) $$;

drop policy if exists "classes read" on classes;
create policy "classes read" on classes for select using (can_view_section(section) or leads_class(id) or teaches_class(id) or parent_of_class(id));
alter table class_teachers enable row level security;
drop policy if exists "class teachers read" on class_teachers;
create policy "class teachers read" on class_teachers for select using (teacher_id = auth.uid() or can_view_class(class_id) or leads_class(class_id));
-- no direct writes: everything goes through the functions below

create or replace function add_class_teacher(p_class uuid, p_teacher uuid) returns void language plpgsql security definer set search_path=public as $$
declare nxt smallint;
begin
  if not can_manage_class(p_class) then raise exception 'Only the admin or the exam officer of this section can assign class teachers.'; end if;
  if exists (select 1 from class_teachers where class_id = p_class and teacher_id = p_teacher) then raise exception 'That teacher is already on this class.'; end if;
  if exists (select 1 from class_teachers where teacher_id = p_teacher) then raise exception 'That teacher already belongs to another class. Remove them there first.'; end if;
  select coalesce(max(position), 0) + 1 into nxt from class_teachers where class_id = p_class;
  insert into class_teachers (class_id, teacher_id, position) values (p_class, p_teacher, nxt);
end $$;

create or replace function remove_class_teacher(p_class uuid, p_teacher uuid) returns void language plpgsql security definer set search_path=public as $$
begin
  if not can_manage_class(p_class) then raise exception 'Only the admin or the exam officer of this section can change class teachers.'; end if;
  delete from class_teachers where class_id = p_class and teacher_id = p_teacher;
  with r as (select teacher_id, row_number() over (order by position) rn from class_teachers where class_id = p_class)
  update class_teachers t set position = r.rn from r where t.class_id = p_class and t.teacher_id = r.teacher_id;
end $$;

-- Give the full ordered list; the first becomes the lead (the only one who enters attendance)
create or replace function set_class_teacher_order(p_class uuid, p_teachers uuid[]) returns void language plpgsql security definer set search_path=public as $$
declare cur uuid[]; i int;
begin
  if not can_manage_class(p_class) then raise exception 'Only the admin or the exam officer of this section can change class teachers.'; end if;
  select array_agg(teacher_id) into cur from class_teachers where class_id = p_class;
  if cur is null or cardinality(cur) <> cardinality(p_teachers) or exists (select 1 from unnest(p_teachers) x where x <> all (cur)) then
    raise exception 'The order must list exactly the teachers of this class.'; end if;
  for i in 1 .. cardinality(p_teachers) loop update class_teachers set position = i where class_id = p_class and teacher_id = p_teachers[i]; end loop;
end $$;

create or replace function cleanup_role_links() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op = 'UPDATE' and new.role = old.role and new.section is not distinct from old.section then return new; end if;
  if old.role = 'class_teacher' then
    delete from class_teachers t using classes c where c.id = t.class_id and t.teacher_id = old.user_id and c.section = old.section;
  elsif old.role = 'subject_teacher' then
    delete from class_subject_teachers x using classes c where c.id = x.class_id and x.teacher_id = old.user_id and c.section = old.section;
  elsif old.role = 'parent' then
    delete from guardians where parent_id = old.user_id;
  end if;
  return coalesce(new, old);
end $$;

create or replace function fee_ledger(p_term uuid default null, p_year uuid default null)
returns table (line_id uuid, student_id uuid, student_name text, admission_no text, student_status student_status, class_id uuid, class_name text, section school_section,
               term_id uuid, term_number smallint, year_name text, kind text, level smallint, title text, amount_ngn numeric, status text,
               claimed_at timestamptz, claim_reference text, confirmed_at timestamptz, review_note text)
language sql stable security definer set search_path=public as $$
  select l.id, s.id, s.last_name || ' ' || s.first_name, s.admission_no, s.status, c.id, c.name, c.section,
         t.id, t.number, y.name, l.kind, l.level, l.title, l.amount_ngn, l.status, l.claimed_at, l.claim_reference, l.confirmed_at, l.review_note
  from student_fee_lines l join students s on s.id = l.student_id join classes c on c.id = s.class_id
  join terms t on t.id = l.term_id join academic_years y on y.id = t.year_id
  where (p_term is null or l.term_id = p_term) and (p_year is null or t.year_id = p_year)
    and (is_admin() or has_role('bursar') or can_view_fees(c.section) or leads_class(c.id)) $$;

-- ======================= 2. Subjects switched off for a term or session =======================
create table if not exists subject_inactivity (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references subjects(id) on delete cascade,
  class_id uuid not null references classes(id) on delete cascade,
  year_id uuid not null references academic_years(id) on delete cascade,
  term_id uuid references terms(id) on delete cascade,          -- null = the whole session
  reason text check (char_length(reason) <= 200),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists subject_inactivity_uq on subject_inactivity (subject_id, class_id, year_id, coalesce(term_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists subject_inactivity_lookup on subject_inactivity (class_id, year_id);
alter table subject_inactivity enable row level security;
drop policy if exists "inactive read" on subject_inactivity;
create policy "inactive read" on subject_inactivity for select using (can_view_class(class_id) or leads_class(class_id) or teaches_class(class_id));
drop trigger if exists audit_subject_inactivity on subject_inactivity;
create trigger audit_subject_inactivity after insert or update or delete on subject_inactivity for each row execute function audit_row();

create or replace function subject_is_inactive(p_term uuid, p_class uuid, p_subject uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists (select 1 from subject_inactivity i join terms t on t.id = p_term
                 where i.subject_id = p_subject and i.class_id = p_class and i.year_id = t.year_id and (i.term_id is null or i.term_id = p_term)) $$;

-- Admin: any classes. Exam officer: classes of their own section only. Many subjects and classes at once.
create or replace function set_subject_inactivity(p_subjects uuid[], p_classes uuid[], p_year uuid, p_term uuid, p_inactive boolean, p_reason text default null) returns int
language plpgsql security definer set search_path=public as $$
declare c uuid; s uuid; n int := 0; cs sub_section_name;
begin
  if p_subjects is null or cardinality(p_subjects) = 0 or p_classes is null or cardinality(p_classes) = 0 then raise exception 'Choose at least one subject and one class.'; end if;
  if p_term is not null and not exists (select 1 from terms where id = p_term and year_id = p_year) then raise exception 'That term does not belong to the chosen session.'; end if;
  foreach c in array p_classes loop
    if not can_manage_class(c) then raise exception 'You can only change classes in your own section.'; end if;
    select sub_section into cs from classes where id = c;
    foreach s in array p_subjects loop
      if not exists (select 1 from subjects where id = s and cs = any(sub_sections)) then continue; end if;
      if p_inactive then
        if p_term is null then delete from subject_inactivity where subject_id = s and class_id = c and year_id = p_year; end if;
        insert into subject_inactivity (subject_id, class_id, year_id, term_id, reason, created_by) values (s, c, p_year, p_term, left(p_reason, 200), auth.uid())
          on conflict (subject_id, class_id, year_id, coalesce(term_id, '00000000-0000-0000-0000-000000000000'::uuid)) do update set reason = excluded.reason;
      else
        if p_term is null then delete from subject_inactivity where subject_id = s and class_id = c and year_id = p_year;
        else
          if exists (select 1 from subject_inactivity where subject_id = s and class_id = c and year_id = p_year and term_id is null) then
            raise exception 'A subject switched off for the whole session must be switched back on for the whole session.'; end if;
          delete from subject_inactivity where subject_id = s and class_id = c and year_id = p_year and term_id = p_term;
        end if;
      end if;
      n := n + 1;
    end loop;
  end loop;
  return n;
end $$;

-- Subjects a class actually takes this term: Basic = every offered subject (class teachers teach all); Secondary = assigned subjects; minus inactive ones
create or replace function class_active_subjects(p_term uuid, p_class uuid) returns table (subject_id uuid, subject_name text)
language sql stable security definer set search_path=public as $$
  select s.id, s.name from classes c join subjects s on c.sub_section = any(s.sub_sections)
  where c.id = p_class and not subject_is_inactive(p_term, p_class, s.id)
    and (c.section = 'basic' or exists (select 1 from class_subject_teachers x where x.class_id = c.id and x.subject_id = s.id))
    and (can_view_class(p_class) or leads_class(p_class) or teaches_class(p_class) or parent_of_class(p_class))
  order by s.name $$;

-- ======================= 3. Results can be compiled for a section only when every subject of every class has a teacher =======================
create or replace function results_blockers(p_term uuid, p_section school_section) returns table (class_id uuid, class_name text, subject_id uuid, subject_name text, problem text)
language sql stable security definer set search_path=public as $$
  select c.id, c.name, null::uuid, null::text, 'No class teacher is assigned.' from classes c
   where c.section = p_section and p_section = 'basic' and not exists (select 1 from class_teachers t where t.class_id = c.id)
  union all
  select c.id, c.name, s.id, s.name, 'No subject teacher is assigned.' from classes c join subjects s on c.sub_section = any(s.sub_sections)
   where c.section = p_section and p_section = 'secondary' and not subject_is_inactive(p_term, c.id, s.id)
     and not exists (select 1 from class_subject_teachers x where x.class_id = c.id and x.subject_id = s.id)
  order by 2, 4 $$;
create or replace function section_results_ready(p_term uuid, p_section school_section) returns boolean language sql stable security definer set search_path=public as $$
  select not exists (select 1 from results_blockers(p_term, p_section)) $$;

-- ======================= 4. Scores: Basic class teachers enter any subject, several at once; inactive subjects refused =======================
create or replace function save_scores(p_term uuid, p_class uuid, p_subject uuid, p_rows jsonb) returns int language plpgsql security definer set search_path=public as $$
declare r jsonb; sid uuid; a numeric; b numeric; x numeric; eligible uuid[]; given uuid[] := '{}'; n int := 0; sec school_section := class_section(p_class);
begin
  if not exists (select 1 from class_active_subjects(p_term, p_class) where subject_id = p_subject) then raise exception 'That subject is not taken by this class this term (not assigned, or switched off).'; end if;
  if not (can_manage_class(p_class) or (sec = 'basic' and leads_class(p_class))
          or exists (select 1 from class_subject_teachers where class_id = p_class and subject_id = p_subject and teacher_id = auth.uid())) then
    raise exception 'You are not allowed to enter scores for this subject and class'; end if;
  if not term_is_open(p_term) then raise exception 'This term is inactive. No entries can be made for it.'; end if;
  select array_agg(s.id) into eligible from students s
    where s.class_id = p_class and s.status = 'active' and not exists (select 1 from term_exclusions e where e.student_id = s.id and e.term_id = p_term);
  if eligible is null then raise exception 'No student in this class is active for this term'; end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'Invalid score sheet'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    sid := nullif(r->>'student_id', '')::uuid;
    if sid is null or not (sid = any (eligible)) then raise exception 'The sheet includes a student who is not active in this class for this term'; end if;
    if sid = any (given) then raise exception 'A student appears twice in the sheet'; end if;
    if nullif(btrim(r->>'ca1'), '') is null or nullif(btrim(r->>'ca2'), '') is null or nullif(btrim(r->>'exam'), '') is null then
      raise exception 'Every student needs a 1st CA, a 2nd CA and an exam score. Nothing was saved because at least one box is empty.'; end if;
    a := (r->>'ca1')::numeric; b := (r->>'ca2')::numeric; x := (r->>'exam')::numeric;
    if a < 0 or a > 15 or b < 0 or b > 15 or x < 0 or x > 70 then raise exception 'Scores out of range: CA must be 0 to 15 and exam 0 to 70. Nothing was saved.'; end if;
    given := given || sid;
  end loop;
  if cardinality(given) <> cardinality(eligible) then
    raise exception '% student(s) have no scores in the sheet. Every student in the class must have 1st CA, 2nd CA and exam entered. Nothing was saved.', cardinality(eligible) - cardinality(given); end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    insert into scores (student_id, subject_id, term_id, ca1, ca2, exam) values ((r->>'student_id')::uuid, p_subject, p_term, (r->>'ca1')::numeric, (r->>'ca2')::numeric, (r->>'exam')::numeric)
    on conflict (student_id, subject_id, term_id) do update set ca1 = excluded.ca1, ca2 = excluded.ca2, exam = excluded.exam;
    n := n + 1;
  end loop;
  return n;
end $$;

-- Several subjects in one go (all or nothing). p_sheets = [{"subject_id": "...", "rows": [{student_id, ca1, ca2, exam}, ...]}, ...]
create or replace function save_scores_multi(p_term uuid, p_class uuid, p_sheets jsonb) returns int language plpgsql security definer set search_path=public as $$
declare sh jsonb; n int := 0;
begin
  if jsonb_typeof(p_sheets) <> 'array' or jsonb_array_length(p_sheets) = 0 then raise exception 'Choose at least one subject.'; end if;
  if jsonb_array_length(p_sheets) > 40 then raise exception 'Too many subjects at once.'; end if;
  for sh in select * from jsonb_array_elements(p_sheets) loop
    n := n + save_scores(p_term, p_class, (sh->>'subject_id')::uuid, sh->'rows');
  end loop;
  return n;
end $$;

create or replace function score_completeness(p_term uuid, p_class uuid) returns table (subject_id uuid, subject_name text, eligible int, complete int)
language sql stable security definer set search_path=public as $$
  with elig as (select s.id from students s where s.class_id = p_class and s.status = 'active' and term_is_open(p_term)
                and not exists (select 1 from term_exclusions e where e.student_id = s.id and e.term_id = p_term))
  select a.subject_id, a.subject_name, (select count(*) from elig)::int,
         (select count(*) from scores x where x.term_id = p_term and x.class_id = p_class and x.subject_id = a.subject_id and x.student_id in (select id from elig))::int
  from class_active_subjects(p_term, p_class) a
  where can_view_class(p_class) or leads_class(p_class) or teaches_class(p_class)
  order by a.subject_name $$;

-- Results ignore inactive subjects and wait until the section is fully staffed
create or replace function term_results(p_term uuid, p_class uuid)
returns table (student_id uuid, subject_id uuid, subject_name text, ca1 numeric, ca2 numeric, exam numeric, total numeric,
               grade text, term_average numeric, cumulative_average numeric, class_position int, class_size int,
               status text, remark text, term_number smallint, terms_counted int)
language sql stable security definer set search_path=public as $$
with t as (select tt.id, tt.number, tt.year_id, tt.is_active, y.target_average from terms tt join academic_years y on y.id = tt.year_id where tt.id = p_term),
ready as (select section_results_ready(p_term, class_section(p_class)) ok),
inact as (select i.subject_id, i.term_id from subject_inactivity i where i.class_id = p_class and i.year_id = (select year_id from t)),
yr as (select x.student_id from scores x join terms tt on tt.id = x.term_id where tt.year_id = (select year_id from t) and x.class_id = p_class group by 1),
roster as (
  select s.id from students s
  where (select is_active from t) and s.status = 'active'
    and not exists (select 1 from term_exclusions e where e.student_id = s.id and e.term_id = p_term)
    and (s.id in (select student_id from yr)
         or (s.class_id = p_class and s.id not in (select x.student_id from scores x join terms tt on tt.id = x.term_id where tt.year_id = (select year_id from t))))),
sc as (select x.student_id, x.subject_id, sub.name subject_name, x.ca1, x.ca2, x.exam, (x.ca1 + x.ca2 + x.exam) total
       from scores x join subjects sub on sub.id = x.subject_id
       where x.term_id = p_term and x.class_id = p_class and x.student_id in (select id from roster)
         and not exists (select 1 from inact n where n.subject_id = x.subject_id and (n.term_id is null or n.term_id = p_term))),
ta as (select student_id, round(avg(total), 2) a from sc group by student_id),
active_terms as (select tt.id from terms tt where tt.year_id = (select year_id from t) and tt.is_active),
st_terms as (select r.id as student_id, a.id as term_id from roster r cross join active_terms a
             where not exists (select 1 from term_exclusions e where e.student_id = r.id and e.term_id = a.id)),
term_avg as (select st.student_id, st.term_id,
             coalesce((select avg(x.ca1 + x.ca2 + x.exam) from scores x where x.student_id = st.student_id and x.term_id = st.term_id and x.class_id = p_class
                       and not exists (select 1 from inact n where n.subject_id = x.subject_id and (n.term_id is null or n.term_id = st.term_id))), 0) a
             from st_terms st),
cum as (select student_id, round(avg(a), 2) c, count(*)::int n from term_avg group by student_id),
ranked as (select ta.student_id, ta.a, case when (select number from t) = 3 then cum.c end as c, cum.n,
       rank() over (order by case when (select number from t) = 3 then cum.c else ta.a end desc) pos
       from ta left join cum using (student_id))
select sc.student_id, sc.subject_id, sc.subject_name, sc.ca1, sc.ca2, sc.exam, sc.total, grade_for(sc.total),
       r.a, r.c, r.pos::int, (select count(*) from roster)::int,
       case when (select number from t) = 3 then
         case when r.c >= (select target_average from t)
              then case when (select is_terminal from classes where id = p_class) then 'Graduated' else 'Promoted' end
              else 'Repeat' end end,
       remark_for(case when (select number from t) = 3 then r.c else r.a end), (select number from t), r.n
from sc join ranked r using (student_id)
where (select ok from ready) and (can_view_class(p_class) or leads_class(p_class) or parent_of(sc.student_id))
order by sc.subject_name $$;

create or replace function class_subject_averages(p_term uuid, p_class uuid) returns table (subject_id uuid, average numeric)
language sql stable security definer set search_path=public as $$
  select x.subject_id, round(avg(x.ca1 + x.ca2 + x.exam), 1)
  from scores x join students s on s.id = x.student_id
  where x.term_id = p_term and x.class_id = p_class and s.status = 'active' and term_is_open(p_term, s.id)
    and not subject_is_inactive(p_term, p_class, x.subject_id)
    and (can_view_class(p_class) or leads_class(p_class) or exists (select 1 from scores y where y.term_id = p_term and y.class_id = p_class and parent_of(y.student_id)))
  group by x.subject_id $$;

create or replace function dashboard_rows(p_term uuid)
returns table (student_id uuid, student_name text, gender text, photo_url text, class_name text, section school_section,
               sub_section sub_section_name, subject_name text, total numeric)
language sql stable security definer set search_path=public as $$
  select s.id, s.last_name||' '||s.first_name, s.gender, s.photo_url, c.name, c.section, c.sub_section, sub.name, (x.ca1+x.ca2+x.exam)
  from scores x join students s on s.id=x.student_id join classes c on c.id=x.class_id join subjects sub on sub.id=x.subject_id
  where x.term_id=p_term and s.status='active' and can_view_section(c.section) and term_is_open(p_term, s.id)
    and not subject_is_inactive(p_term, x.class_id, x.subject_id) $$;

-- ======================= 5. Attendance: only the first class teacher / form master, present days only, many students at once =======================
drop policy if exists "att write class teacher" on attendance;
drop policy if exists "att insert first teacher" on attendance;
drop policy if exists "att update first teacher" on attendance;
drop policy if exists "att delete first teacher" on attendance;
create policy "att insert first teacher" on attendance for insert with check (first_teacher_of_student(student_id));
create policy "att update first teacher" on attendance for update using (first_teacher_of_student(student_id)) with check (first_teacher_of_student(student_id));
create policy "att delete first teacher" on attendance for delete using (first_teacher_of_student(student_id));

create or replace function check_attendance() returns trigger language plpgsql security definer set search_path=public as $$
declare d smallint;
begin
  if auth.uid() is not null and not first_teacher_of_student(new.student_id) then
    raise exception 'Only the first class teacher (or the form master) of this class can enter attendance.'; end if;
  if not term_is_open(new.term_id) then raise exception 'This term is inactive. No entries can be made for it.'; end if;
  if not term_is_open(new.term_id, new.student_id) then raise exception 'This term is inactive for this student. No entries can be made for it.'; end if;
  select days_open into d from school_days where term_id = new.term_id and section = student_section(new.student_id);
  if d is null then raise exception 'Set the number of times school opened for this term first'; end if;
  if new.days_present > d then raise exception 'Days present (%) cannot exceed days school opened (%)', new.days_present, d; end if;
  return new;
end $$;

create or replace function save_attendance(p_term uuid, p_class uuid, p_rows jsonb) returns int language plpgsql security definer set search_path=public as $$
declare r jsonb; n int := 0; v int;
begin
  if not is_first_teacher(p_class) then raise exception 'Only the first class teacher (or the form master) of this class can enter attendance.'; end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'Invalid attendance list'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    if not exists (select 1 from students where id = (r->>'student_id')::uuid and class_id = p_class and status = 'active') then raise exception 'The list includes a student who is not in this class.'; end if;
    if nullif(btrim(r->>'days_present'), '') is null or (r->>'days_present') !~ '^[0-9]{1,3}$' then raise exception 'Days present must be a whole number.'; end if;
    v := (r->>'days_present')::int;
    insert into attendance (student_id, term_id, days_present) values ((r->>'student_id')::uuid, p_term, v)
      on conflict (student_id, term_id) do update set days_present = excluded.days_present;
    n := n + 1;
  end loop;
  return n;
end $$;

-- ======================= 6. A teacher can also be a parent =======================
create or replace function set_teacher_as_parent(p_user uuid, p_on boolean) returns void language plpgsql security definer set search_path=public as $$
begin
  if not is_admin() then raise exception 'Only the admin can do this.'; end if;
  if not exists (select 1 from user_roles where user_id = p_user and role in ('class_teacher','subject_teacher','exam_officer','principal','headmaster')) then
    raise exception 'This person does not hold a teaching or school-leader role.'; end if;
  if p_on then insert into user_roles (user_id, role, section) values (p_user, 'parent', null) on conflict do nothing;
  else delete from user_roles where user_id = p_user and role = 'parent'; end if;
end $$;

drop function if exists matching_parents();
create function matching_parents() returns table (parent_id uuid, parent_name text, email text, phone text, children int, also_staff boolean)
language sql stable security definer set search_path=public as $$
  select p.id, p.full_name, p.email, p.phone,
         (select count(*) from guardians g where g.parent_id = p.id and (is_admin() or manages_student(g.student_id)))::int,
         exists (select 1 from user_roles s where s.user_id = p.id and s.role in ('class_teacher','subject_teacher','exam_officer','principal','headmaster'))
  from profiles p join user_roles ur on ur.user_id = p.id and ur.role = 'parent'
  where is_admin() or (
    exists (select 1 from user_roles me where me.user_id = auth.uid() and me.role = 'exam_officer')
    and (not exists (select 1 from guardians g where g.parent_id = p.id)
         or exists (select 1 from guardians g where g.parent_id = p.id and manages_student(g.student_id))))
  order by p.full_name nulls last, p.email $$;

-- ======================= 7. Section stamps (headmaster / headmistress, principal) =======================
create or replace function set_stamp(p_section school_section, p_stamp_url text, p_signature_url text, p_layout jsonb) returns void language plpgsql security definer set search_path=public as $$
begin
  if not (is_admin() or exists (select 1 from user_roles where user_id = auth.uid() and section = p_section and role = case p_section when 'basic' then 'headmaster' else 'principal' end)) then
    raise exception 'Only the % or the admin can change this stamp.', case p_section when 'basic' then 'headmaster or headmistress' else 'principal' end; end if;
  if p_stamp_url is not null and (p_stamp_url !~ '^https://' or char_length(p_stamp_url) > 500) then raise exception 'The stamp link is not valid.'; end if;
  if p_signature_url is not null and (p_signature_url !~ '^https://' or char_length(p_signature_url) > 500) then raise exception 'The signature link is not valid.'; end if;
  if p_layout is not null and (jsonb_typeof(p_layout) <> 'object' or char_length(p_layout::text) > 600) then raise exception 'The stamp layout is not valid.'; end if;
  if p_stamp_url is not null then insert into site_settings (key, value) values ('stamp_' || p_section, p_stamp_url) on conflict (key) do update set value = excluded.value, updated_at = now(); end if;
  if p_signature_url is not null then insert into site_settings (key, value) values ('stamp_signature_' || p_section, p_signature_url) on conflict (key) do update set value = excluded.value, updated_at = now(); end if;
  if p_layout is not null then insert into site_settings (key, value) values ('stamp_layout_' || p_section, p_layout::text) on conflict (key) do update set value = excluded.value, updated_at = now(); end if;
end $$;
drop policy if exists "media stamp upload" on storage.objects;
create policy "media stamp upload" on storage.objects for insert with check (
  bucket_id = 'site-media' and (storage.foldername(name))[1] = 'stamps' and (has_role('headmaster') or has_role('principal')));

-- ======================= 8. Speed =======================
create index if not exists scores_term_class_subject on scores (term_id, class_id, subject_id);
create index if not exists attendance_term on attendance (term_id);
create index if not exists students_class_status on students (class_id, status);
create index if not exists students_surname on students (last_name, first_name);
create index if not exists class_subject_teachers_class on class_subject_teachers (class_id);

-- ======================= 9. Audit and access hygiene =======================
drop trigger if exists audit_class_teachers on class_teachers;
create trigger audit_class_teachers after insert or update or delete on class_teachers for each row execute function audit_row();

-- Only signed-in users may call the new functions (each also checks the caller's role inside)
do $$ declare f text; begin
  foreach f in array array[
    'add_class_teacher(uuid,uuid)','remove_class_teacher(uuid,uuid)','set_class_teacher_order(uuid,uuid[])','set_subject_inactivity(uuid[],uuid[],uuid,uuid,boolean,text)',
    'class_active_subjects(uuid,uuid)','results_blockers(uuid,school_section)','section_results_ready(uuid,school_section)','save_scores_multi(uuid,uuid,jsonb)',
    'save_attendance(uuid,uuid,jsonb)','set_teacher_as_parent(uuid,boolean)','matching_parents()','set_stamp(school_section,text,text,jsonb)',
    'subject_is_inactive(uuid,uuid,uuid)','is_first_teacher(uuid)','first_teacher_of_student(uuid)']
  loop execute format('revoke execute on function %s from public, anon', f); execute format('grant execute on function %s to authenticated', f); end loop;
end $$;


-- ======================================================================
-- speed
-- ======================================================================
-- speed. Same results as before, computed set-wise instead of row by row. Safe to run again.

-- Indexes for the lookups the screens and the security rules repeat most
create index if not exists guardians_student on guardians (student_id);
create index if not exists guardians_parent on guardians (parent_id);
create index if not exists user_roles_user_role on user_roles (user_id, role);
create index if not exists scores_class_term on scores (class_id, term_id);
create index if not exists scores_student_term on scores (student_id, term_id);
create index if not exists students_status on students (status);
create index if not exists student_fee_lines_student_term on student_fee_lines (student_id, term_id);
create index if not exists subject_inactivity_subject on subject_inactivity (subject_id, class_id);

-- Needs-a-teacher list: one pass, no per-pair function calls
create or replace function results_blockers(p_term uuid, p_section school_section) returns table (class_id uuid, class_name text, subject_id uuid, subject_name text, problem text)
language sql stable security definer set search_path=public as $$
  with y as (select year_id from terms where id = p_term)
  select c.id, c.name, null::uuid, null::text, 'No class teacher is assigned.' from classes c
   where c.section = p_section and p_section = 'basic' and not exists (select 1 from class_teachers t where t.class_id = c.id)
  union all
  select c.id, c.name, s.id, s.name, 'No subject teacher is assigned.' from classes c join subjects s on c.sub_section = any(s.sub_sections)
   where c.section = p_section and p_section = 'secondary'
     and not exists (select 1 from subject_inactivity i where i.subject_id = s.id and i.class_id = c.id and i.year_id = (select year_id from y) and (i.term_id is null or i.term_id = p_term))
     and not exists (select 1 from class_subject_teachers x where x.class_id = c.id and x.subject_id = s.id)
  order by 2, 4 $$;

create or replace function class_subject_averages(p_term uuid, p_class uuid) returns table (subject_id uuid, average numeric)
language sql stable security definer set search_path=public as $$
  with y as (select year_id, is_active from terms where id = p_term)
  select x.subject_id, round(avg(x.ca1 + x.ca2 + x.exam), 1)
  from scores x join students s on s.id = x.student_id
  where x.term_id = p_term and x.class_id = p_class and s.status = 'active' and (select is_active from y)
    and not exists (select 1 from term_exclusions e where e.student_id = s.id and e.term_id = p_term)
    and not exists (select 1 from subject_inactivity i where i.subject_id = x.subject_id and i.class_id = p_class and i.year_id = (select year_id from y) and (i.term_id is null or i.term_id = p_term))
    and (can_view_class(p_class) or leads_class(p_class) or exists (select 1 from scores z where z.term_id = p_term and z.class_id = p_class and parent_of(z.student_id)))
  group by x.subject_id $$;

-- The dashboard reads every score of a term: the permission and term checks now run once, not once per row
create or replace function dashboard_rows(p_term uuid)
returns table (student_id uuid, student_name text, gender text, photo_url text, class_name text, section school_section,
               sub_section sub_section_name, subject_name text, total numeric)
language sql stable security definer set search_path=public as $$
  with y as (select year_id, is_active from terms where id = p_term),
       ok as (select e as section from unnest(enum_range(null::school_section)) e where can_view_section(e))
  select s.id, s.last_name||' '||s.first_name, s.gender, s.photo_url, c.name, c.section, c.sub_section, sub.name, (x.ca1+x.ca2+x.exam)
  from scores x join students s on s.id=x.student_id join classes c on c.id=x.class_id join subjects sub on sub.id=x.subject_id
  where x.term_id=p_term and s.status='active' and (select is_active from y)
    and c.section in (select section from ok)
    and not exists (select 1 from term_exclusions e where e.student_id = s.id and e.term_id = p_term)
    and not exists (select 1 from subject_inactivity i where i.subject_id = x.subject_id and i.class_id = x.class_id and i.year_id = (select year_id from y) and (i.term_id is null or i.term_id = p_term)) $$;

-- Sheets and CA forms: the "is this subject off" test is one join
create or replace function class_active_subjects(p_term uuid, p_class uuid) returns table (subject_id uuid, subject_name text)
language sql stable security definer set search_path=public as $$
  with y as (select year_id from terms where id = p_term)
  select s.id, s.name from classes c join subjects s on c.sub_section = any(s.sub_sections)
  where c.id = p_class
    and not exists (select 1 from subject_inactivity i where i.subject_id = s.id and i.class_id = c.id and i.year_id = (select year_id from y) and (i.term_id is null or i.term_id = p_term))
    and (c.section = 'basic' or exists (select 1 from class_subject_teachers x where x.class_id = c.id and x.subject_id = s.id))
    and (can_view_class(p_class) or leads_class(p_class) or teaches_class(p_class) or parent_of_class(p_class))
  order by s.name $$;

analyze;

-- ======================================================================
-- visibility roles debts
-- ======================================================================
-- Safe to run again.
--   1. "View the system as one of my roles": the database itself narrows a user with several roles to the one they picked.
--   2. Subjects can be offered in chosen classes only, not just whole sub-sections, and are only visible where they concern you.
--   3. Every filled CA sheet is recorded; admin, exam officers (their section) and the person who filled it can see it.
--   4. Brought-forward debts always become debt records (one place, consistent with the student's record).
-- Row level security stays ON for every table; every new table has its own policies.

begin;

-- ======================= 1. Active role ("view as") enforced in RLS =======================
-- The app sends the picked role in the request header x-active-role (PostgREST exposes it as request.headers).
-- No header, "all", or a role the user does not hold = all the roles the user really has (the header can only NARROW access, never widen it).
create or replace function active_role() returns text language plpgsql stable security definer set search_path = public as $$
declare h text; v text;
begin
  h := nullif(current_setting('request.headers', true), '');
  if h is null then return null; end if;
  v := lower(nullif(btrim(h::json ->> 'x-active-role'), ''));
  if v is null or v = 'all' then return null; end if;
  if exists (select 1 from user_roles ur where ur.user_id = auth.uid() and ur.role::text = v) then return v; end if;
  return null;
end $$;

-- Does the signed-in user hold role r, and is it one of the roles currently in use?
create or replace function role_active(r app_role) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from user_roles ur where ur.user_id = auth.uid() and ur.role = r
                 and ur.role::text = coalesce(active_role(), ur.role::text)) $$;

-- Same, for roles that belong to a section (exam officer, principal, headmaster, teachers)
create or replace function role_in_section(rs app_role[], s school_section) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from user_roles ur where ur.user_id = auth.uid() and ur.role = any(rs) and ur.section = s
                 and ur.role::text = coalesce(active_role(), ur.role::text)) $$;

-- The roles the user is acting under right now (for the app and for checks)
create or replace function effective_roles() returns table (role app_role, section school_section) language sql stable security definer set search_path = public as $$
  select ur.role, ur.section from user_roles ur where ur.user_id = auth.uid() and ur.role::text = coalesce(active_role(), ur.role::text) $$;

-- Every access helper now goes through role_active / role_in_section, so every policy that uses them follows the picked role.
create or replace function has_role(r app_role) returns boolean language sql stable security definer set search_path = public as
$$ select role_active(r) $$;
create or replace function is_admin() returns boolean language sql stable security definer set search_path = public as
$$ select role_active('admin') $$;
create or replace function can_manage_section(s school_section) returns boolean language sql stable security definer set search_path = public as
$$ select is_admin() or role_in_section(array['exam_officer']::app_role[], s) $$;
create or replace function can_view_section(s school_section) returns boolean language sql stable security definer set search_path = public as
$$ select is_admin() or role_active('board_member') or role_in_section(array['exam_officer','principal','headmaster']::app_role[], s) $$;
create or replace function can_view_fees(s school_section) returns boolean language sql stable security definer set search_path = public as
$$ select is_admin() or role_active('bursar') or role_in_section(array['exam_officer','principal','headmaster']::app_role[], s) $$;
create or replace function fee_writer(lv smallint, sec school_section, cls uuid) returns boolean language sql stable security definer set search_path = public as $$
  select case lv
    when 1 then role_active('bursar')
    when 2 then role_in_section(array['principal','headmaster']::app_role[], sec)
    when 3 then leads_class(cls)
    else false end $$;

-- Class teachers act only while the class teacher role is in use; subject teachers only as subject teachers; parents only as parents.
create or replace function leads_class(p_class uuid) returns boolean language sql stable security definer set search_path = public as
$$ select role_active('class_teacher') and exists (select 1 from class_teachers where class_id = p_class and teacher_id = auth.uid()) $$;
create or replace function is_first_teacher(p_class uuid) returns boolean language sql stable security definer set search_path = public as
$$ select role_active('class_teacher') and exists (select 1 from class_teachers where class_id = p_class and teacher_id = auth.uid() and position = 1) $$;
create or replace function leads_student(p_student uuid) returns boolean language sql stable security definer set search_path = public as
$$ select role_active('class_teacher') and exists (select 1 from students s join class_teachers t on t.class_id = s.class_id where s.id = p_student and t.teacher_id = auth.uid()) $$;
create or replace function first_teacher_of_student(p_student uuid) returns boolean language sql stable security definer set search_path = public as
$$ select role_active('class_teacher') and exists (select 1 from students s join class_teachers t on t.class_id = s.class_id where s.id = p_student and t.teacher_id = auth.uid() and t.position = 1) $$;
create or replace function leads_in_section(s school_section) returns boolean language sql stable security definer set search_path = public as
$$ select role_active('class_teacher') and exists (select 1 from class_teachers t join classes c on c.id = t.class_id where c.section = s and t.teacher_id = auth.uid()) $$;
create or replace function teaches_student(p_student uuid, p_subject uuid) returns boolean language sql stable security definer set search_path = public as
$$ select role_active('subject_teacher') and exists (select 1 from students s join class_subject_teachers x on x.class_id = s.class_id
   where s.id = p_student and x.subject_id = p_subject and x.teacher_id = auth.uid()) $$;
create or replace function teaches_class(p uuid) returns boolean language sql stable security definer set search_path = public as
$$ select role_active('subject_teacher') and exists (select 1 from class_subject_teachers where class_id = p and teacher_id = auth.uid()) $$;
create or replace function parent_of(p_student uuid) returns boolean language sql stable security definer set search_path = public as
$$ select role_active('parent') and exists (select 1 from guardians where student_id = p_student and parent_id = auth.uid()) $$;
create or replace function parent_of_class(p uuid) returns boolean language sql stable security definer set search_path = public as
$$ select role_active('parent') and exists (select 1 from students s join guardians g on g.student_id = s.id where s.class_id = p and g.parent_id = auth.uid()) $$;
create or replace function parent_sees_fee(p_section school_section, p_class uuid, p_level smallint) returns boolean language sql stable security definer set search_path = public as $$
  select role_active('parent') and exists (select 1 from guardians g join students s on s.id = g.student_id join classes c on c.id = s.class_id
    where g.parent_id = auth.uid() and c.section = p_section and (p_level < 3 or s.class_id = p_class)) $$;
create or replace function can_read_newsletter(sec school_section) returns boolean language sql stable security definer set search_path = public as $$
  select (sec is null and auth.uid() is not null) or is_admin() or role_active('board_member')
    or exists (select 1 from effective_roles() m where m.section = sec)
    or (role_active('parent') and exists (select 1 from guardians g join students s on s.id = g.student_id join classes c on c.id = s.class_id where g.parent_id = auth.uid() and c.section = sec)) $$;
create or replace function can_manage_subject(subs sub_section_name[]) returns boolean language sql stable security definer set search_path = public as $$
  select is_admin() or (cardinality(subs) > 0 and exists (
    select 1 from user_roles ur where ur.user_id = auth.uid() and ur.role = 'exam_officer'
      and ur.role::text = coalesce(active_role(), ur.role::text)
      and not exists (select 1 from unnest(subs) u where section_of_sub(u) <> ur.section))) $$;

-- Policies that named the signed-in user directly
drop policy if exists "guardians read" on guardians;
create policy "guardians read" on guardians for select using ((parent_id = auth.uid() and role_active('parent')) or is_admin() or manages_student(student_id));
drop policy if exists "assign read" on class_subject_teachers;
create policy "assign read" on class_subject_teachers for select using ((teacher_id = auth.uid() and role_active('subject_teacher')) or can_view_class(class_id) or leads_class(class_id));
drop policy if exists "class teachers read" on class_teachers;
create policy "class teachers read" on class_teachers for select using ((teacher_id = auth.uid() and role_active('class_teacher')) or can_view_class(class_id) or leads_class(class_id));

-- Functions that looked at the caller's roles directly
create or replace function matching_parents() returns table (parent_id uuid, parent_name text, email text, phone text, children int, also_staff boolean)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.email, p.phone,
         (select count(*) from guardians g where g.parent_id = p.id and (is_admin() or manages_student(g.student_id)))::int,
         exists (select 1 from user_roles s where s.user_id = p.id and s.role in ('class_teacher','subject_teacher','exam_officer','principal','headmaster'))
  from profiles p join user_roles ur on ur.user_id = p.id and ur.role = 'parent'
  where is_admin() or (
    role_active('exam_officer')
    and (not exists (select 1 from guardians g where g.parent_id = p.id)
         or exists (select 1 from guardians g where g.parent_id = p.id and manages_student(g.student_id))))
  order by p.full_name nulls last, p.email $$;

create or replace function set_stamp(p_section school_section, p_stamp_url text, p_signature_url text, p_layout jsonb) returns void language plpgsql security definer set search_path = public as $$
begin
  if not (is_admin() or role_in_section(array[(case p_section when 'basic' then 'headmaster' else 'principal' end)::app_role], p_section)) then
    raise exception 'Only the % or the admin can change this stamp.', case p_section when 'basic' then 'headmaster or headmistress' else 'principal' end; end if;
  if p_stamp_url is not null and (p_stamp_url !~ '^https://' or char_length(p_stamp_url) > 500) then raise exception 'The stamp link is not valid.'; end if;
  if p_signature_url is not null and (p_signature_url !~ '^https://' or char_length(p_signature_url) > 500) then raise exception 'The signature link is not valid.'; end if;
  if p_layout is not null and (jsonb_typeof(p_layout) <> 'object' or char_length(p_layout::text) > 600) then raise exception 'The stamp layout is not valid.'; end if;
  if p_stamp_url is not null then insert into site_settings (key, value) values ('stamp_' || p_section, p_stamp_url) on conflict (key) do update set value = excluded.value, updated_at = now(); end if;
  if p_signature_url is not null then insert into site_settings (key, value) values ('stamp_signature_' || p_section, p_signature_url) on conflict (key) do update set value = excluded.value, updated_at = now(); end if;
  if p_layout is not null then insert into site_settings (key, value) values ('stamp_layout_' || p_section, p_layout::text) on conflict (key) do update set value = excluded.value, updated_at = now(); end if;
end $$;

-- ======================= 2. Subjects offered in chosen classes (or whole sub-sections), visible only where they concern you =======================
-- A subject with NO rows here is offered in every class of its sub-sections (the old behaviour).
-- A subject WITH rows here is offered only in those classes (each must be in one of the subject's sub-sections).
create table if not exists subject_classes (
  subject_id uuid not null references subjects(id) on delete cascade,
  class_id uuid not null references classes(id) on delete cascade,
  primary key (subject_id, class_id)
);
create index if not exists subject_classes_class on subject_classes (class_id);
alter table subject_classes enable row level security;

create or replace function subject_offered(p_subject uuid, p_class uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from subjects s join classes c on c.id = p_class
                 where s.id = p_subject and c.sub_section = any(s.sub_sections)
                   and (not exists (select 1 from subject_classes k where k.subject_id = s.id)
                        or exists (select 1 from subject_classes k where k.subject_id = s.id and k.class_id = c.id))) $$;

create or replace function can_manage_subject_id(p_subject uuid) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select can_manage_subject(sub_sections) from subjects where id = p_subject), false) $$;

-- Who sees a subject: admin, board, bursar: all. Exam officer, principal, headmaster: subjects offered in a class of their section.
-- Class teacher: subjects offered in their class. Subject teacher: subjects offered in classes they teach. Parent: subjects offered in their child's class.
create or replace function can_see_subject_id(p_subject uuid) returns boolean language sql stable security definer set search_path = public as $$
  select is_admin() or role_active('board_member') or role_active('bursar')
    or exists (select 1 from classes c where subject_offered(p_subject, c.id) and (
         role_in_section(array['exam_officer','principal','headmaster']::app_role[], c.section)
         or (role_active('class_teacher') and exists (select 1 from class_teachers t where t.class_id = c.id and t.teacher_id = auth.uid()))
         or (role_active('subject_teacher') and exists (select 1 from class_subject_teachers x where x.class_id = c.id and x.teacher_id = auth.uid()))
         or (role_active('parent') and exists (select 1 from students st join guardians g on g.student_id = st.id where st.class_id = c.id and g.parent_id = auth.uid())))) $$;

drop policy if exists "subjects read" on subjects;
create policy "subjects read" on subjects for select using (can_see_subject_id(id));
drop function if exists can_see_subject(sub_section_name[]);

drop policy if exists "subject classes read" on subject_classes;
create policy "subject classes read" on subject_classes for select using (
  can_manage_class(class_id) or can_view_class(class_id) or leads_class(class_id) or teaches_class(class_id) or parent_of_class(class_id));
drop policy if exists "subject classes write" on subject_classes;
create policy "subject classes write" on subject_classes for all
  using (can_manage_class(class_id) and can_manage_subject_id(subject_id))
  with check (can_manage_class(class_id) and can_manage_subject_id(subject_id));

create or replace function check_subject_class_member() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from classes c join subjects s on s.id = new.subject_id where c.id = new.class_id and c.sub_section = any(s.sub_sections)) then
    raise exception 'That class is not in a sub-section where this subject is taught. Add the sub-section to the subject first.'; end if;
  return new;
end $$;
drop trigger if exists trg_subject_class_member on subject_classes;
create trigger trg_subject_class_member before insert or update on subject_classes for each row execute function check_subject_class_member();

-- Checked at the end of the change (deferred), so replacing the whole list in one go does not fail half-way
create or replace function check_subject_class_assignments() returns trigger language plpgsql security definer set search_path = public as $$
declare sid uuid := coalesce(new.subject_id, old.subject_id); bad text;
begin
  if not exists (select 1 from subjects where id = sid) then return null; end if;
  select c.name into bad from class_subject_teachers x join classes c on c.id = x.class_id where x.subject_id = sid and not subject_offered(sid, c.id) limit 1;
  if bad is not null then raise exception '% still has a teacher assigned for this subject. Remove that assignment first.', bad; end if;
  return null;
end $$;
drop trigger if exists trg_subject_class_assign on subject_classes;
create constraint trigger trg_subject_class_assign after insert or update or delete on subject_classes deferrable initially deferred
  for each row execute function check_subject_class_assignments();
drop trigger if exists audit_subject_classes on subject_classes;
create trigger audit_subject_classes after insert or update or delete on subject_classes for each row execute function audit_row();

-- Replace the class list of a subject in one step (runs as the caller, so the policies above decide). Empty list = every class of its sub-sections.
create or replace function set_subject_classes(p_subject uuid, p_classes uuid[]) returns int language plpgsql set search_path = public as $$
declare n int := 0; c uuid;
begin
  if not can_manage_subject_id(p_subject) then raise exception 'You cannot change where this subject is offered.'; end if;
  delete from subject_classes where subject_id = p_subject;
  foreach c in array coalesce((select array_agg(distinct x) from unnest(p_classes) x), '{}'::uuid[]) loop
    insert into subject_classes (subject_id, class_id) values (p_subject, c); n := n + 1;
  end loop;
  set constraints trg_subject_class_assign immediate;
  return n;
end $$;

-- A subject can only go to a class that offers it; removing a sub-section is refused while a class limit or a teacher still depends on it
create or replace function check_subject_assignment() returns trigger language plpgsql security definer set search_path = public as $$
declare csec school_section;
begin
  select section into csec from classes where id = new.class_id;
  if not subject_offered(new.subject_id, new.class_id) then
    raise exception 'This subject is not offered in this class. Offer it to the class (or its sub-section) first.'; end if;
  if not exists (select 1 from user_roles where user_id = new.teacher_id and role = 'subject_teacher' and section = csec)
  then raise exception 'Teacher is not a subject teacher in the % section (no teaching across sections)', csec; end if;
  return new;
end $$;
create or replace function check_subject_update() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from class_subject_teachers x join classes c on c.id = x.class_id
             where x.subject_id = new.id and not (c.sub_section = any(new.sub_sections))) then
    raise exception 'A class in a sub-section you are removing still has this subject assigned. Remove that assignment first.';
  end if;
  if exists (select 1 from subject_classes k join classes c on c.id = k.class_id where k.subject_id = new.id and not (c.sub_section = any(new.sub_sections))) then
    raise exception 'This subject is limited to a class in a sub-section you are removing. Change the classes it is offered in first.';
  end if;
  return new;
end $$;

-- Every place that decided "which classes take this subject" now honours the class list
create or replace function class_active_subjects(p_term uuid, p_class uuid) returns table (subject_id uuid, subject_name text)
language sql stable security definer set search_path = public as $$
  with y as (select year_id from terms where id = p_term)
  select s.id, s.name from classes c join subjects s on c.sub_section = any(s.sub_sections)
  where c.id = p_class
    and (not exists (select 1 from subject_classes k where k.subject_id = s.id) or exists (select 1 from subject_classes k where k.subject_id = s.id and k.class_id = c.id))
    and not exists (select 1 from subject_inactivity i where i.subject_id = s.id and i.class_id = c.id and i.year_id = (select year_id from y) and (i.term_id is null or i.term_id = p_term))
    and (c.section = 'basic' or exists (select 1 from class_subject_teachers x where x.class_id = c.id and x.subject_id = s.id))
    and (can_view_class(p_class) or leads_class(p_class) or teaches_class(p_class) or parent_of_class(p_class))
  order by s.name $$;

create or replace function results_blockers(p_term uuid, p_section school_section) returns table (class_id uuid, class_name text, subject_id uuid, subject_name text, problem text)
language sql stable security definer set search_path = public as $$
  with y as (select year_id from terms where id = p_term)
  select c.id, c.name, null::uuid, null::text, 'No class teacher is assigned.' from classes c
   where c.section = p_section and p_section = 'basic' and not exists (select 1 from class_teachers t where t.class_id = c.id)
  union all
  select c.id, c.name, s.id, s.name, 'No subject teacher is assigned.' from classes c join subjects s on c.sub_section = any(s.sub_sections)
   where c.section = p_section and p_section = 'secondary'
     and (not exists (select 1 from subject_classes k where k.subject_id = s.id) or exists (select 1 from subject_classes k where k.subject_id = s.id and k.class_id = c.id))
     and not exists (select 1 from subject_inactivity i where i.subject_id = s.id and i.class_id = c.id and i.year_id = (select year_id from y) and (i.term_id is null or i.term_id = p_term))
     and not exists (select 1 from class_subject_teachers x where x.class_id = c.id and x.subject_id = s.id)
  order by 2, 4 $$;

-- Switching subjects off only touches classes that offer them
create or replace function set_subject_inactivity(p_subjects uuid[], p_classes uuid[], p_year uuid, p_term uuid, p_inactive boolean, p_reason text default null) returns int
language plpgsql security definer set search_path=public as $$
declare c uuid; s uuid; n int := 0; cs sub_section_name;
begin
  if p_subjects is null or cardinality(p_subjects) = 0 or p_classes is null or cardinality(p_classes) = 0 then raise exception 'Choose at least one subject and one class.'; end if;
  if p_term is not null and not exists (select 1 from terms where id = p_term and year_id = p_year) then raise exception 'That term does not belong to the chosen session.'; end if;
  foreach c in array p_classes loop
    if not can_manage_class(c) then raise exception 'You can only change classes in your own section.'; end if;
    select sub_section into cs from classes where id = c;
    foreach s in array p_subjects loop
      if not subject_offered(s, c) then continue; end if;
      if p_inactive then
        if p_term is null then delete from subject_inactivity where subject_id = s and class_id = c and year_id = p_year; end if;
        insert into subject_inactivity (subject_id, class_id, year_id, term_id, reason, created_by) values (s, c, p_year, p_term, left(p_reason, 200), auth.uid())
          on conflict (subject_id, class_id, year_id, coalesce(term_id, '00000000-0000-0000-0000-000000000000'::uuid)) do update set reason = excluded.reason;
      else
        if p_term is null then delete from subject_inactivity where subject_id = s and class_id = c and year_id = p_year;
        else
          if exists (select 1 from subject_inactivity where subject_id = s and class_id = c and year_id = p_year and term_id is null) then
            raise exception 'A subject switched off for the whole session must be switched back on for the whole session.'; end if;
          delete from subject_inactivity where subject_id = s and class_id = c and year_id = p_year and term_id = p_term;
        end if;
      end if;
      n := n + 1;
    end loop;
  end loop;
  return n;
end $$;

-- ======================= 3. Filled CA sheets: recorded, and visible to admin, exam officers and whoever filled them =======================
-- One row each time a sheet is saved (so every person who filled or corrected a sheet is on record). Rows are written only by save_scores.
create table if not exists ca_submissions (
  id uuid primary key default gen_random_uuid(),
  term_id uuid not null references terms(id) on delete cascade,
  class_id uuid not null references classes(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  submitted_by uuid references profiles(id) on delete set null,
  submitted_as app_role,                       -- the role the sheet was filled under (null for sheets saved before this existed)
  student_count int not null check (student_count >= 0),
  submitted_at timestamptz not null default now()
);
create index if not exists ca_sub_sheet on ca_submissions (term_id, class_id, subject_id, submitted_at desc);
create index if not exists ca_sub_by on ca_submissions (submitted_by, term_id, class_id, subject_id);
alter table ca_submissions enable row level security;

create or replace function filled_sheet(p_term uuid, p_class uuid, p_subject uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from ca_submissions c where c.term_id = p_term and c.class_id = p_class and c.subject_id = p_subject
                   and c.submitted_by = auth.uid() and (c.submitted_as is null or role_active(c.submitted_as))) $$;

drop policy if exists "ca submissions read" on ca_submissions;
create policy "ca submissions read" on ca_submissions for select using (
  can_manage_class(class_id) or (submitted_by = auth.uid() and (submitted_as is null or role_active(submitted_as))));
-- no insert / update / delete policies: nobody writes here directly

-- Records are never edited. (The one allowed change is the database clearing the name when a user account is deleted.)
create or replace function ca_submissions_immutable() returns trigger language plpgsql as $$
begin
  if new.submitted_by is null
     and (new.term_id, new.class_id, new.subject_id, new.submitted_as, new.student_count, new.submitted_at)
         is not distinct from (old.term_id, old.class_id, old.subject_id, old.submitted_as, old.student_count, old.submitted_at) then
    return new; end if;
  raise exception 'A CA submission record cannot be edited.';
end $$;
drop trigger if exists trg_ca_sub_immutable on ca_submissions;
create trigger trg_ca_sub_immutable before update on ca_submissions for each row execute function ca_submissions_immutable();

-- The person who filled a sheet can always read the sheet's scores, even if they are later moved to another class or subject
drop policy if exists "score filler read" on scores;
create policy "score filler read" on scores for select using (filled_sheet(term_id, class_id, subject_id));

-- Sheets saved before this phase: one record per sheet and last editor
insert into ca_submissions (term_id, class_id, subject_id, submitted_by, student_count)
select x.term_id, x.class_id, x.subject_id, x.updated_by, count(*)
from scores x
where x.class_id is not null and not exists (select 1 from ca_submissions)
group by x.term_id, x.class_id, x.subject_id, x.updated_by;

-- save_scores: same rules as before (all or nothing, every box filled), now records who filled the sheet and under which role
create or replace function save_scores(p_term uuid, p_class uuid, p_subject uuid, p_rows jsonb) returns int language plpgsql security definer set search_path=public as $$
declare r jsonb; sid uuid; a numeric; b numeric; x numeric; eligible uuid[]; given uuid[] := '{}'; n int := 0; sec school_section := class_section(p_class); as_role app_role;
begin
  if not exists (select 1 from class_active_subjects(p_term, p_class) where subject_id = p_subject) then raise exception 'That subject is not taken by this class this term (not assigned, or switched off).'; end if;
  as_role := case
    when is_admin() then 'admin'::app_role
    when can_manage_class(p_class) then 'exam_officer'::app_role
    when sec = 'basic' and leads_class(p_class) then 'class_teacher'::app_role
    when role_active('subject_teacher') and exists (select 1 from class_subject_teachers where class_id = p_class and subject_id = p_subject and teacher_id = auth.uid()) then 'subject_teacher'::app_role
    else null end;
  if as_role is null then raise exception 'You are not allowed to enter scores for this subject and class'; end if;
  if not term_is_open(p_term) then raise exception 'This term is inactive. No entries can be made for it.'; end if;
  select array_agg(s.id) into eligible from students s
    where s.class_id = p_class and s.status = 'active' and not exists (select 1 from term_exclusions e where e.student_id = s.id and e.term_id = p_term);
  if eligible is null then raise exception 'No student in this class is active for this term'; end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'Invalid score sheet'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    sid := nullif(r->>'student_id', '')::uuid;
    if sid is null or not (sid = any (eligible)) then raise exception 'The sheet includes a student who is not active in this class for this term'; end if;
    if sid = any (given) then raise exception 'A student appears twice in the sheet'; end if;
    if nullif(btrim(r->>'ca1'), '') is null or nullif(btrim(r->>'ca2'), '') is null or nullif(btrim(r->>'exam'), '') is null then
      raise exception 'Every student needs a 1st CA, a 2nd CA and an exam score. Nothing was saved because at least one box is empty.'; end if;
    a := (r->>'ca1')::numeric; b := (r->>'ca2')::numeric; x := (r->>'exam')::numeric;
    if a < 0 or a > 15 or b < 0 or b > 15 or x < 0 or x > 70 then raise exception 'Scores out of range: CA must be 0 to 15 and exam 0 to 70. Nothing was saved.'; end if;
    given := given || sid;
  end loop;
  if cardinality(given) <> cardinality(eligible) then
    raise exception '% student(s) have no scores in the sheet. Every student in the class must have 1st CA, 2nd CA and exam entered. Nothing was saved.', cardinality(eligible) - cardinality(given); end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    insert into scores (student_id, subject_id, term_id, ca1, ca2, exam) values ((r->>'student_id')::uuid, p_subject, p_term, (r->>'ca1')::numeric, (r->>'ca2')::numeric, (r->>'exam')::numeric)
    on conflict (student_id, subject_id, term_id) do update set ca1 = excluded.ca1, ca2 = excluded.ca2, exam = excluded.exam;
    n := n + 1;
  end loop;
  insert into ca_submissions (term_id, class_id, subject_id, submitted_by, submitted_as, student_count) values (p_term, p_class, p_subject, auth.uid(), as_role, n);
  return n;
end $$;

-- The list of filled forms (scope is decided inside: admin all, exam officer their section, everyone else only what they filled)
create or replace function ca_forms(p_term uuid, p_class uuid default null)
returns table (submission_id uuid, term_id uuid, class_id uuid, class_name text, section school_section, subject_id uuid, subject_name text,
               submitted_by uuid, submitted_by_name text, submitted_as app_role, student_count int, submitted_at timestamptz, mine boolean)
language sql stable security definer set search_path = public as $$
  select s.id, s.term_id, s.class_id, c.name, c.section, s.subject_id, sub.name, s.submitted_by, coalesce(p.full_name, p.email), s.submitted_as,
         s.student_count, s.submitted_at, (s.submitted_by = auth.uid())
  from ca_submissions s join classes c on c.id = s.class_id join subjects sub on sub.id = s.subject_id left join profiles p on p.id = s.submitted_by
  where s.term_id = p_term and (p_class is null or s.class_id = p_class)
    and (can_manage_class(s.class_id) or (s.submitted_by = auth.uid() and (s.submitted_as is null or role_active(s.submitted_as))))
  order by s.submitted_at desc limit 500 $$;

-- One filled sheet, as saved
create or replace function ca_form_sheet(p_term uuid, p_class uuid, p_subject uuid)
returns table (student_id uuid, student_name text, admission_no text, ca1 numeric, ca2 numeric, exam numeric, total numeric, entered_by_name text)
language sql stable security definer set search_path = public as $$
  select st.id, st.last_name || ' ' || st.first_name, st.admission_no, x.ca1, x.ca2, x.exam, x.ca1 + x.ca2 + x.exam, coalesce(p.full_name, p.email)
  from scores x join students st on st.id = x.student_id left join profiles p on p.id = x.updated_by
  where x.term_id = p_term and x.class_id = p_class and x.subject_id = p_subject
    and (can_manage_class(p_class) or filled_sheet(p_term, p_class, p_subject))
  order by st.last_name, st.first_name $$;

-- ======================= 4. Brought-forward debts: one consistent record =======================
-- The term a new debt belongs to: the term that contains today; otherwise the latest term already started; otherwise the next one coming.
create or replace function current_term_id() returns uuid language sql stable security definer set search_path = public as $$
  select id from terms
  order by (current_date between starts_on and ends_on) desc, (starts_on <= current_date) desc,
           case when starts_on <= current_date then starts_on end desc nulls last, starts_on asc
  limit 1 $$;

-- Keeps the debt record equal to the student's brought-forward amount.
--  * no record yet: one is created (when no term exists yet, it is created as soon as the first term is added)
--  * record still pending: its amount follows the student's amount; amount back to zero removes it
--  * record already claimed or confirmed: left alone (the student's amount is locked, see guard_debt_change)
create or replace function ensure_bf(p_student uuid, p_term uuid default null) returns void language plpgsql security definer set search_path = public as $$
declare d numeric; l student_fee_lines%rowtype; t uuid;
begin
  select debt_forward_ngn into d from students where id = p_student;
  if d is null then return; end if;
  select * into l from student_fee_lines where student_id = p_student and kind = 'brought_forward';
  if d > 0 then
    if l.id is null then
      t := coalesce(p_term, current_term_id());
      if t is null then return; end if;
      insert into student_fee_lines (student_id, term_id, kind, title, amount_ngn) values (p_student, t, 'brought_forward', 'Balance brought forward', d)
      on conflict do nothing;
    elsif l.status = 'pending' and l.amount_ngn <> d then
      update student_fee_lines set amount_ngn = d where id = l.id;
    end if;
  elsif l.id is not null and l.status = 'pending' then
    delete from student_fee_lines where id = l.id;
  end if;
end $$;

create or replace function guard_debt_change() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.debt_forward_ngn is distinct from old.debt_forward_ngn
     and exists (select 1 from student_fee_lines where student_id = old.id and kind = 'brought_forward' and status <> 'pending') then
    raise exception 'This student''s brought-forward balance is already claimed or confirmed as paid, so the amount cannot be changed.';
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_debt on students;
create trigger trg_guard_debt before update of debt_forward_ngn on students for each row execute function guard_debt_change();

-- Students added before any term existed get their debt record when the first term is added
create or replace function trg_term_bf() returns trigger language plpgsql security definer set search_path = public as $$
declare s record;
begin
  for s in select id from students st where st.debt_forward_ngn > 0
            and not exists (select 1 from student_fee_lines l where l.student_id = st.id and l.kind = 'brought_forward') loop
    perform ensure_bf(s.id);
  end loop;
  return new;
end $$;
drop trigger if exists trg_terms_bf on terms;
create trigger trg_terms_bf after insert on terms for each row execute function trg_term_bf();

-- The ledger behind the bursar dashboard, debtor lists and PDFs. A brought-forward balance that is still unpaid is carried into every
-- later term, so it shows in the debtor list whichever term or session is chosen (once, never twice).
create or replace function fee_ledger(p_term uuid default null, p_year uuid default null)
returns table (line_id uuid, student_id uuid, student_name text, admission_no text, student_status student_status, class_id uuid, class_name text, section school_section,
               term_id uuid, term_number smallint, year_name text, kind text, level smallint, title text, amount_ngn numeric, status text,
               claimed_at timestamptz, claim_reference text, confirmed_at timestamptz, review_note text)
language sql stable security definer set search_path = public as $$
  with sel as (select t.id, t.starts_on from terms t where (p_term is null or t.id = p_term) and (p_year is null or t.year_id = p_year))
  select l.id, s.id, s.last_name || ' ' || s.first_name, s.admission_no, s.status, c.id, c.name, c.section,
         t.id, t.number, y.name, l.kind, l.level, l.title, l.amount_ngn, l.status, l.claimed_at, l.claim_reference, l.confirmed_at, l.review_note
  from student_fee_lines l join students s on s.id = l.student_id join classes c on c.id = s.class_id
  join terms t on t.id = l.term_id join academic_years y on y.id = t.year_id
  where (l.term_id in (select id from sel)
         or (l.kind = 'brought_forward' and l.status <> 'confirmed' and t.starts_on <= (select max(starts_on) from sel)))
    and (is_admin() or role_active('bursar') or can_view_fees(c.section) or leads_class(c.id)) $$;

-- Health check: every row is a problem. Admin and bursar only.
create or replace function debt_integrity_report() returns table (student_id uuid, student_name text, problem text)
language sql stable security definer set search_path = public as $$
  select s.id, s.last_name || ' ' || s.first_name, 'Brought-forward balance has no debt record'
    from students s where (is_admin() or role_active('bursar')) and s.debt_forward_ngn > 0 and exists (select 1 from terms)
     and not exists (select 1 from student_fee_lines l where l.student_id = s.id and l.kind = 'brought_forward')
  union all
  select s.id, s.last_name || ' ' || s.first_name, 'Debt record amount differs from the student''s balance brought forward'
    from students s join student_fee_lines l on l.student_id = s.id and l.kind = 'brought_forward'
    where (is_admin() or role_active('bursar')) and l.amount_ngn <> s.debt_forward_ngn
  union all
  select s.id, s.last_name || ' ' || s.first_name, 'Debt record exists but the student has no balance brought forward'
    from students s join student_fee_lines l on l.student_id = s.id and l.kind = 'brought_forward'
    where (is_admin() or role_active('bursar')) and s.debt_forward_ngn = 0 $$;

-- Re-syncs every debt record with its student; returns how many problems it cleared
create or replace function repair_debt_records() returns int language plpgsql security definer set search_path = public as $$
declare s record; before_n int; after_n int;
begin
  if not (is_admin() or role_active('bursar')) then raise exception 'Only the admin or the bursar can repair debt records.'; end if;
  select count(*) into before_n from debt_integrity_report();
  for s in select st.id from students st where st.debt_forward_ngn > 0 or exists (select 1 from student_fee_lines l where l.student_id = st.id and l.kind = 'brought_forward') loop
    perform ensure_bf(s.id);
  end loop;
  select count(*) into after_n from debt_integrity_report();
  return greatest(before_n - after_n, 0);
end $$;

-- One-time catch-up for students that already exist (the migration runs without a signed-in user, so it calls ensure_bf directly)
do $$ declare s record; begin
  for s in select st.id from students st where st.debt_forward_ngn > 0 or exists (select 1 from student_fee_lines l where l.student_id = st.id and l.kind = 'brought_forward') loop
    perform ensure_bf(s.id);
  end loop;
end $$;

-- ======================= 5. Access: only signed-in users may call the new functions (each also checks the caller's role inside) =======================
do $$ declare f text; begin
  foreach f in array array[
    'set_subject_classes(uuid,uuid[])','ca_forms(uuid,uuid)','ca_form_sheet(uuid,uuid,uuid)','effective_roles()',
    'debt_integrity_report()','repair_debt_records()','current_term_id()']
  loop execute format('revoke execute on function %s from public, anon', f); execute format('grant execute on function %s to authenticated', f); end loop;
end $$;
-- NOT revoked on purpose: role_active, role_in_section, active_role, subject_offered, can_see_subject_id, can_manage_subject_id, filled_sheet.
-- Row-level-security policies call them, and policies run for every role (including anon on public tables).

-- Make the API notice the new tables and functions straight away
notify pgrst, 'reload schema';

commit;

-- ======================================================================
-- accounts access
-- ======================================================================
begin;

-- ======================= 1-3, 6. profile columns =======================
alter table profiles add column if not exists username text;
alter table profiles add column if not exists contact_email text;
alter table profiles add column if not exists must_change_password boolean not null default false;
alter table profiles add column if not exists gender text;
alter table profiles add column if not exists created_by uuid references profiles(id) on delete set null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_username_shape') then
    alter table profiles add constraint profiles_username_shape check (username is null or username ~ '^[a-z0-9][a-z0-9._-]{3,29}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_contact_email_shape') then
    alter table profiles add constraint profiles_contact_email_shape
      check (contact_email is null or (contact_email = lower(contact_email) and char_length(contact_email) <= 254 and contact_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_gender_values') then
    alter table profiles add constraint profiles_gender_values check (gender is null or gender in ('male','female'));
  end if;
end $$;
create unique index if not exists profiles_username_key on profiles (username) where username is not null;

-- New accounts: keep the username and the "must change password" flag that the server put in the account's metadata.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare inv invites%rowtype; item jsonb; uname text := nullif(new.raw_user_meta_data->>'username', '');
begin
  insert into profiles (id, email, full_name, username, must_change_password, contact_email)
  values (new.id, lower(new.email), new.raw_user_meta_data->>'full_name', uname,
          coalesce((new.raw_user_meta_data->>'default_password')::boolean, false),
          nullif(lower(new.raw_user_meta_data->>'contact_email'), ''));
  select * into inv from invites where email = lower(new.email) and consumed_at is null;
  if found then
    for item in select * from jsonb_array_elements(inv.roles) loop
      insert into user_roles (user_id, role, section)
      values (new.id, (item->>'role')::app_role, nullif(item->>'section','')::school_section)
      on conflict do nothing;
    end loop;
    update invites set consumed_at = now() where id = inv.id;
  end if;
  return new;
end $$;

-- A person may change only: name, phone, photo, contact email, gender, and switch must_change_password OFF.
-- Never: id, email (the sign-in name), username, created_by. The server (no signed-in user) may do anything, e.g. force a password change after a reset.
create or replace function protect_profile() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or is_admin() then return new; end if;
  if new.email <> old.email or new.id <> old.id then raise exception 'Your sign-in name cannot be changed here'; end if;
  if new.username is distinct from old.username then raise exception 'Your username cannot be changed here'; end if;
  if new.created_by is distinct from old.created_by then raise exception 'Not allowed'; end if;
  if new.must_change_password and not old.must_change_password then raise exception 'Not allowed'; end if;
  return new;
end $$;

-- ======================= 4. forgot-password log (server only) =======================
create table if not exists password_resets (
  id bigint generated always as identity primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  requested_at timestamptz not null default now()
);
create index if not exists password_resets_user_time on password_resets (user_id, requested_at desc);
create index if not exists password_resets_time on password_resets (requested_at desc);
alter table password_resets enable row level security;     -- no policy at all: only the server's service-role key can read or write it
revoke all on password_resets from anon, authenticated;

-- ======================= 7. Affective and psychomotor ratings: ONLY the class teacher of the student's class may record them =======================
-- (before this, the admin and exam officers could too). Reading is unchanged; the fee gate for parents is added in a later step.
drop policy if exists "rating write" on ratings;
create policy "rating write" on ratings for all using (leads_student(student_id)) with check (leads_student(student_id));

-- ======================= 5. dashboard: admin, board, principal, headmaster only =======================
create or replace function can_view_dashboard(s school_section) returns boolean language sql stable security definer set search_path = public as
$$ select is_admin() or role_active('board_member') or role_in_section(array['principal','headmaster']::app_role[], s) $$;

do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.dashboard_rows(uuid)'::regprocedure);
  if d like '%can_view_dashboard(e)%' then return; end if;                    -- already patched
  n := replace(d, 'can_view_section(e)', 'can_view_dashboard(e)');
  if n = d then raise exception 'dashboard_rows no longer contains can_view_section(e): update this patch'; end if;
  execute n;
end $$;

commit;

-- ======================================================================
-- fees payments receipts
-- ======================================================================
begin;

-- ======================= 2a. extra-mural structures (before term_cleared uses them) =======================
alter table fee_items add column if not exists is_extramural boolean not null default false;
create unique index if not exists fee_items_extramural_one on fee_items (term_id, class_id) where is_extramural;

create table if not exists extramural_enrolment (
  student_id uuid not null references students(id) on delete cascade,
  term_id uuid not null references terms(id) on delete cascade,
  class_id uuid not null references classes(id) on delete cascade,
  created_by uuid default auth.uid() references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (student_id, term_id)
);
create index if not exists extramural_term_class on extramural_enrolment (term_id, class_id);
alter table extramural_enrolment enable row level security;
drop policy if exists "extramural read" on extramural_enrolment;
create policy "extramural read" on extramural_enrolment for select using (
  can_view_fees(class_section(class_id)) or leads_class(class_id) or parent_of(student_id));
-- no write policy: everything goes through set_extramural_students

-- ======================= 1. is the term's schedule cleared? =======================
-- Cleared = every line of that term is confirmed, any brought-forward balance is confirmed, and no fee item that applies to the child has been left un-issued.
-- (Extra-mural items count only for ticked students.) A term with nothing charged at all counts as cleared.
create or replace function term_cleared(p_student uuid, p_term uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from student_fee_lines l where l.student_id = p_student and l.status <> 'confirmed' and (l.term_id = p_term or l.kind = 'brought_forward'))
     and not exists (
       select 1 from students s join classes c on c.id = s.class_id
       join fee_items f on f.term_id = p_term and f.section = c.section and (f.level < 3 or f.class_id = s.class_id) and not f.is_extramural
       where s.id = p_student and not exists (select 1 from student_fee_lines l where l.student_id = p_student and l.fee_item_id = f.id)) $$;

-- ======================= 2b. extra-mural functions =======================
create or replace function can_set_extramural(p_class uuid) returns boolean language sql stable security definer set search_path = public as
$$ select leads_class(p_class) or can_manage_class(p_class) $$;

-- Amount for the term (Secondary form master or Basic class teacher of that class). Re-pricing updates unpaid lines only.
create or replace function set_extramural_fee(p_term uuid, p_class uuid, p_amount numeric, p_title text default 'Extra-mural lessons') returns int
language plpgsql security definer set search_path = public as $$
declare sec school_section := class_section(p_class); fid uuid; n int := 0; ttl text := left(btrim(coalesce(nullif(p_title, ''), 'Extra-mural lessons')), 100);
begin
  if not can_set_extramural(p_class) then raise exception 'Only the class teacher (form master) of this class can set its extra-mural fee'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 100000000 then raise exception 'Enter an amount above zero'; end if;
  if char_length(ttl) < 2 then raise exception 'Give the lessons a name'; end if;
  if not exists (select 1 from terms where id = p_term) then raise exception 'Choose a term'; end if;
  insert into fee_items (term_id, level, section, class_id, title, amount_ngn, is_extramural)
  values (p_term, 3, sec, p_class, ttl, p_amount, true)
  on conflict (term_id, class_id) where is_extramural do update set amount_ngn = excluded.amount_ngn, title = excluded.title
  returning id into fid;
  update student_fee_lines set amount_ngn = p_amount, title = ttl where fee_item_id = fid and status = 'pending';
  insert into student_fee_lines (student_id, term_id, fee_item_id, kind, level, title, amount_ngn)
  select e.student_id, p_term, fid, 'fee', 3, ttl, p_amount from extramural_enrolment e where e.term_id = p_term and e.class_id = p_class
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- The ticked students for the term (the whole list is sent each time). Their line is created or removed at once.
-- A line that is already awaiting confirmation or paid is never removed.
create or replace function set_extramural_students(p_term uuid, p_class uuid, p_students uuid[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare fid uuid; amt numeric; ttl text; added int := 0; removed int := 0; kept int := 0; r record;
begin
  if not can_set_extramural(p_class) then raise exception 'Only the class teacher (form master) of this class can tick students for extra-mural lessons'; end if;
  if not exists (select 1 from terms where id = p_term) then raise exception 'Choose a term'; end if;
  select id, amount_ngn, title into fid, amt, ttl from fee_items where term_id = p_term and class_id = p_class and is_extramural;
  insert into extramural_enrolment (student_id, term_id, class_id)
  select s.id, p_term, p_class from students s where s.class_id = p_class and s.status = 'active' and s.id = any (coalesce(p_students, '{}'))
  on conflict do nothing;
  get diagnostics added = row_count;
  for r in select e.student_id from extramural_enrolment e where e.term_id = p_term and e.class_id = p_class and not (e.student_id = any (coalesce(p_students, '{}'))) loop
    if exists (select 1 from student_fee_lines l where l.student_id = r.student_id and l.fee_item_id = fid and l.status <> 'pending') then kept := kept + 1;
    else
      delete from student_fee_lines where student_id = r.student_id and fee_item_id = fid and status = 'pending';
      delete from extramural_enrolment where student_id = r.student_id and term_id = p_term;
      removed := removed + 1;
    end if;
  end loop;
  if fid is not null then
    insert into student_fee_lines (student_id, term_id, fee_item_id, kind, level, title, amount_ngn)
    select e.student_id, p_term, fid, 'fee', 3, ttl, amt from extramural_enrolment e where e.term_id = p_term and e.class_id = p_class
    on conflict do nothing;
  end if;
  return jsonb_build_object('added', added, 'removed', removed, 'kept_because_paid_or_claimed', kept, 'fee_set', fid is not null);
end $$;

-- The bursar's "issue schedule" no longer gives extra-mural fees to everybody: only to ticked students.
create or replace function issue_schedule(p_term uuid, p_class uuid default null) returns int language plpgsql security definer set search_path = public as $$
declare n int; s record;
begin
  if not (is_admin() or role_active('bursar')) then raise exception 'Only the bursar can issue schedules'; end if;
  insert into student_fee_lines (student_id, term_id, fee_item_id, kind, level, title, amount_ngn)
  select st.id, p_term, f.id, 'fee', f.level, f.title, f.amount_ngn
  from students st join classes c on c.id = st.class_id
  join fee_items f on f.term_id = p_term and f.section = c.section and (f.level < 3 or f.class_id = st.class_id)
  where st.status = 'active' and (p_class is null or st.class_id = p_class)
    and (not f.is_extramural or exists (select 1 from extramural_enrolment e where e.student_id = st.id and e.term_id = p_term))
  on conflict do nothing;
  get diagnostics n = row_count;
  for s in select id from students where status = 'active' and (p_class is null or class_id = p_class) and debt_forward_ngn > 0 loop perform ensure_bf(s.id, p_term); end loop;
  return n;
end $$;

-- ======================= 3. bursar: owed balances and any child's record =======================
create or replace function owed_overview()
returns table (student_id uuid, student_name text, admission_no text, class_name text, section school_section, student_status student_status, owed numeric, bf_status text)
language sql stable security definer set search_path = public as $$
  select s.id, s.last_name || ' ' || s.first_name, s.admission_no, c.name, c.section, s.status, s.debt_forward_ngn, coalesce(l.status, 'not yet in a schedule')
  from students s join classes c on c.id = s.class_id
  left join student_fee_lines l on l.student_id = s.id and l.kind = 'brought_forward'
  where s.debt_forward_ngn > 0 and coalesce(l.status, 'pending') <> 'confirmed'
    and (is_admin() or role_active('bursar') or can_view_fees(c.section))
  order by s.last_name, s.first_name $$;

create or replace function finance_students(p_q text default null)
returns table (student_id uuid, student_name text, admission_no text, class_name text, section school_section, student_status student_status)
language sql stable security definer set search_path = public as $$
  select s.id, s.last_name || ' ' || s.first_name, s.admission_no, c.name, c.section, s.status
  from students s join classes c on c.id = s.class_id
  where (is_admin() or role_active('bursar') or can_view_fees(c.section))
    and (coalesce(btrim(p_q), '') = '' or (s.last_name || ' ' || s.first_name) ilike '%' || replace(replace(replace(btrim(p_q), '\', '\\'), '%', '\%'), '_', '\_') || '%'
         or s.admission_no ilike '%' || replace(replace(replace(btrim(p_q), '\', '\\'), '%', '\%'), '_', '\_') || '%')
  order by s.last_name, s.first_name limit 50 $$;

-- Every line of one child across every term of every session
create or replace function student_finance_record(p_student uuid)
returns table (term_id uuid, term_number smallint, year_name text, starts_on date, line_id uuid, kind text, level smallint, title text, amount_ngn numeric,
               status text, claim_reference text, confirmed_at timestamptz, review_note text, term_is_cleared boolean)
language sql stable security definer set search_path = public as $$
  select t.id, t.number, y.name, t.starts_on, l.id, l.kind, l.level, l.title, l.amount_ngn, l.status, l.claim_reference, l.confirmed_at, l.review_note, term_cleared(p_student, t.id)
  from student_fee_lines l join terms t on t.id = l.term_id join academic_years y on y.id = t.year_id
  where l.student_id = p_student and (is_admin() or role_active('bursar') or can_view_fees(student_section(p_student)) or parent_of(p_student))
  order by t.starts_on, l.kind desc, l.level, l.title $$;

-- ======================= 4. teller uploads =======================
create sequence if not exists receipt_seq;

create table if not exists payment_submissions (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null default auth.uid() references profiles(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  teller_path text not null check (char_length(teller_path) between 10 and 200 and teller_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]+$' and teller_path !~ '\.\.'),   -- a PATH in storage, never the picture itself
  reference text not null check (char_length(btrim(reference)) between 3 and 80),
  amount_ngn numeric(12,2) check (amount_ngn is null or amount_ngn > 0),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
  review_note text check (char_length(review_note) <= 200),
  reviewed_by uuid references profiles(id) on delete set null,
  reviewed_at timestamptz,
  receipt_no text unique,
  created_at timestamptz not null default now()
);
create unique index if not exists payment_sub_reference on payment_submissions (lower(btrim(reference))) where status <> 'rejected';
create index if not exists payment_sub_status on payment_submissions (status, created_at desc);
create index if not exists payment_sub_student on payment_submissions (student_id, created_at desc);
create table if not exists payment_submission_lines (
  submission_id uuid not null references payment_submissions(id) on delete cascade,
  line_id uuid not null references student_fee_lines(id) on delete cascade,
  primary key (submission_id, line_id)
);
create index if not exists payment_sub_lines_line on payment_submission_lines (line_id);
alter table payment_submissions enable row level security;
alter table payment_submission_lines enable row level security;
drop policy if exists "submissions read" on payment_submissions;
create policy "submissions read" on payment_submissions for select using (parent_of(student_id) or is_admin() or role_active('bursar'));
drop policy if exists "submission lines read" on payment_submission_lines;
create policy "submission lines read" on payment_submission_lines for select using (exists (select 1 from payment_submissions p where p.id = submission_id));
-- no write policies: parents write through submit_payment, the bursar through review_submission

-- private bucket for teller photos (never public; the app shows them through short-lived signed links)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tellers', 'tellers', false, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 3145728, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];
drop policy if exists "tellers parent insert" on storage.objects;
create policy "tellers parent insert" on storage.objects for insert with check (bucket_id = 'tellers' and (storage.foldername(name))[1] = auth.uid()::text and role_active('parent'));
drop policy if exists "tellers read" on storage.objects;
create policy "tellers read" on storage.objects for select using (bucket_id = 'tellers' and ((storage.foldername(name))[1] = auth.uid()::text or is_admin() or role_active('bursar')));
-- no update or delete policy: a teller picture cannot be swapped or removed after it is sent

-- Old "just tick I paid" is closed: a payment now needs a teller picture and its number.
create or replace function claim_payment(p_lines uuid[], p_reference text default null) returns int language plpgsql security definer set search_path = public as $$
begin raise exception 'Please upload a picture of the teller and its reference number instead.'; end $$;

-- Items ticked "I paid" under the old system have no teller picture: put them back to unpaid with a note so the parent uploads one.
update student_fee_lines set status = 'pending', claimed_at = null, claimed_by = null, claim_reference = null, review_note = 'Please upload a picture of your teller and its reference number.'
where status = 'claimed' and not exists (select 1 from payment_submission_lines k where k.line_id = student_fee_lines.id);

-- Parent sends one payment: the child, the schedule items it pays for, the picture (already uploaded) and the teller reference
create or replace function submit_payment(p_student uuid, p_lines uuid[], p_path text, p_reference text, p_amount numeric default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare sid uuid; want int; have int; ref text := btrim(coalesce(p_reference, ''));
begin
  if not parent_of(p_student) then raise exception 'That child is not linked to your account'; end if;
  if p_lines is null or cardinality(p_lines) = 0 then raise exception 'Tick the items this payment is for'; end if;
  if char_length(ref) < 3 then raise exception 'Enter the teller reference number'; end if;
  if p_path is null or split_part(p_path, '/', 1) <> auth.uid()::text then raise exception 'Invalid teller picture'; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'tellers' and name = p_path) then raise exception 'The teller picture did not upload. Try again.'; end if;
  select count(distinct x) into want from unnest(p_lines) x;
  select count(*) into have from student_fee_lines l where l.id = any (p_lines) and l.student_id = p_student and l.status = 'pending';
  if have <> want then raise exception 'Some of those items are already paid, awaiting the bursar, or are not this child''s'; end if;
  begin
    insert into payment_submissions (parent_id, student_id, teller_path, reference, amount_ngn) values (auth.uid(), p_student, p_path, left(ref, 80), p_amount) returning id into sid;
  exception when unique_violation then raise exception 'That teller or reference number has already been submitted'; end;
  insert into payment_submission_lines (submission_id, line_id) select sid, x from (select distinct unnest(p_lines) x) q;
  update student_fee_lines set status = 'claimed', claimed_at = now(), claimed_by = auth.uid(), claim_reference = left(ref, 80), review_note = null where id = any (p_lines);
  return sid;
end $$;

-- Bursar: confirm (receipt number is issued at once) or reject (a reason is required; the items go back to unpaid with that note)
create or replace function review_submission(p_id uuid, p_accept boolean, p_note text default null) returns int
language plpgsql security definer set search_path = public as $$
declare s payment_submissions%rowtype; n int;
begin
  if not role_active('bursar') then raise exception 'Only the bursar can confirm or reject a payment'; end if;
  select * into s from payment_submissions where id = p_id for update;
  if not found then raise exception 'Payment not found'; end if;
  if s.status <> 'pending' then raise exception 'This payment has already been %', s.status; end if;
  if p_accept then
    update student_fee_lines set status = 'confirmed', confirmed_at = now(), confirmed_by = auth.uid(), review_note = left(p_note, 200)
    where id in (select line_id from payment_submission_lines where submission_id = p_id) and status in ('claimed', 'pending');
    get diagnostics n = row_count;
    update payment_submissions set status = 'confirmed', reviewed_by = auth.uid(), reviewed_at = now(), review_note = left(p_note, 200),
      receipt_no = 'BA-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('receipt_seq')::text, 6, '0') where id = p_id;
  else
    if char_length(btrim(coalesce(p_note, ''))) < 3 then raise exception 'Write a short reason so the parent knows why'; end if;
    update student_fee_lines set status = 'pending', claimed_at = null, claimed_by = null, claim_reference = null, review_note = left(p_note, 200)
    where id in (select line_id from payment_submission_lines where submission_id = p_id) and status = 'claimed';
    get diagnostics n = row_count;
    update payment_submissions set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), review_note = left(p_note, 200) where id = p_id;
  end if;
  return n;
end $$;

-- Bursar's queue
create or replace function bursar_submissions(p_status text default 'pending')
returns table (id uuid, status text, reference text, amount_ngn numeric, teller_path text, created_at timestamptz, reviewed_at timestamptz, review_note text, receipt_no text,
               student_id uuid, student_name text, admission_no text, class_name text, section school_section, parent_name text, items jsonb, items_total numeric)
language sql stable security definer set search_path = public as $$
  select p.id, p.status, p.reference, p.amount_ngn, p.teller_path, p.created_at, p.reviewed_at, p.review_note, p.receipt_no,
         s.id, s.last_name || ' ' || s.first_name, s.admission_no, c.name, c.section, coalesce(pr.full_name, pr.username, pr.email),
         (select coalesce(jsonb_agg(jsonb_build_object('title', l.title, 'amount', l.amount_ngn, 'term', t.number, 'year', y.name) order by l.title), '[]'::jsonb)
            from payment_submission_lines k join student_fee_lines l on l.id = k.line_id join terms t on t.id = l.term_id join academic_years y on y.id = t.year_id where k.submission_id = p.id),
         (select coalesce(sum(l.amount_ngn), 0) from payment_submission_lines k join student_fee_lines l on l.id = k.line_id where k.submission_id = p.id)
  from payment_submissions p join students s on s.id = p.student_id join classes c on c.id = s.class_id left join profiles pr on pr.id = p.parent_id
  where (is_admin() or role_active('bursar')) and (p_status is null or p_status = 'all' or p.status = p_status)
  order by p.created_at desc limit 300 $$;

-- ======================= 5. receipts =======================
-- p_kind: 'payment' (p_id = submission), 'item' (p_id = fee line), 'term' (p_id = student, p_term = term; only when the term is cleared)
create or replace function receipt_data(p_kind text, p_id uuid, p_term uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare sid uuid; items jsonb; total numeric; no text; issued timestamptz; by_name text; ref text; tid uuid; st record; tm record; parent_name text;
begin
  if p_kind = 'payment' then
    select p.student_id, p.receipt_no, p.reviewed_at, p.reference into sid, no, issued, ref from payment_submissions p where p.id = p_id and p.status = 'confirmed';
    if sid is null then raise exception 'There is no confirmed payment with that number'; end if;
    select coalesce(f.full_name, f.username), pr.full_name into by_name, parent_name from payment_submissions p left join profiles f on f.id = p.reviewed_by left join profiles pr on pr.id = p.parent_id where p.id = p_id;
  elsif p_kind = 'item' then
    select l.student_id, 'RI-' || upper(left(replace(l.id::text, '-', ''), 8)), l.confirmed_at, l.claim_reference, l.term_id into sid, no, issued, ref, tid
      from student_fee_lines l where l.id = p_id and l.status = 'confirmed';
    if sid is null then raise exception 'That item has not been paid and confirmed yet'; end if;
    select coalesce(f.full_name, f.username) into by_name from student_fee_lines l left join profiles f on f.id = l.confirmed_by where l.id = p_id;
  elsif p_kind = 'term' then
    sid := p_id; tid := p_term;
    if tid is null or not exists (select 1 from student_fee_lines where student_id = sid and term_id = tid) then raise exception 'No schedule was issued for that term'; end if;
    if not term_cleared(sid, tid) then raise exception 'A term receipt can only be issued when the whole schedule for the term is cleared'; end if;
    select max(l.confirmed_at) into issued from student_fee_lines l where l.student_id = sid and l.term_id = tid;
  else raise exception 'Unknown receipt type'; end if;

  if not (is_admin() or role_active('bursar') or parent_of(sid)) then raise exception 'You cannot open this receipt'; end if;

  select s.first_name, s.last_name, s.admission_no, c.name cname, c.section into st from students s join classes c on c.id = s.class_id where s.id = sid;
  if p_kind = 'payment' then
    select jsonb_agg(jsonb_build_object('title', l.title, 'amount', l.amount_ngn, 'level', l.level, 'kind', l.kind, 'term', t.number, 'year', y.name) order by t.starts_on, l.level, l.title), sum(l.amount_ngn),
           min(t.id::text)::uuid
      into items, total, tid from payment_submission_lines k join student_fee_lines l on l.id = k.line_id join terms t on t.id = l.term_id join academic_years y on y.id = t.year_id
      where k.submission_id = p_id and l.status = 'confirmed';
  elsif p_kind = 'item' then
    select jsonb_agg(jsonb_build_object('title', l.title, 'amount', l.amount_ngn, 'level', l.level, 'kind', l.kind, 'term', t.number, 'year', y.name)), sum(l.amount_ngn)
      into items, total from student_fee_lines l join terms t on t.id = l.term_id join academic_years y on y.id = t.year_id where l.id = p_id;
  else
    select jsonb_agg(jsonb_build_object('title', l.title, 'amount', l.amount_ngn, 'level', l.level, 'kind', l.kind, 'term', t.number, 'year', y.name) order by l.kind desc, l.level, l.title), sum(l.amount_ngn)
      into items, total from student_fee_lines l join terms t on t.id = l.term_id join academic_years y on y.id = t.year_id where l.student_id = sid and l.term_id = tid;
  end if;
  select t.number, y.name into tm from terms t join academic_years y on y.id = t.year_id where t.id = tid;
  if p_kind = 'term' then no := 'RT-' || replace(tm.name, '/', '-') || 'T' || tm.number || '-' || upper(left(replace(sid::text, '-', ''), 6)); end if;
  if p_kind <> 'payment' then select pr.full_name into parent_name from guardians g join profiles pr on pr.id = g.parent_id where g.student_id = sid and parent_of(sid) limit 1; end if;
  return jsonb_build_object('kind', p_kind, 'receipt_no', no, 'issued_at', issued, 'student', jsonb_build_object('id', sid, 'name', st.last_name || ' ' || st.first_name, 'admission_no', st.admission_no, 'class', st.cname, 'section', st.section),
    'term', case when tm.number is null then null else jsonb_build_object('number', tm.number, 'year', tm.name) end,
    'items', coalesce(items, '[]'::jsonb), 'total', coalesce(total, 0), 'confirmed_by', by_name, 'reference', ref, 'parent_name', parent_name);
end $$;

-- ======================= 6. results gate for parents =======================
create or replace function results_lock(p_student uuid, p_term uuid) returns table (cleared boolean, owed numeric)
language sql stable security definer set search_path = public as $$
  select term_cleared(p_student, p_term),
         coalesce((select sum(l.amount_ngn) from student_fee_lines l where l.student_id = p_student and l.status <> 'confirmed' and (l.term_id = p_term or l.kind = 'brought_forward')), 0)
  where is_admin() or role_active('bursar') or parent_of(p_student) or can_view_fees(student_section(p_student)) $$;

drop policy if exists "score read" on scores;
create policy "score read" on scores for select using (manages_student(student_id) or leads_student(student_id) or teaches_student(student_id, subject_id)
  or (parent_of(student_id) and term_cleared(student_id, term_id)));
drop policy if exists "att read" on attendance;
create policy "att read" on attendance for select using (manages_student(student_id) or leads_student(student_id) or (parent_of(student_id) and term_cleared(student_id, term_id)));
drop policy if exists "rating read" on ratings;
create policy "rating read" on ratings for select using (manages_student(student_id) or leads_student(student_id) or (parent_of(student_id) and term_cleared(student_id, term_id)));

do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.term_results(uuid,uuid)'::regprocedure);
  if d like '%term_cleared(sc.student_id%' then return; end if;
  n := replace(d, 'parent_of(sc.student_id)', '(parent_of(sc.student_id) and term_cleared(sc.student_id, p_term))');
  if n = d then raise exception 'term_results no longer contains parent_of(sc.student_id): update this patch'; end if;
  execute n;
end $$;

-- ======================= access: signed-in users only (each function checks the role inside) =======================
do $$ declare f text; begin
  foreach f in array array['set_extramural_fee(uuid,uuid,numeric,text)', 'set_extramural_students(uuid,uuid,uuid[])', 'owed_overview()', 'finance_students(text)', 'student_finance_record(uuid)',
    'submit_payment(uuid,uuid[],text,text,numeric)', 'review_submission(uuid,boolean,text)', 'bursar_submissions(text)', 'receipt_data(text,uuid,uuid)', 'results_lock(uuid,uuid)', 'can_set_extramural(uuid)']
  loop execute format('revoke execute on function %s from public, anon', f); execute format('grant execute on function %s to authenticated', f); end loop;
end $$;
-- term_cleared is NOT revoked: row-level-security policies call it.

notify pgrst, 'reload schema';
commit;

-- ======================================================================
-- scores heads speed
-- ======================================================================
begin;

-- ======================= 1. staged score entry =======================
create table if not exists score_drafts (
  student_id uuid not null references students(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  term_id uuid not null references terms(id) on delete cascade,
  ca1 numeric(5,2) check (ca1 between 0 and 15),
  ca2 numeric(5,2) check (ca2 between 0 and 15),
  exam numeric(5,2) check (exam between 0 and 70),
  updated_by uuid default auth.uid() references profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (student_id, subject_id, term_id)
);
create index if not exists score_drafts_term_subject on score_drafts (term_id, subject_id);
alter table score_drafts enable row level security;

-- Who may enter scores for this class and subject (the same rule save_scores uses)
create or replace function score_entry_role(p_class uuid, p_subject uuid) returns app_role
language sql stable security definer set search_path = public as $$
  select case
    when is_admin() then 'admin'::app_role
    when can_manage_class(p_class) then 'exam_officer'::app_role
    when class_section(p_class) = 'basic' and leads_class(p_class) then 'class_teacher'::app_role
    when role_active('subject_teacher') and exists (select 1 from class_subject_teachers where class_id = p_class and subject_id = p_subject and teacher_id = auth.uid()) then 'subject_teacher'::app_role
    else null end $$;

drop policy if exists "drafts read" on score_drafts;
create policy "drafts read" on score_drafts for select using (exists (select 1 from students s where s.id = score_drafts.student_id and score_entry_role(s.class_id, score_drafts.subject_id) is not null));
-- no write policy: everything goes through save_scores_stage

-- The sheet for one stage: every active student's current 1st CA, 2nd CA and exam (draft first, else the saved score)
create or replace function score_stage_sheet(p_term uuid, p_class uuid, p_subject uuid)
returns table (student_id uuid, ca1 numeric, ca2 numeric, exam numeric) language sql stable security definer set search_path = public as $$
  select s.id, coalesce(d.ca1, x.ca1), coalesce(d.ca2, x.ca2), coalesce(d.exam, x.exam)
  from students s
  left join score_drafts d on d.student_id = s.id and d.subject_id = p_subject and d.term_id = p_term
  left join scores x on x.student_id = s.id and x.subject_id = p_subject and x.term_id = p_term and d.student_id is null
  where s.class_id = p_class and s.status = 'active' and score_entry_role(p_class, p_subject) is not null
    and not exists (select 1 from term_exclusions e where e.student_id = s.id and e.term_id = p_term) $$;

-- p_stage: 'ca1' | 'ca2' | 'exam'. p_rows: [{student_id, score}] for EVERY active student of the class.
-- Order is enforced: the 2nd CA needs the 1st CA, the exam needs the 2nd CA. Re-saving an earlier stage later is allowed.
create or replace function save_scores_stage(p_term uuid, p_class uuid, p_subject uuid, p_stage text, p_rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare r jsonb; sid uuid; v numeric; mx numeric; eligible uuid[]; given uuid[] := '{}'; n int := 0; as_role app_role; c1 numeric; c2 numeric; c3 numeric; got boolean; incomplete int;
begin
  if p_stage not in ('ca1', 'ca2', 'exam') then raise exception 'Choose 1st CA, 2nd CA or Exam'; end if;
  mx := case p_stage when 'exam' then 70 else 15 end;
  as_role := score_entry_role(p_class, p_subject);
  if as_role is null then raise exception 'You are not allowed to enter scores for this subject and class'; end if;
  if not exists (select 1 from class_active_subjects(p_term, p_class) where subject_id = p_subject) then raise exception 'That subject is not taken by this class this term (not assigned, or switched off).'; end if;
  if not term_is_open(p_term) then raise exception 'This term is inactive. No entries can be made for it.'; end if;
  select array_agg(s.id) into eligible from students s where s.class_id = p_class and s.status = 'active' and not exists (select 1 from term_exclusions e where e.student_id = s.id and e.term_id = p_term);
  if eligible is null then raise exception 'No student in this class is active for this term'; end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'Invalid score sheet'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    sid := nullif(r->>'student_id', '')::uuid;
    if sid is null or not (sid = any (eligible)) then raise exception 'The sheet includes a student who is not active in this class for this term'; end if;
    if sid = any (given) then raise exception 'A student appears twice in the sheet'; end if;
    if nullif(btrim(r->>'score'), '') is null then raise exception 'Every student needs a score. Nothing was saved because at least one box is empty.'; end if;
    v := (r->>'score')::numeric;
    if v < 0 or v > mx then raise exception 'Scores out of range: this stage is 0 to %. Nothing was saved.', mx; end if;
    given := given || sid;
  end loop;
  if cardinality(given) <> cardinality(eligible) then raise exception '% student(s) have no score in the sheet. Nothing was saved.', cardinality(eligible) - cardinality(given); end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    sid := (r->>'student_id')::uuid; v := (r->>'score')::numeric;
    select d.ca1, d.ca2, d.exam into c1, c2, c3 from score_drafts d where d.student_id = sid and d.subject_id = p_subject and d.term_id = p_term;
    got := found;
    if not got then select x.ca1, x.ca2, x.exam into c1, c2, c3 from scores x where x.student_id = sid and x.subject_id = p_subject and x.term_id = p_term; end if;
    if p_stage = 'ca2' and c1 is null then raise exception 'Enter and save the 1st CA for every student before the 2nd CA. Nothing was saved.'; end if;
    if p_stage = 'exam' and (c1 is null or c2 is null) then raise exception 'Enter and save the 1st CA and 2nd CA for every student before the exam. Nothing was saved.'; end if;
    if p_stage = 'ca1' then c1 := v; elsif p_stage = 'ca2' then c2 := v; else c3 := v; end if;
    insert into score_drafts (student_id, subject_id, term_id, ca1, ca2, exam, updated_by) values (sid, p_subject, p_term, c1, c2, c3, auth.uid())
    on conflict (student_id, subject_id, term_id) do update set ca1 = excluded.ca1, ca2 = excluded.ca2, exam = excluded.exam, updated_by = auth.uid(), updated_at = now();
    if c1 is not null and c2 is not null and c3 is not null then
      insert into scores (student_id, subject_id, term_id, ca1, ca2, exam, updated_by) values (sid, p_subject, p_term, c1, c2, c3, auth.uid())
      on conflict (student_id, subject_id, term_id) do update set ca1 = excluded.ca1, ca2 = excluded.ca2, exam = excluded.exam, updated_by = auth.uid();
    end if;
    n := n + 1;
  end loop;

  -- when the exam stage is saved and every student is now complete, record the filled form (as a full sheet used to)
  if p_stage = 'exam' then
    select count(*) into incomplete from unnest(eligible) e where not exists (select 1 from scores x where x.student_id = e and x.subject_id = p_subject and x.term_id = p_term);
    if incomplete = 0 then insert into ca_submissions (term_id, class_id, subject_id, submitted_by, submitted_as, student_count) values (p_term, p_class, p_subject, auth.uid(), as_role, n); end if;
  end if;
  return n;
end $$;

-- ======================= 2. head of section for report cards =======================
create or replace function section_head(p_section school_section) returns table (full_name text, gender text, title text)
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(btrim(p.full_name), ''), p.username, ''), p.gender,
         case when p_section = 'secondary' then 'Principal'
              when p.gender = 'male' then 'Headmaster'
              when p.gender = 'female' then 'Headmistress'
              else 'Headmaster / Headmistress' end
  from user_roles r join profiles p on p.id = r.user_id
  where r.section = p_section and r.role = case when p_section = 'secondary' then 'principal'::app_role else 'headmaster'::app_role end
  order by p.full_name nulls last limit 1 $$;

-- ======================= 3. never show a username's internal alias =======================
create or replace function staff_in_section(sec school_section, r app_role)
returns table (id uuid, full_name text, email text) language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, coalesce(p.username, p.email) from profiles p join user_roles ur on ur.user_id = p.id
  where ur.role = r and ur.section = sec and can_manage_section(sec) order by p.full_name nulls last, p.email $$;
create or replace function guardian_links() returns table (parent_id uuid, parent_name text, parent_email text, student_id uuid)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, coalesce(p.contact_email, case when p.username is null then p.email end, p.username), g.student_id
  from guardians g join profiles p on p.id = g.parent_id where is_admin() or manages_student(g.student_id) $$;

-- one child's header details for finance pages and PDFs (bursar, admin, the section's finance viewers, or the child's own parent)
create or replace function student_card(p_student uuid) returns table (id uuid, first_name text, last_name text, admission_no text, class_name text, section school_section)
language sql stable security definer set search_path = public as $$
  select s.id, s.first_name, s.last_name, s.admission_no, c.name, c.section from students s join classes c on c.id = s.class_id
  where s.id = p_student and (is_admin() or role_active('bursar') or can_view_fees(c.section) or parent_of(s.id)) $$;

-- ======================= 4. speed: indexes for the busiest lookups =======================
create index if not exists scores_term_subject on scores (term_id, subject_id);
create index if not exists scores_student_term on scores (student_id, term_id);
create index if not exists attendance_term on attendance (term_id);
create index if not exists ratings_term_student on ratings (term_id, student_id);
create index if not exists students_class_status on students (class_id, status);
create index if not exists guardians_parent on guardians (parent_id);
create index if not exists guardians_student on guardians (student_id);
create index if not exists class_teachers_teacher on class_teachers (teacher_id);
create index if not exists student_fee_lines_student_term on student_fee_lines (student_id, term_id);
create index if not exists user_roles_user on user_roles (user_id);

do $$ declare f text; begin
  foreach f in array array['score_entry_role(uuid,uuid)', 'score_stage_sheet(uuid,uuid,uuid)', 'save_scores_stage(uuid,uuid,uuid,text,jsonb)', 'section_head(school_section)', 'student_card(uuid)']
  loop execute format('revoke execute on function %s from public, anon', f); execute format('grant execute on function %s to authenticated', f); end loop;
end $$;

notify pgrst, 'reload schema';
commit;
-- Refresh planner statistics after the new indexes
analyze scores; analyze students; analyze student_fee_lines;

-- ======================================================================
-- role access fixes
-- ======================================================================
begin;

-- 1. Subject teachers must see which students are inactive for a term, or their score sheet lists students the save rule rejects.
create or replace function teaches_student_class(p_student uuid) returns boolean language sql stable security definer set search_path = public as $$
  select role_active('subject_teacher') and exists (select 1 from students s join class_subject_teachers x on x.class_id = s.class_id
    where s.id = p_student and x.teacher_id = auth.uid()) $$;

drop policy if exists "exclusions read" on term_exclusions;
create policy "exclusions read" on term_exclusions for select using (
  is_admin() or manages_student(student_id) or leads_student(student_id) or teaches_student_class(student_id)
  or parent_of(student_id) or can_view_section(student_section(student_id)));

-- 2. Principal, headmaster/headmistress and board members open report cards, so they must read attendance and ratings too
--    (admin and exam officer were already covered). Parents still need the term's fees cleared.
drop policy if exists "att read" on attendance;
create policy "att read" on attendance for select using (
  manages_student(student_id) or leads_student(student_id) or can_view_section(student_section(student_id))
  or (parent_of(student_id) and term_cleared(student_id, term_id)));
drop policy if exists "rating read" on ratings;
create policy "rating read" on ratings for select using (
  manages_student(student_id) or leads_student(student_id) or can_view_section(student_section(student_id))
  or (parent_of(student_id) and term_cleared(student_id, term_id)));

-- 3. Fee schedule pages for the bursar (who has no row access to students or classes): header details and the student list through checked functions
create or replace function fee_student(p_student uuid)
returns table (id uuid, first_name text, last_name text, admission_no text, class_id uuid, class_name text, section school_section)
language sql stable security definer set search_path = public as $$
  select s.id, s.first_name, s.last_name, s.admission_no, c.id, c.name, c.section
  from students s join classes c on c.id = s.class_id
  where s.id = p_student and (is_admin() or role_active('bursar') or can_view_fees(c.section) or leads_class(c.id) or parent_of(s.id)) $$;

create or replace function fee_students()
returns table (student_id uuid, student_name text, admission_no text, class_name text)
language sql stable security definer set search_path = public as $$
  select s.id, s.last_name || ' ' || s.first_name, s.admission_no, c.name
  from students s join classes c on c.id = s.class_id
  where s.status = 'active' and (is_admin() or role_active('bursar') or can_view_fees(c.section))
  order by s.last_name, s.first_name $$;

do $$ declare f text; begin
  foreach f in array array['fee_student(uuid)', 'fee_students()']
  loop execute format('revoke execute on function %s from public, anon', f); execute format('grant execute on function %s to authenticated', f); end loop;
end $$;
-- teaches_student_class is NOT revoked: a row-level-security policy calls it.

notify pgrst, 'reload schema';
commit;


-- ======================================================================
-- username password accounts
-- ======================================================================
-- usernames and passwords chosen by the administrator; email optional; several roles per new user.
-- Safe to run more than once.
-- Existing usernames (4 letters + 3 digits) stay valid. Nothing else in the database changes: roles were always many-per-person,
-- and the contact email was always optional and editable by the person on their own profile.
begin;

alter table profiles drop constraint if exists profiles_username_shape;
alter table profiles add constraint profiles_username_shape
  check (username is null or username ~ '^[a-z0-9][a-z0-9._-]{3,29}$');   -- 4-30 characters; lower-case letters, digits, dot, dash, underscore; never an @

-- A username must be unique ignoring case (the app stores it in lower case; this stops any other writer from slipping in "Ada.O" next to "ada.o")
create unique index if not exists profiles_username_lower_key on profiles (lower(username)) where username is not null;

notify pgrst, 'reload schema';
commit;


-- ======================================================================
-- open results locks bulk delete
-- ======================================================================
-- (1) results and report cards open even when entries are incomplete, (2) the admin can lock a term or session
-- per section (view only afterwards), (3) the admin can delete many students at once.
-- Safe to run more than once.
begin;

-- ======================= 1. results are always viewable =======================
-- Before: a section's results (and every report card) stayed hidden until every class / subject had a teacher assigned.
-- Now: results show whatever has been entered so far. Missing teachers are still listed as a warning on the Teacher assignments
-- page and on the Results page, but they no longer hide anything. (The row-level rules on who may see whose result are unchanged.)
create or replace function section_results_ready(p_term uuid, p_section school_section) returns boolean
language sql stable security definer set search_path=public as $$ select true $$;

-- ======================= 2. lock a term or a session, per section =======================
create table if not exists result_locks (
  term_id uuid not null references terms(id) on delete cascade,
  section school_section not null,
  locked_by uuid default auth.uid() references profiles(id) on delete set null,
  locked_at timestamptz not null default now(),
  reason text check (char_length(reason) <= 200),
  primary key (term_id, section)
);
alter table result_locks enable row level security;
drop policy if exists "locks read" on result_locks;
create policy "locks read" on result_locks for select to authenticated using (true);
-- no write policy: everything goes through set_results_lock
drop trigger if exists audit_result_locks on result_locks;
create trigger audit_result_locks after insert or update or delete on result_locks for each row execute function audit_row();

create or replace function results_locked(p_term uuid, p_section school_section) returns boolean
language sql stable security definer set search_path=public as $$
  select p_section is not null and exists (select 1 from result_locks where term_id = p_term and section = p_section) $$;

-- Admin only. p_scope = 'term' (p_target = term id) or 'session' (p_target = academic year id). p_section null = both sections.
-- Locking needs results to exist: a term and section with no scores yet is skipped (and it is an error if nothing at all could be locked).
create or replace function set_results_lock(p_scope text, p_target uuid, p_section school_section default null, p_locked boolean default true, p_reason text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare t record; sec school_section; secs school_section[]; newly int := 0; already int := 0; empty int := 0; removed int := 0; seen int := 0; k int;
begin
  if not is_admin() then raise exception 'Only the admin can lock or unlock results.'; end if;
  if p_scope not in ('term', 'session') then raise exception 'Choose a term or a session.'; end if;
  secs := case when p_section is null then array['basic', 'secondary']::school_section[] else array[p_section] end;
  for t in select id from terms where (p_scope = 'term' and id = p_target) or (p_scope = 'session' and year_id = p_target) loop
    seen := seen + 1;
    foreach sec in array secs loop
      if p_locked then
        if not exists (select 1 from scores x join classes c on c.id = x.class_id where x.term_id = t.id and c.section = sec) then empty := empty + 1; continue; end if;
        insert into result_locks (term_id, section, locked_by, reason) values (t.id, sec, auth.uid(), left(nullif(btrim(p_reason), ''), 200)) on conflict (term_id, section) do nothing;
        get diagnostics k = row_count; if k = 1 then newly := newly + 1; else already := already + 1; end if;
      else
        delete from result_locks where term_id = t.id and section = sec; get diagnostics k = row_count; removed := removed + k;
      end if;
    end loop;
  end loop;
  if seen = 0 then raise exception 'That term or session was not found.'; end if;
  if p_locked and newly + already = 0 then raise exception 'No results have been entered yet for the chosen term or session and section, so there is nothing to lock.'; end if;
  return jsonb_build_object('locked', newly, 'already_locked', already, 'no_results', empty, 'unlocked', removed);
end $$;

-- ---- enforcement (so it holds even if someone bypasses the screens) ----
-- scores: no new, changed or removed score in a locked term and section
create or replace function check_score_student() returns trigger language plpgsql security definer set search_path=public as $$
declare cid uuid;
begin
  cid := coalesce(new.class_id, (select class_id from students where id = new.student_id));
  if results_locked(new.term_id, class_section(cid)) or (tg_op = 'UPDATE' and results_locked(old.term_id, class_section(old.class_id))) then
    raise exception 'The results for this term are locked. They can be viewed but not changed. The admin can unlock them.'; end if;
  if not exists (select 1 from students where id = new.student_id and status = 'active') then raise exception 'Student is not active'; end if;
  if not term_is_open(new.term_id) then raise exception 'This term is inactive. No entries can be made for it.'; end if;
  if not term_is_open(new.term_id, new.student_id) then raise exception 'This term is inactive for this student. No entries can be made for it.'; end if;
  new.updated_by := auth.uid();
  if tg_op = 'INSERT' or new.class_id is null then new.class_id := (select class_id from students where id = new.student_id); end if;
  return new;
end $$;

create or replace function guard_score_delete() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if results_locked(old.term_id, class_section(old.class_id)) then
    raise exception 'The results for this term are locked, so scores cannot be removed. The admin can unlock them first.'; end if;
  return old;
end $$;
drop trigger if exists trg_score_lock_delete on scores;
create trigger trg_score_lock_delete before delete on scores for each row execute function guard_score_delete();

-- score drafts, attendance, ratings, days school opened, per-student term exclusions
create or replace function row_results_locked(p_table text, r jsonb) returns boolean language sql stable security definer set search_path=public as $$
  select results_locked((r->>'term_id')::uuid,
    case p_table when 'school_days' then (r->>'section')::school_section else student_section((r->>'student_id')::uuid) end) $$;

create or replace function guard_results_lock() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op = 'DELETE' then
    -- the yearly clean-up of old attendance and ratings (run_retention) is allowed to pass
    if current_setting('app.retention', true) = '1' then return old; end if;
    if row_results_locked(tg_table_name, to_jsonb(old)) then raise exception 'The results for this term are locked. They can be viewed but not changed. The admin can unlock them.'; end if;
    return old;
  end if;
  if row_results_locked(tg_table_name, to_jsonb(new)) or (tg_op = 'UPDATE' and row_results_locked(tg_table_name, to_jsonb(old))) then
    raise exception 'The results for this term are locked. They can be viewed but not changed. The admin can unlock them.'; end if;
  return new;
end $$;
do $$ declare t text; begin
  foreach t in array array['score_drafts', 'attendance', 'ratings', 'school_days', 'term_exclusions'] loop
    execute format('drop trigger if exists trg_results_lock on %I', t);
    execute format('create trigger trg_results_lock before insert or update or delete on %I for each row execute function guard_results_lock()', t);
  end loop; end $$;

-- switching subjects on or off changes results, so it is blocked for a locked term (or any locked term of the session)
create or replace function guard_inactivity_lock() returns trigger language plpgsql security definer set search_path=public as $$
declare r subject_inactivity;
begin
  if tg_op = 'DELETE' then r := old; else r := new; end if;
  if exists (select 1 from result_locks l join terms t on t.id = l.term_id
             where l.section = class_section(r.class_id) and t.year_id = r.year_id and (r.term_id is null or l.term_id = r.term_id)) then
    raise exception 'Results for this term or session are locked, so subjects cannot be switched on or off. The admin can unlock them first.'; end if;
  return r;
end $$;
drop trigger if exists trg_inactivity_lock on subject_inactivity;
create trigger trg_inactivity_lock before insert or update or delete on subject_inactivity for each row execute function guard_inactivity_lock();

-- making a whole term inactive/active changes every result in it
create or replace function set_term_active(p_term uuid, p_active boolean, p_reason text default null) returns void language plpgsql security definer set search_path=public as $$
begin
  if not is_admin() then raise exception 'Only the admin can change a term for all students'; end if;
  if exists (select 1 from result_locks where term_id = p_term) then raise exception 'Results for this term are locked. Unlock them first to change whether the term is active.'; end if;
  update terms set is_active = p_active, inactive_reason = case when p_active then null else left(p_reason, 200) end where id = p_term;
end $$;

-- ======================= 3. admin: delete many students at once =======================
create or replace function delete_students(p_students uuid[]) returns int language plpgsql security definer set search_path=public as $$
declare n int; locked int;
begin
  if not is_admin() then raise exception 'Only the admin can delete many students at once.'; end if;
  if p_students is null or cardinality(p_students) = 0 then raise exception 'Choose at least one student.'; end if;
  if cardinality(p_students) > 2000 then raise exception 'Delete at most 2000 students at a time.'; end if;
  select count(distinct x.student_id) into locked from scores x join classes c on c.id = x.class_id
   where x.student_id = any (p_students) and results_locked(x.term_id, c.section);
  if locked > 0 then raise exception '% of the chosen students have results in a locked term or session. Unlock it first (Lock results page), then delete.', locked; end if;
  delete from students where id = any (p_students);
  get diagnostics n = row_count;
  return n;
end $$;

do $$ declare f text; begin
  foreach f in array array['results_locked(uuid,school_section)', 'set_results_lock(text,uuid,school_section,boolean,text)', 'delete_students(uuid[])', 'section_results_ready(uuid,school_section)', 'set_term_active(uuid,boolean,text)']
  loop execute format('revoke execute on function %s from public, anon', f); execute format('grant execute on function %s to authenticated', f); end loop;
end $$;

notify pgrst, 'reload schema';
commit;

-- ======================================================================
-- role scope speed
-- ======================================================================
-- faster role checks and the indexes the row-level-security rules lean on. Safe to run more than once.
begin;

-- Same answer as before, but one plain SQL lookup instead of a procedural function. It runs for every row a policy looks at.
create or replace function active_role() returns text language sql stable security definer set search_path = public as $$
  select ur.role::text from user_roles ur
  where ur.user_id = auth.uid()
    and ur.role::text = lower(nullif(btrim(nullif(current_setting('request.headers', true), '')::json ->> 'x-active-role'), ''))
  limit 1 $$;

-- Lookups that the role helpers (teaches_class, leads_class, role_in_section, guardians, fees) run on every request
create index if not exists class_subject_teachers_teacher on class_subject_teachers (teacher_id, class_id);
create index if not exists class_subject_teachers_lookup on class_subject_teachers (class_id, subject_id, teacher_id);
create index if not exists class_teachers_teacher_class on class_teachers (teacher_id, class_id);
create index if not exists user_roles_user_role_section on user_roles (user_id, role, section);
create index if not exists payment_submissions_parent on payment_submissions (parent_id, created_at desc);
create index if not exists student_fee_lines_term_student on student_fee_lines (term_id, student_id);
create index if not exists classes_section on classes (section);
create index if not exists terms_starts on terms (starts_on desc);

analyze user_roles; analyze class_subject_teachers; analyze class_teachers; analyze classes;
notify pgrst, 'reload schema';
commit;

-- attendance domains roles
-- who may record attendance, psychomotor and affective ratings.
--   Attendance: the first class teacher / form master of the class, plus the administrator and the exam officer of that section.
--   Psychomotor and affective ratings: the class teachers / form masters of the class, plus the administrator and the exam officer of that section.
-- Nobody else (subject teachers, principal, headmaster, board, bursar, parents) may write them. Safe to run more than once.
begin;

create or replace function can_record_attendance(p_student uuid) returns boolean language sql stable security definer set search_path = public as
$$ select first_teacher_of_student(p_student) or manages_student(p_student) $$;
create or replace function can_record_domains(p_student uuid) returns boolean language sql stable security definer set search_path = public as
$$ select leads_student(p_student) or manages_student(p_student) $$;

drop policy if exists "att insert first teacher" on attendance;
drop policy if exists "att update first teacher" on attendance;
drop policy if exists "att delete first teacher" on attendance;
drop policy if exists "att write" on attendance;
create policy "att write" on attendance for all using (can_record_attendance(student_id)) with check (can_record_attendance(student_id));

drop policy if exists "rating write" on ratings;
create policy "rating write" on ratings for all using (can_record_domains(student_id)) with check (can_record_domains(student_id));

create or replace function check_attendance() returns trigger language plpgsql security definer set search_path=public as $$
declare d smallint;
begin
  if auth.uid() is not null and not can_record_attendance(new.student_id) then
    raise exception 'Only the first class teacher (or the form master) of this class, the administrator or this section''s exam officer can enter attendance.'; end if;
  if not term_is_open(new.term_id) then raise exception 'This term is inactive. No entries can be made for it.'; end if;
  if not term_is_open(new.term_id, new.student_id) then raise exception 'This term is inactive for this student. No entries can be made for it.'; end if;
  select days_open into d from school_days where term_id = new.term_id and section = student_section(new.student_id);
  if d is null then raise exception 'Set the number of times school opened for this term first'; end if;
  if new.days_present > d then raise exception 'Days present (%) cannot exceed days school opened (%)', new.days_present, d; end if;
  return new;
end $$;

create or replace function save_attendance(p_term uuid, p_class uuid, p_rows jsonb) returns int language plpgsql security definer set search_path=public as $$
declare r jsonb; n int := 0; v int;
begin
  if not (is_first_teacher(p_class) or can_manage_class(p_class)) then raise exception 'Only the first class teacher (or the form master) of this class, the administrator or this section''s exam officer can enter attendance.'; end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'Invalid attendance list'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    if not exists (select 1 from students where id = (r->>'student_id')::uuid and class_id = p_class and status = 'active') then raise exception 'The list includes a student who is not in this class.'; end if;
    if nullif(btrim(r->>'days_present'), '') is null or (r->>'days_present') !~ '^[0-9]{1,3}$' then raise exception 'Days present must be a whole number.'; end if;
    v := (r->>'days_present')::int;
    insert into attendance (student_id, term_id, days_present) values ((r->>'student_id')::uuid, p_term, v)
      on conflict (student_id, term_id) do update set days_present = excluded.days_present;
    n := n + 1;
  end loop;
  return n;
end $$;

notify pgrst, 'reload schema';
commit;

-- class teacher photos
-- class teachers / form masters may set the passport photo of students in their own class.
-- (Admission number, gender, date of birth, class, student type and money fields stay with the administrator and exam officer.)
-- Safe to run more than once.
begin;
create or replace function protect_student_fields() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if current_setting('app.rollover', true) = '1' or manages_student(old.id) then return new; end if;
  if new.admission_no is distinct from old.admission_no or new.gender <> old.gender or new.dob <> old.dob
     or new.class_id <> old.class_id
     or new.student_type <> old.student_type or new.debt_forward_ngn <> old.debt_forward_ngn
  then raise exception 'Class teachers may only edit names, status and the photo'; end if;
  return new;
end $$;
commit;

-- class teacher add students
-- a class teacher / form master may add students to their OWN class.
-- Not allowed to them: brought-forward debt (money stays with the administrator and exam officer), other classes.
-- Safe to run more than once.
begin;
drop policy if exists "students class teacher insert" on students;
create policy "students class teacher insert" on students for insert
  with check (leads_class(class_id) and coalesce(debt_forward_ngn, 0) = 0);
commit;
