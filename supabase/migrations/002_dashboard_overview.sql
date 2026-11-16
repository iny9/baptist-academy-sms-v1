-- (Dashboard revamp, Top Level Analytics)
-- Safe to run more than once.
--
-- What it adds (read-only functions, no table changes):
--   merit_points(total)            one place that defines a subject "merit point" (A=5, B=4, C=3, D=2, F=0). Change it here, the dashboard follows.
--   dash_base(year)                the scores the dashboard may use: active terms, active students, no excluded students, no switched-off subjects,
--                                  and ONLY the sections the caller may see on the dashboard (admin and board: all; principal / headmaster: own section).
--   dash_students(year)            one row per student per term (term_no 1-3) and one for the whole session (term_no 0): total, average, merit, class position.
--   dash_subject_leaders(year)     the top student per class, subject and term (term_no 0 = whole session).
--   dash_pass_counts(year)         students at or above / below the session's target average, per class, gender and subject (for the donut).
-- The three public functions return ONE json value each (a list of rows), so the API's 1000-row cap can never cut a session short.
-- Who may call them: signed-in users only; every function re-checks the role through can_view_dashboard, so the database, not the page, decides.
begin;

create or replace function merit_points(p_total numeric) returns int language sql immutable as $$
  select case when p_total >= 70 then 5 when p_total >= 60 then 4 when p_total >= 50 then 3 when p_total >= 40 then 2 else 0 end $$;

-- The one filter every dashboard number goes through (same rules as dashboard_rows, for a whole session at once)
create or replace function dash_base(p_year uuid)
returns table (student_id uuid, class_id uuid, subject_id uuid, term_no smallint, total numeric)
language sql stable security definer set search_path = public as $$
  with ok as (select e as section from unnest(enum_range(null::school_section)) e where can_view_dashboard(e))
  select x.student_id, x.class_id, x.subject_id, t.number, (x.ca1 + x.ca2 + x.exam)
  from scores x
  join terms t on t.id = x.term_id
  join students s on s.id = x.student_id
  join classes c on c.id = x.class_id
  where t.year_id = p_year and t.is_active and s.status = 'active'
    and c.section in (select section from ok)
    and not exists (select 1 from term_exclusions e where e.student_id = x.student_id and e.term_id = x.term_id)
    and not exists (select 1 from subject_inactivity i where i.subject_id = x.subject_id and i.class_id = x.class_id and i.year_id = p_year
                    and (i.term_id is null or i.term_id = x.term_id)) $$;

-- One row per student per term, plus term_no = 0 for the whole session.
--   average  = mean of the subject totals (session: mean of the term averages that have scores)
--   total    = sum of subject totals (session: sum over those terms)
--   merit    = sum of merit points over subjects (session: sum over terms)
--   class_pos= rank in the class by the average shown on that row (ties share a position)
--   status   = session row only: 'Promoted' when the session average reaches the session's target average, else 'Repeat'
--   photo_url is sent only for class positions 1-3 (the only students who can ever reach a top-three card): the page stays light
create or replace function dash_students(p_year uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  with b as (select * from dash_base(p_year)),
  pt as (select student_id, class_id, term_no, sum(total) total, round(avg(total), 2) average, sum(merit_points(total))::int merit, count(*)::int subjects
         from b group by student_id, class_id, term_no),
  ss as (select student_id, class_id, 0::smallint term_no, sum(total) total, round(avg(average), 2) average, sum(merit)::int merit,
                sum(subjects)::int subjects, count(*)::int terms_counted
         from pt group by student_id, class_id),
  u as (select student_id, class_id, term_no, total, average, merit, subjects, 1 terms_counted from pt
        union all
        select student_id, class_id, term_no, total, average, merit, subjects, terms_counted from ss),
  r as (select u.*, rank() over (partition by class_id, term_no order by average desc)::int pos,
               count(*) over (partition by class_id, term_no)::int size from u)
  select coalesce(jsonb_agg(to_jsonb(q) order by q.class_name, q.term_no, q.class_pos, q.student_id), '[]'::jsonb) from (
    select r.student_id, s.last_name || ' ' || s.first_name as student_name, s.gender, r.class_id, c.name as class_name, c.section, c.sub_section,
           r.term_no, r.total, r.average, r.merit, r.subjects, r.pos as class_pos, r.size as class_size, r.terms_counted,
           case when r.term_no = 0 then case when r.average >= y.target_average then 'Promoted' else 'Repeat' end end as status,
           case when r.pos <= 3 then s.photo_url end as photo_url
    from r join students s on s.id = r.student_id join classes c on c.id = r.class_id
         join academic_years y on y.id = p_year
  ) q $$;

-- Top student per class, subject and term (term_no 0 = whole session). The page picks the best across the classes you select.
create or replace function dash_subject_leaders(p_year uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  with b as (select * from dash_base(p_year)),
  u as (select student_id, class_id, subject_id, term_no, total average from b
        union all
        select student_id, class_id, subject_id, 0::smallint, round(avg(total), 2) from b group by student_id, class_id, subject_id),
  r as (select u.*, rank() over (partition by class_id, subject_id, term_no order by average desc) rk,
               count(*) over (partition by class_id, subject_id, term_no)::int n from u),
  w as (select r.*, (count(*) filter (where rk = 1) over (partition by class_id, subject_id, term_no))::int ties,
               row_number() over (partition by class_id, subject_id, term_no order by average desc, student_id) rn from r)
  select coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb) from (
    select w.class_id, c.name as class_name, c.section, c.sub_section, w.subject_id, sub.name as subject_name, w.term_no,
           w.student_id, s.last_name || ' ' || s.first_name as student_name, s.gender, s.photo_url, w.average, w.n as class_size, w.ties as tied
    from w join students s on s.id = w.student_id join classes c on c.id = w.class_id join subjects sub on sub.id = w.subject_id
    where w.rn = 1
  ) q $$;

-- Donut for a chosen subject: students whose session average in that subject is at / above the target, or below it
create or replace function dash_pass_counts(p_year uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  with b as (select * from dash_base(p_year)),
  sa as (select student_id, class_id, subject_id, round(avg(total), 2) a from b group by student_id, class_id, subject_id)
  select coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb) from (
    select sa.class_id, s.gender, sa.subject_id, sub.name as subject_name,
           (count(*) filter (where sa.a >= y.target_average))::int as passed, (count(*) filter (where sa.a < y.target_average))::int as below
    from sa join students s on s.id = sa.student_id join subjects sub on sub.id = sa.subject_id join academic_years y on y.id = p_year
    group by sa.class_id, s.gender, sa.subject_id, sub.name, y.target_average
  ) q $$;

-- Only signed-in users call the three public functions; the helper is internal
do $$ declare f text; begin
  foreach f in array array['dash_students(uuid)', 'dash_subject_leaders(uuid)', 'dash_pass_counts(uuid)', 'merit_points(numeric)']
  loop execute format('revoke execute on function %s from public, anon', f); execute format('grant execute on function %s to authenticated', f); end loop;
  revoke execute on function dash_base(uuid) from public, anon, authenticated;
end $$;

commit;
