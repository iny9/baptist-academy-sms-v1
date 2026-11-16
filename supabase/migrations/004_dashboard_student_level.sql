-- (Dashboard revamp, Student Analytics). Safe to run again.
-- Adds dash_domains(year, term): every visible student's rating (1 Poor to 5 Excellent) on every psychomotor and affective trait,
-- for one term (p_term 1-3) or the session average (p_term 0). Only students the caller may see on the dashboard are included
-- (the same section limit as everything else, through dash_base).
-- Compact on purpose: students and traits are listed once, each rating is [student number, trait number, rating].
begin;
create or replace function dash_domains(p_year uuid, p_term smallint)
returns jsonb language sql stable security definer set search_path = public as $$
  with vis as (select distinct student_id from dash_base(p_year)),
  tt as (select id, number from terms where year_id = p_year and is_active),
  u as (select r.student_id, r.trait_id, r.score::numeric v from ratings r join tt on tt.id = r.term_id
        where p_term > 0 and tt.number = p_term and r.student_id in (select student_id from vis)
        union all
        select r.student_id, r.trait_id, round(avg(r.score), 2) from ratings r join tt on tt.id = r.term_id
        where p_term = 0 and r.student_id in (select student_id from vis) group by r.student_id, r.trait_id),
  tr as (select id trait_id, domain, name, row_number() over (order by domain, name) - 1 ix from rating_traits),
  st as (select student_id, row_number() over (order by student_id) - 1 ix from (select distinct student_id from u) d)
  select jsonb_build_object(
    'traits', coalesce((select jsonb_agg(jsonb_build_object('id', trait_id, 'domain', domain, 'name', name) order by ix) from tr), '[]'::jsonb),
    'students', coalesce((select jsonb_agg(student_id order by ix) from st), '[]'::jsonb),
    'rows', coalesce((select jsonb_agg(jsonb_build_array(st.ix, tr.ix, u.v)) from u join st on st.student_id = u.student_id join tr on tr.trait_id = u.trait_id), '[]'::jsonb)) $$;
revoke execute on function dash_domains(uuid, smallint) from public, anon;
grant execute on function dash_domains(uuid, smallint) to authenticated;
commit;
