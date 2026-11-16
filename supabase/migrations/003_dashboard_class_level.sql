-- (Dashboard revamp, Class Level Analytics). Safe to run again.
-- Adds dash_scores(year, term): every student's total in every subject for one term (p_term 1-3) or the session average per subject (p_term 0).
-- It goes through dash_base, so it only ever contains the sections the caller may see on the dashboard.
-- The answer is compact on purpose: students and subjects are listed once, and each score is [student number, subject number, score].
begin;
create or replace function dash_scores(p_year uuid, p_term smallint)
returns jsonb language sql stable security definer set search_path = public as $$
  with b as (select * from dash_base(p_year)),
  u as (select student_id, subject_id, total v from b where p_term > 0 and term_no = p_term
        union all
        select student_id, subject_id, round(avg(total), 2) from b where p_term = 0 group by student_id, subject_id),
  sj as (select d.subject_id, sub.name, row_number() over (order by sub.name, d.subject_id) - 1 ix
         from (select distinct subject_id from u) d join subjects sub on sub.id = d.subject_id),
  st as (select student_id, row_number() over (order by student_id) - 1 ix from (select distinct student_id from u) d)
  select jsonb_build_object(
    'subjects', coalesce((select jsonb_agg(jsonb_build_object('id', subject_id, 'name', name) order by ix) from sj), '[]'::jsonb),
    'students', coalesce((select jsonb_agg(student_id order by ix) from st), '[]'::jsonb),
    'rows', coalesce((select jsonb_agg(jsonb_build_array(st.ix, sj.ix, u.v)) from u join st on st.student_id = u.student_id join sj on sj.subject_id = u.subject_id), '[]'::jsonb)) $$;
revoke execute on function dash_scores(uuid, smallint) from public, anon;
grant execute on function dash_scores(uuid, smallint) to authenticated;
commit;
