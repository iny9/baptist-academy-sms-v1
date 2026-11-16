-- (attendance register). Safe to run more than once.
--
-- WHAT CHANGES
--  * Nobody types "times school opened" or "days present" any more. The class teacher / form master ticks a register twice a day (morning, afternoon).
--  * Calendar: admin and exam officers (their section) set the EXAM END DATE of each term; admin, exam officers and heads (their section) set holidays / no-school
--    ranges inside the term dates (admin may also set a holiday for every section). Weekends and holidays can never be ticked.
--  * Times school open = 2 x (school days from the term's start to the exam end date). Times present = ticks. Times absent = open - present.
--    They are copied into school_days / attendance (what report cards and PDFs already read), so results keep working untouched.
--  * Punctuality (affective domain) is set from the attendance percentage and can no longer be chosen by anybody.
--  * Weeks can be closed by the class teacher (weekly percentages for the class, boys and girls are generated); the term can be closed once every school day is saved. Both can be reopened.
--  * Heads / board / admin read everything through the att_* functions below, which check the role inside the database.
begin;

-- ---------- 0. a term has far more than 130 openings (mornings + afternoons) ----------
do $$ declare c text; begin
  for c in select conname from pg_constraint where conrelid = 'school_days'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%days_open%' loop
    execute format('alter table school_days drop constraint %I', c);
  end loop;
  alter table school_days add constraint school_days_days_open_range check (days_open between 0 and 400);
end $$;

-- ---------- 1. tables (rows hold ticks and dates only; nothing heavy) ----------
create table if not exists term_calendar (
  term_id uuid not null references terms(id) on delete cascade,
  section school_section not null,
  exam_end_on date not null,
  set_by uuid references profiles(id) on delete set null,
  set_at timestamptz not null default now(),
  primary key (term_id, section));
create table if not exists school_holidays (
  id uuid primary key default gen_random_uuid(),
  term_id uuid not null references terms(id) on delete cascade,
  section school_section,                       -- null = every section (administrator only)
  starts_on date not null,
  ends_on date not null,
  note text check (char_length(note) <= 120),
  set_by uuid references profiles(id) on delete set null,
  set_at timestamptz not null default now(),
  check (ends_on >= starts_on));
create index if not exists school_holidays_term on school_holidays (term_id);
create table if not exists attendance_marks (   -- one row = "was present" for one student, one day, one half (M morning, A afternoon)
  student_id uuid not null references students(id) on delete cascade,
  day date not null,
  half char(1) not null check (half in ('M', 'A')),
  class_id uuid not null references classes(id) on delete cascade,
  term_id uuid not null references terms(id) on delete cascade,
  primary key (student_id, day, half));
create index if not exists attendance_marks_class on attendance_marks (class_id, term_id, day);
create table if not exists attendance_sheets (  -- one row = a register was saved (the upload timestamp heads see), with headcounts by gender
  class_id uuid not null references classes(id) on delete cascade,
  term_id uuid not null references terms(id) on delete cascade,
  day date not null,
  half char(1) not null check (half in ('M', 'A')),
  saved_at timestamptz not null default now(),
  saved_by uuid references profiles(id) on delete set null,
  n_m int not null default 0, n_f int not null default 0,   -- students on the register
  p_m int not null default 0, p_f int not null default 0,   -- of them present
  primary key (class_id, day, half));
create index if not exists attendance_sheets_term on attendance_sheets (term_id, class_id);
create table if not exists attendance_weeks (   -- a row exists while the week is closed
  class_id uuid not null references classes(id) on delete cascade,
  term_id uuid not null references terms(id) on delete cascade,
  week_start date not null,                     -- the Monday
  school_days int not null, n_m int not null, n_f int not null, p_m int not null, p_f int not null,   -- n = possible ticks, p = present ticks
  pct_all numeric(5,2), pct_m numeric(5,2), pct_f numeric(5,2),
  closed_at timestamptz not null default now(),
  closed_by uuid references profiles(id) on delete set null,
  primary key (class_id, term_id, week_start));
create table if not exists attendance_term_close (   -- a row exists while the class's term register is closed
  class_id uuid not null references classes(id) on delete cascade,
  term_id uuid not null references terms(id) on delete cascade,
  closed_at timestamptz not null default now(),
  closed_by uuid references profiles(id) on delete set null,
  primary key (class_id, term_id));

-- ---------- 2. who may do what ----------
create or replace function att_today() returns date language sql stable as $$ select (now() at time zone 'Africa/Lagos')::date $$;
create or replace function can_set_calendar(s school_section) returns boolean language sql stable security definer set search_path = public as
$$ select is_admin() or role_in_section(array['exam_officer', 'principal', 'headmaster']::app_role[], s) $$;
create or replace function can_view_attendance(s school_section) returns boolean language sql stable security definer set search_path = public as
$$ select can_view_section(s) $$;

alter table term_calendar enable row level security; alter table school_holidays enable row level security; alter table attendance_marks enable row level security;
alter table attendance_sheets enable row level security; alter table attendance_weeks enable row level security; alter table attendance_term_close enable row level security;
-- read-only for the app: every write goes through the functions below (there is no insert/update/delete policy on purpose)
drop policy if exists "cal read" on term_calendar;       create policy "cal read" on term_calendar for select to authenticated using (true);
drop policy if exists "hol read" on school_holidays;     create policy "hol read" on school_holidays for select to authenticated using (true);
drop policy if exists "marks read" on attendance_marks;  create policy "marks read" on attendance_marks for select to authenticated
  using (leads_class(class_id) or can_view_attendance(class_section(class_id)) or parent_of(student_id));
drop policy if exists "sheets read" on attendance_sheets; create policy "sheets read" on attendance_sheets for select to authenticated
  using (leads_class(class_id) or can_view_attendance(class_section(class_id)));
drop policy if exists "weeks read" on attendance_weeks;  create policy "weeks read" on attendance_weeks for select to authenticated
  using (leads_class(class_id) or can_view_attendance(class_section(class_id)));
drop policy if exists "tclose read" on attendance_term_close; create policy "tclose read" on attendance_term_close for select to authenticated
  using (leads_class(class_id) or can_view_attendance(class_section(class_id)));
revoke all on term_calendar, school_holidays, attendance_marks, attendance_sheets, attendance_weeks, attendance_term_close from anon;
revoke insert, update, delete on term_calendar, school_holidays, attendance_marks, attendance_sheets, attendance_weeks, attendance_term_close from authenticated;

-- ---------- 3. the calendar maths (one definition of "a school day") ----------
create or replace function att_school_days(p_term uuid, p_section school_section) returns setof date language sql stable security definer set search_path = public as $$
  select d::date
  from terms t join term_calendar c on c.term_id = t.id and c.section = p_section,
       generate_series(t.starts_on::timestamp, least(c.exam_end_on, t.ends_on)::timestamp, interval '1 day') d
  where t.id = p_term and extract(isodow from d) < 6
    and not exists (select 1 from school_holidays h where h.term_id = p_term and (h.section is null or h.section = p_section) and d::date between h.starts_on and h.ends_on) $$;
create or replace function att_times_open(p_term uuid, p_section school_section) returns int language sql stable security definer set search_path = public as
$$ select 2 * count(*)::int from att_school_days(p_term, p_section) $$;
create or replace function att_day_problem(p_term uuid, p_section school_section, p_day date) returns text language sql stable security definer set search_path = public as $$
  select case
    when not exists (select 1 from term_calendar where term_id = p_term and section = p_section) then 'The exam end date for this term has not been set, so attendance cannot be taken yet.'
    when p_day < (select starts_on from terms where id = p_term) then 'That day is before the term begins.'
    when p_day > (select exam_end_on from term_calendar where term_id = p_term and section = p_section) then 'That day is after the exam end date.'
    when p_day > (select ends_on from terms where id = p_term) then 'That day is after the term ends.'
    when extract(isodow from p_day) >= 6 then 'Weekends are not school days.'
    when exists (select 1 from school_holidays h where h.term_id = p_term and (h.section is null or h.section = p_section) and p_day between h.starts_on and h.ends_on) then 'That day is a holiday.'
    when p_day > att_today() then 'Attendance cannot be taken for a day that has not come yet.'
  end $$;
create or replace function att_punctuality_score(p_present int, p_open int) returns int language sql immutable as $$
  select case when coalesce(p_open, 0) = 0 then null
    when p_present * 100.0 / p_open >= 95 then 5 when p_present * 100.0 / p_open >= 85 then 4
    when p_present * 100.0 / p_open >= 75 then 3 when p_present * 100.0 / p_open >= 60 then 2 else 1 end $$;

-- ---------- 4. what report cards read stays in school_days / attendance / ratings, but only these functions may write it ----------
create or replace function check_attendance() returns trigger language plpgsql security definer set search_path = public as $$
declare d smallint;
begin
  if coalesce(current_setting('app.att_sync', true), '0') <> '1' then
    raise exception 'Attendance is no longer typed in. The class teacher ticks the daily register and the totals follow.'; end if;
  select days_open into d from school_days where term_id = new.term_id and section = student_section(new.student_id);
  if d is null then raise exception 'Times school opened is not worked out yet for this term'; end if;
  if new.days_present > d then raise exception 'Days present (%) cannot exceed days school opened (%)', new.days_present, d; end if;
  return new;
end $$;
create or replace function guard_school_days() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('app.att_sync', true), '0') <> '1' then
    raise exception 'Times school opened is worked out from the calendar (term start to exam end date, without weekends and holidays). It cannot be typed.'; end if;
  return new;
end $$;
drop trigger if exists trg_school_days_sync on school_days;
create trigger trg_school_days_sync before insert or update on school_days for each row execute function guard_school_days();
create or replace function guard_punctuality() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('app.att_sync', true), '0') <> '1'
     and exists (select 1 from rating_traits t where t.id = new.trait_id and t.domain = 'affective' and t.name = 'Punctuality') then
    raise exception 'Punctuality is set from the attendance register and cannot be chosen.'; end if;
  return new;
end $$;
drop trigger if exists trg_punctuality on ratings;
create trigger trg_punctuality before insert or update on ratings for each row execute function guard_punctuality();
create or replace function save_attendance(p_term uuid, p_class uuid, p_rows jsonb) returns int language plpgsql security definer set search_path = public as $$
begin raise exception 'Attendance is taken in the daily register now (Attendance in the menu).'; end $$;

-- Recompute times open, times present and punctuality for one class and term (internal: called by the functions below)
create or replace function att_refresh_class(p_term uuid, p_class uuid) returns void language plpgsql security definer set search_path = public as $$
declare v_sec school_section; v_open int; v_trait uuid;
begin
  select section into v_sec from classes where id = p_class;
  if not exists (select 1 from term_calendar where term_id = p_term and section = v_sec) then return; end if;
  v_open := att_times_open(p_term, v_sec);
  select id into v_trait from rating_traits where domain = 'affective' and name = 'Punctuality';
  perform set_config('app.att_sync', '1', true);
  insert into school_days (term_id, section, days_open) values (p_term, v_sec, v_open)
    on conflict (term_id, section) do update set days_open = excluded.days_open where school_days.days_open is distinct from excluded.days_open;
  create temporary table if not exists tmp_att (student_id uuid primary key, n int) on commit drop;
  truncate tmp_att;
  insert into tmp_att
    select s.id, count(m.day)::int
    from students s
    left join attendance_marks m on m.student_id = s.id and m.term_id = p_term and m.class_id = p_class
         and m.day in (select att_school_days(p_term, v_sec))
    where s.class_id = p_class and s.status = 'active' and term_is_open(p_term, s.id)
    group by s.id;
  insert into attendance (student_id, term_id, days_present) select student_id, p_term, least(n, v_open) from tmp_att
    on conflict (student_id, term_id) do update set days_present = excluded.days_present where attendance.days_present is distinct from excluded.days_present;
  if v_trait is not null and v_open > 0 then
    insert into ratings (student_id, term_id, trait_id, score) select student_id, p_term, v_trait, att_punctuality_score(least(n, v_open), v_open) from tmp_att
      on conflict (student_id, term_id, trait_id) do update set score = excluded.score where ratings.score is distinct from excluded.score;
  end if;
  perform set_config('app.att_sync', '0', true);
end $$;
create or replace function att_refresh_section(p_term uuid, p_section school_section default null) returns void language plpgsql security definer set search_path = public as $$
declare c uuid;
begin
  for c in select id from classes where p_section is null or section = p_section loop perform att_refresh_class(p_term, c); end loop;
end $$;

-- ---------- 5. calendar: exam end date and holidays ----------
create or replace function att_set_exam_end(p_term uuid, p_section school_section, p_date date) returns void language plpgsql security definer set search_path = public as $$
declare t terms;
begin
  if not can_manage_section(p_section) then raise exception 'Only the administrator or this section''s exam officer can set the exam end date.'; end if;
  select * into t from terms where id = p_term; if not found then raise exception 'Term not found'; end if;
  if p_date is null or p_date < t.starts_on or p_date > t.ends_on then raise exception 'The exam end date must fall inside the term (% to %).', t.starts_on, t.ends_on; end if;
  if exists (select 1 from term_calendar where term_id = p_term and section = p_section and exam_end_on = p_date) then return; end if;
  insert into term_calendar (term_id, section, exam_end_on, set_by) values (p_term, p_section, p_date, auth.uid())
    on conflict (term_id, section) do update set exam_end_on = excluded.exam_end_on, set_by = excluded.set_by, set_at = now();
  -- a different end date changes "times school opened", so class teachers must close the term register again
  delete from attendance_term_close where term_id = p_term and class_id in (select id from classes where section = p_section);
  perform att_refresh_section(p_term, p_section);
end $$;
create or replace function att_add_holiday(p_term uuid, p_section school_section, p_from date, p_to date, p_note text default null) returns uuid language plpgsql security definer set search_path = public as $$
declare t terms; v_id uuid; v_day date;
begin
  if p_section is null then if not is_admin() then raise exception 'Only the administrator can set a holiday for every section.'; end if;
  elsif not can_set_calendar(p_section) then raise exception 'You cannot set holidays for this section.'; end if;
  select * into t from terms where id = p_term; if not found then raise exception 'Term not found'; end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'Choose a start date and an end date that is the same or later.'; end if;
  if p_from < t.starts_on or p_to > t.ends_on then raise exception 'Holiday dates must fall inside the term (% to %).', t.starts_on, t.ends_on; end if;
  select min(s.day) into v_day from attendance_sheets s join classes c on c.id = s.class_id
    where s.term_id = p_term and s.day between p_from and p_to and (p_section is null or c.section = p_section);
  if v_day is not null then raise exception 'A register was already saved on % inside these dates. Registers cannot exist on a holiday.', v_day; end if;
  insert into school_holidays (term_id, section, starts_on, ends_on, note, set_by) values (p_term, p_section, p_from, p_to, left(nullif(btrim(p_note), ''), 120), auth.uid()) returning id into v_id;
  perform att_refresh_section(p_term, p_section);
  return v_id;
end $$;
create or replace function att_remove_holiday(p_id uuid) returns void language plpgsql security definer set search_path = public as $$
declare h school_holidays;
begin
  select * into h from school_holidays where id = p_id; if not found then return; end if;
  if h.section is null then if not is_admin() then raise exception 'Only the administrator can remove a holiday that covers every section.'; end if;
  elsif not can_set_calendar(h.section) then raise exception 'You cannot change holidays for this section.'; end if;
  delete from school_holidays where id = p_id;
  delete from attendance_term_close where term_id = h.term_id and (h.section is null or class_id in (select id from classes where section = h.section));
  perform att_refresh_section(h.term_id, h.section);
end $$;

-- ---------- 6. the register (class teacher / form master only) ----------
create or replace function att_register(p_class uuid, p_day date) returns jsonb language sql stable security definer set search_path = public as $$
  select case when not (is_first_teacher(p_class) or can_view_attendance(class_section(p_class))) then null else jsonb_build_object(
    'students', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.last_name || ' ' || s.first_name, 'gender', s.gender) order by s.last_name, s.first_name)
                          from students s where s.class_id = p_class and s.status = 'active'), '[]'::jsonb),
    'am', coalesce((select jsonb_agg(student_id) from attendance_marks where class_id = p_class and day = p_day and half = 'M'), '[]'::jsonb),
    'pm', coalesce((select jsonb_agg(student_id) from attendance_marks where class_id = p_class and day = p_day and half = 'A'), '[]'::jsonb),
    'am_at', (select saved_at from attendance_sheets where class_id = p_class and day = p_day and half = 'M'),
    'pm_at', (select saved_at from attendance_sheets where class_id = p_class and day = p_day and half = 'A')) end $$;

create or replace function att_save_register(p_class uuid, p_term uuid, p_day date, p_half text, p_present uuid[]) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_sec school_section; v_prob text; v_total int; v_nm int; v_nf int; v_pm int; v_pf int; v_at timestamptz; v_ok int; v_ids uuid[] := coalesce(p_present, '{}');
begin
  if p_half not in ('M', 'A') then raise exception 'Choose morning or afternoon.'; end if;
  if not is_first_teacher(p_class) then raise exception 'Only the class teacher (form master) of this class can take its attendance.'; end if;
  select section into v_sec from classes where id = p_class;
  if not term_is_open(p_term) then raise exception 'This term is inactive. No entries can be made for it.'; end if;
  if results_locked(p_term, v_sec) then raise exception 'The results for this term are locked, so attendance cannot be changed.'; end if;
  v_prob := att_day_problem(p_term, v_sec, p_day); if v_prob is not null then raise exception '%', v_prob; end if;
  if exists (select 1 from attendance_term_close where class_id = p_class and term_id = p_term) then raise exception 'This class''s attendance for the term is closed. Reopen it to make changes.'; end if;
  if exists (select 1 from attendance_weeks where class_id = p_class and term_id = p_term and week_start = date_trunc('week', p_day)::date) then raise exception 'That week is closed. Reopen the week to make changes.'; end if;
  select count(*) into v_total from students where class_id = p_class and status = 'active' and term_is_open(p_term, id);
  select count(*) into v_ok from students where class_id = p_class and status = 'active' and term_is_open(p_term, id) and id = any(v_ids);
  if v_ok <> (select count(distinct x) from unnest(v_ids) x) then raise exception 'The list includes a student who is not on this class register.'; end if;
  delete from attendance_marks where class_id = p_class and day = p_day and half = p_half;
  insert into attendance_marks (student_id, day, half, class_id, term_id) select distinct x, p_day, p_half::char(1), p_class, p_term from unnest(v_ids) x;
  select count(*) filter (where gender = 'Male'), count(*) filter (where gender = 'Female'),
         count(*) filter (where gender = 'Male' and id = any(v_ids)), count(*) filter (where gender = 'Female' and id = any(v_ids))
    into v_nm, v_nf, v_pm, v_pf from students where class_id = p_class and status = 'active' and term_is_open(p_term, id);
  insert into attendance_sheets (class_id, term_id, day, half, saved_at, saved_by, n_m, n_f, p_m, p_f) values (p_class, p_term, p_day, p_half::char(1), now(), auth.uid(), v_nm, v_nf, v_pm, v_pf)
    on conflict (class_id, day, half) do update set saved_at = now(), saved_by = auth.uid(), n_m = excluded.n_m, n_f = excluded.n_f, p_m = excluded.p_m, p_f = excluded.p_f
    returning saved_at into v_at;
  perform att_refresh_class(p_term, p_class);
  return jsonb_build_object('saved_at', v_at, 'present', v_ok, 'total', v_total);
end $$;

-- week and term statistics are computed from the saved sheets
create or replace function att_close_week_row(p_class uuid, p_term uuid, p_week date) returns void language sql security definer set search_path = public as $$
  insert into attendance_weeks (class_id, term_id, week_start, school_days, n_m, n_f, p_m, p_f, pct_all, pct_m, pct_f, closed_by)
  select p_class, p_term, p_week, count(distinct day), coalesce(sum(n_m), 0), coalesce(sum(n_f), 0), coalesce(sum(p_m), 0), coalesce(sum(p_f), 0),
         round(100.0 * coalesce(sum(p_m + p_f), 0) / nullif(sum(n_m + n_f), 0), 2), round(100.0 * sum(p_m) / nullif(sum(n_m), 0), 2), round(100.0 * sum(p_f) / nullif(sum(n_f), 0), 2), auth.uid()
  from attendance_sheets where class_id = p_class and term_id = p_term and day between p_week and p_week + 6
  on conflict (class_id, term_id, week_start) do update set school_days = excluded.school_days, n_m = excluded.n_m, n_f = excluded.n_f, p_m = excluded.p_m, p_f = excluded.p_f,
    pct_all = excluded.pct_all, pct_m = excluded.pct_m, pct_f = excluded.pct_f, closed_at = now(), closed_by = excluded.closed_by $$;

create or replace function att_missing_day(p_class uuid, p_term uuid, p_from date, p_to date) returns date language sql stable security definer set search_path = public as $$
  select min(d) from att_school_days(p_term, class_section(p_class)) d
  where d between p_from and p_to and (not exists (select 1 from attendance_sheets s where s.class_id = p_class and s.day = d and s.half = 'M')
                                        or not exists (select 1 from attendance_sheets s where s.class_id = p_class and s.day = d and s.half = 'A')) $$;

create or replace function att_close_week(p_class uuid, p_term uuid, p_week date) returns void language plpgsql security definer set search_path = public as $$
declare v_week date := date_trunc('week', p_week)::date; v_miss date;
begin
  if not is_first_teacher(p_class) then raise exception 'Only the class teacher (form master) of this class can close a week.'; end if;
  if exists (select 1 from attendance_term_close where class_id = p_class and term_id = p_term) then raise exception 'The term is closed. Reopen it first.'; end if;
  if not exists (select 1 from att_school_days(p_term, class_section(p_class)) d where d between v_week and v_week + 6) then raise exception 'That week has no school days.'; end if;
  v_miss := att_missing_day(p_class, p_term, v_week, v_week + 6);
  if v_miss is not null then raise exception 'Save both the morning and afternoon registers for % before closing the week.', to_char(v_miss, 'Dy DD Mon'); end if;
  perform att_close_week_row(p_class, p_term, v_week);
end $$;
create or replace function att_reopen_week(p_class uuid, p_term uuid, p_week date) returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_first_teacher(p_class) then raise exception 'Only the class teacher (form master) of this class can reopen a week.'; end if;
  if exists (select 1 from attendance_term_close where class_id = p_class and term_id = p_term) then raise exception 'The term is closed. Reopen the term first.'; end if;
  delete from attendance_weeks where class_id = p_class and term_id = p_term and week_start = date_trunc('week', p_week)::date;
end $$;
create or replace function att_close_term(p_class uuid, p_term uuid) returns void language plpgsql security definer set search_path = public as $$
declare v_sec school_section; v_miss date; w date;
begin
  if not is_first_teacher(p_class) then raise exception 'Only the class teacher (form master) of this class can close the term.'; end if;
  select section into v_sec from classes where id = p_class;
  if not exists (select 1 from term_calendar where term_id = p_term and section = v_sec) then raise exception 'The exam end date has not been set for this term.'; end if;
  v_miss := att_missing_day(p_class, p_term, date '1900-01-01', date '2999-12-31');
  if v_miss is not null then raise exception 'Attendance is not complete: save both registers for % (and any later days up to the exam end date) first.', to_char(v_miss, 'Dy DD Mon YYYY'); end if;
  for w in select distinct date_trunc('week', d)::date from att_school_days(p_term, v_sec) d loop
    if not exists (select 1 from attendance_weeks where class_id = p_class and term_id = p_term and week_start = w) then perform att_close_week_row(p_class, p_term, w); end if;
  end loop;
  insert into attendance_term_close (class_id, term_id, closed_by) values (p_class, p_term, auth.uid()) on conflict (class_id, term_id) do nothing;
  perform att_refresh_class(p_term, p_class);
end $$;
create or replace function att_reopen_term(p_class uuid, p_term uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_first_teacher(p_class) then raise exception 'Only the class teacher (form master) of this class can reopen the term.'; end if;
  if results_locked(p_term, class_section(p_class)) then raise exception 'The results for this term are locked.'; end if;
  delete from attendance_term_close where class_id = p_class and term_id = p_term;
end $$;

-- ---------- 7. reading: teacher, heads / board / admin, parents ----------
-- the class teacher's view of one class and term: calendar, every school day with its upload times, weeks and closing state
create or replace function att_teacher_term(p_class uuid, p_term uuid) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_sec school_section; r jsonb;
begin
  if not (is_first_teacher(p_class) or leads_class(p_class) or can_view_attendance(class_section(p_class))) then return null; end if;
  select section into v_sec from classes where id = p_class;
  select jsonb_build_object(
    'is_lead', is_first_teacher(p_class), 'today', att_today(), 'section', v_sec,
    'starts_on', t.starts_on, 'ends_on', t.ends_on, 'exam_end_on', c.exam_end_on, 'times_open', case when c.exam_end_on is null then null else att_times_open(p_term, v_sec) end,
    'term_closed', (select closed_at from attendance_term_close where class_id = p_class and term_id = p_term),
    'students', (select count(*) from students where class_id = p_class and status = 'active' and term_is_open(p_term, id)),
    'days', coalesce((select jsonb_agg(jsonb_build_object('day', d, 'week', date_trunc('week', d)::date,
              'am_at', (select saved_at from attendance_sheets s where s.class_id = p_class and s.day = d and s.half = 'M'),
              'pm_at', (select saved_at from attendance_sheets s where s.class_id = p_class and s.day = d and s.half = 'A')) order by d) from att_school_days(p_term, v_sec) d), '[]'::jsonb),
    'weeks', coalesce((select jsonb_agg(to_jsonb(w) order by w.week_start) from attendance_weeks w where w.class_id = p_class and w.term_id = p_term), '[]'::jsonb),
    'holidays', coalesce((select jsonb_agg(jsonb_build_object('from', h.starts_on, 'to', h.ends_on, 'note', h.note) order by h.starts_on)
                          from school_holidays h where h.term_id = p_term and (h.section is null or h.section = v_sec)), '[]'::jsonb))
  into r from terms t left join term_calendar c on c.term_id = t.id and c.section = v_sec where t.id = p_term;
  return r;
end $$;

-- every register saved in one term, for the sections the caller may view (heads, exam officers, board, admin)
create or replace function att_sheets(p_term uuid) returns jsonb language sql stable security definer set search_path = public as $$
  with cl as (select c.id, c.name, c.section, c.sub_section from classes c where can_view_attendance(c.section))
  select jsonb_build_object(
    'classes', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'section', section, 'sub_section', sub_section) order by name) from cl), '[]'::jsonb),
    'sheets', coalesce((select jsonb_agg(jsonb_build_array(s.class_id, s.day, s.half, s.saved_at, s.n_m, s.n_f, s.p_m, s.p_f) order by s.day, s.class_id)
                        from attendance_sheets s join cl on cl.id = s.class_id where s.term_id = p_term), '[]'::jsonb),
    'weeks', coalesce((select jsonb_agg(to_jsonb(w)) from attendance_weeks w join cl on cl.id = w.class_id where w.term_id = p_term), '[]'::jsonb),
    'term_closed', coalesce((select jsonb_agg(tc.class_id) from attendance_term_close tc join cl on cl.id = tc.class_id where tc.term_id = p_term), '[]'::jsonb),
    'calendar', coalesce((select jsonb_agg(jsonb_build_object('section', section, 'exam_end_on', exam_end_on)) from term_calendar where term_id = p_term), '[]'::jsonb),
    'holidays', coalesce((select jsonb_agg(jsonb_build_object('section', section, 'from', starts_on, 'to', ends_on, 'note', note)) from school_holidays where term_id = p_term), '[]'::jsonb)) $$;

-- totals per class and term, and per class and month, for the whole session (term on term, month on month, session)
create or replace function att_rollups(p_year uuid) returns jsonb language sql stable security definer set search_path = public as $$
  with cl as (select c.id, c.name, c.section, c.sub_section from classes c where can_view_attendance(c.section)),
  s as (select s.class_id, s.term_id, s.day, s.n_m, s.n_f, s.p_m, s.p_f from attendance_sheets s join cl on cl.id = s.class_id join terms t on t.id = s.term_id where t.year_id = p_year)
  select jsonb_build_object(
    'terms', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'number', number) order by number) from terms where year_id = p_year), '[]'::jsonb),
    'classes', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'section', section, 'sub_section', sub_section) order by name) from cl), '[]'::jsonb),
    'by_term', coalesce((select jsonb_agg(jsonb_build_array(class_id, term_id, sn_m, sn_f, sp_m, sp_f, days)) from
        (select class_id, term_id, sum(n_m) sn_m, sum(n_f) sn_f, sum(p_m) sp_m, sum(p_f) sp_f, count(distinct day) days from s group by class_id, term_id) q), '[]'::jsonb),
    'by_month', coalesce((select jsonb_agg(jsonb_build_array(class_id, mon, sn_m, sn_f, sp_m, sp_f, days)) from
        (select class_id, to_char(day, 'YYYY-MM') mon, sum(n_m) sn_m, sum(n_f) sn_f, sum(p_m) sp_m, sum(p_f) sp_f, count(distinct day) days from s group by class_id, to_char(day, 'YYYY-MM')) q), '[]'::jsonb)) $$;

-- who has finished weekly / termly / session attendance and who has not
create or replace function att_completion(p_year uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('class_id', c.id, 'class_name', c.name, 'section', c.section, 'sub_section', c.sub_section,
      'term_id', t.id, 'term_no', t.number, 'exam_end_on', cal.exam_end_on,
      'weeks_total', case when cal.exam_end_on is null then null else (select count(distinct date_trunc('week', d)) from att_school_days(t.id, c.section) d) end,
      'weeks_closed', (select count(*) from attendance_weeks w where w.class_id = c.id and w.term_id = t.id),
      'days_total', case when cal.exam_end_on is null then null else (select count(*) from att_school_days(t.id, c.section)) end,
      'days_saved', (select count(*) from (select day from attendance_sheets s where s.class_id = c.id and s.term_id = t.id group by day having count(*) = 2) x),
      'term_closed', exists (select 1 from attendance_term_close x where x.class_id = c.id and x.term_id = t.id),
      'last_saved_at', (select max(saved_at) from attendance_sheets s where s.class_id = c.id and s.term_id = t.id)) order by c.name, t.number), '[]'::jsonb)
  from classes c cross join terms t left join term_calendar cal on cal.term_id = t.id and cal.section = c.section
  where t.year_id = p_year and can_view_attendance(c.section) $$;

-- one class and term, student by student (admin, board, heads, exam officers)
create or replace function att_students(p_term uuid, p_class uuid) returns jsonb language sql stable security definer set search_path = public as $$
  with st as (select s.id, s.last_name || ' ' || s.first_name nm, s.gender, row_number() over (order by s.last_name, s.first_name) - 1 ix
              from students s where s.class_id = p_class and s.status = 'active')
  select case when not can_view_attendance(class_section(p_class)) then null else jsonb_build_object(
    'students', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', nm, 'gender', gender) order by ix) from st), '[]'::jsonb),
    'marks', coalesce((select jsonb_agg(jsonb_build_array(st.ix, m.day, m.mask)) from
        (select student_id, day, sum(case half when 'M' then 1 else 2 end)::int mask from attendance_marks where class_id = p_class and term_id = p_term group by student_id, day) m
        join st on st.id = m.student_id), '[]'::jsonb),
    'days', coalesce((select jsonb_agg(d order by d) from att_school_days(p_term, class_section(p_class)) d), '[]'::jsonb),
    'times_open', att_times_open(p_term, class_section(p_class))) end $$;

-- a parent's (or a head's) view of one child for a whole session: terms, holidays, and the day-by-day ticks
create or replace function att_child(p_student uuid, p_year uuid) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_sec school_section := student_section(p_student);
begin
  if not (parent_of(p_student) or can_view_attendance(v_sec) or leads_student(p_student)) then return null; end if;
  return jsonb_build_object(
    'student', (select jsonb_build_object('id', s.id, 'name', s.last_name || ' ' || s.first_name, 'class', c.name) from students s join classes c on c.id = s.class_id where s.id = p_student),
    'terms', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'number', t.number, 'starts_on', t.starts_on, 'exam_end_on', cal.exam_end_on,
                'closed', exists (select 1 from attendance_term_close x join students s on s.class_id = x.class_id where s.id = p_student and x.term_id = t.id),
                'times_open', case when cal.exam_end_on is null then null else att_times_open(t.id, v_sec) end,
                'days', coalesce((select jsonb_agg(d order by d) from att_school_days(t.id, v_sec) d), '[]'::jsonb)) order by t.number)
              from terms t left join term_calendar cal on cal.term_id = t.id and cal.section = v_sec where t.year_id = p_year), '[]'::jsonb),
    'holidays', coalesce((select jsonb_agg(jsonb_build_object('from', h.starts_on, 'to', h.ends_on, 'note', h.note)) from school_holidays h join terms t on t.id = h.term_id
                          where t.year_id = p_year and (h.section is null or h.section = v_sec)), '[]'::jsonb),
    'marks', coalesce((select jsonb_agg(jsonb_build_array(m.day, m.mask)) from
        (select day, sum(case half when 'M' then 1 else 2 end)::int mask from attendance_marks a join terms t on t.id = a.term_id where a.student_id = p_student and t.year_id = p_year group by day) m), '[]'::jsonb));
end $$;

-- ---------- 8. grants ----------
do $$ declare f text; begin
  foreach f in array array['att_set_exam_end(uuid,school_section,date)', 'att_add_holiday(uuid,school_section,date,date,text)', 'att_remove_holiday(uuid)', 'att_register(uuid,date)',
    'att_save_register(uuid,uuid,date,text,uuid[])', 'att_close_week(uuid,uuid,date)', 'att_reopen_week(uuid,uuid,date)', 'att_close_term(uuid,uuid)', 'att_reopen_term(uuid,uuid)',
    'att_teacher_term(uuid,uuid)', 'att_sheets(uuid)', 'att_rollups(uuid)', 'att_completion(uuid)', 'att_students(uuid,uuid)', 'att_child(uuid,uuid)', 'att_school_days(uuid,school_section)',
    'att_times_open(uuid,school_section)', 'att_day_problem(uuid,school_section,date)', 'att_punctuality_score(int,int)', 'att_today()', 'can_set_calendar(school_section)', 'can_view_attendance(school_section)']
  loop execute format('revoke execute on function %s from public, anon', f); execute format('grant execute on function %s to authenticated', f); end loop;
  foreach f in array array['att_refresh_class(uuid,uuid)', 'att_refresh_section(uuid,school_section)', 'att_close_week_row(uuid,uuid,date)', 'att_missing_day(uuid,uuid,date,date)']
  loop execute format('revoke execute on function %s from public, anon, authenticated', f); end loop;
end $$;

-- heads see a saved register the moment it is saved (Supabase Realtime), when Realtime is switched on for the project
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'attendance_sheets') then
    alter publication supabase_realtime add table attendance_sheets;
  end if;
end $$;

commit;
