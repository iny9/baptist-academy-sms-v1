-- (grades, merit score, dashboard analytics). Safe to run more than once.
--
--
-- 1. grade_for: the system now has a grade E.  A 70+, B 60-69, C 50-59, D 45-49, E 40-44, F below 40.
--    Report cards (term_results), the dashboard and merit points all call grade_for, so they can never disagree.
-- 2. grade_points / merit_points: A=5, B=4, C=3, D=2, E=1, F=0.
-- 3. dash_students: MERIT SCORE = sum of the grade points of every subject (a term row: that term; the session row: all terms).
--    Top students are chosen by merit first; a tie is broken by the average of the same term / session (the cumulative average
--    on the session row). Adds merit_pos (rank in class by merit, then average) and a Promoted / Repeat status on EVERY row,
--    so the promoted-and-repeat donut can follow the term slicer.
-- 4. dash_pass_counts: now also returns term_no (0 = whole session), so the subject donut follows the term slicer too.
begin;

create or replace function grade_for(v numeric) returns text language sql immutable as $$
  select case when v>=70 then 'A' when v>=60 then 'B' when v>=50 then 'C' when v>=45 then 'D' when v>=40 then 'E' else 'F' end $$;

create or replace function grade_points(g text) returns int language sql immutable as $$
  select case g when 'A' then 5 when 'B' then 4 when 'C' then 3 when 'D' then 2 when 'E' then 1 else 0 end $$;

-- same name and argument as before, so dash_students keeps working; it now follows grade_for
create or replace function merit_points(p_total numeric) returns int language sql immutable as $$
  select grade_points(grade_for(p_total)) $$;

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
               rank() over (partition by class_id, term_no order by merit desc, average desc)::int mpos,
               count(*) over (partition by class_id, term_no)::int size from u)
  select coalesce(jsonb_agg(to_jsonb(q) order by q.class_name, q.term_no, q.merit_pos, q.student_id), '[]'::jsonb) from (
    select r.student_id, s.last_name || ' ' || s.first_name as student_name, s.gender, r.class_id, c.name as class_name, c.section, c.sub_section,
           r.term_no, r.total, r.average, r.merit, r.subjects, r.pos as class_pos, r.mpos as merit_pos, r.size as class_size, r.terms_counted,
           case when r.average >= y.target_average then 'Promoted' else 'Repeat' end as status,
           case when r.pos <= 3 or r.mpos <= 4 then s.photo_url end as photo_url
    from r join students s on s.id = r.student_id join classes c on c.id = r.class_id
         join academic_years y on y.id = p_year
  ) q $$;

create or replace function dash_pass_counts(p_year uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  with b as (select * from dash_base(p_year)),
  sa as (select student_id, class_id, subject_id, term_no, total a from b
         union all
         select student_id, class_id, subject_id, 0::smallint, round(avg(total), 2) from b group by student_id, class_id, subject_id)
  select coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb) from (
    select sa.class_id, s.gender, sa.subject_id, sub.name as subject_name, sa.term_no,
           (count(*) filter (where sa.a >= y.target_average))::int as passed, (count(*) filter (where sa.a < y.target_average))::int as below
    from sa join students s on s.id = sa.student_id join subjects sub on sub.id = sa.subject_id join academic_years y on y.id = p_year
    group by sa.class_id, s.gender, sa.subject_id, sub.name, sa.term_no, y.target_average
  ) q $$;

do $$ declare f text; begin
  foreach f in array array['dash_students(uuid)', 'dash_pass_counts(uuid)', 'merit_points(numeric)', 'grade_points(text)']
  loop execute format('revoke execute on function %s from public, anon', f); execute format('grant execute on function %s to authenticated', f); end loop;
end $$;

commit;
