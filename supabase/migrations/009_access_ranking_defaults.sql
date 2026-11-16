-- (access scoping, ranking rule). Safe to run more than once.
--
-- 1. RANKING. Everything that puts students in order now uses ONE rule:
--      1st  the highest CUMULATIVE AVERAGE for the session up to the chosen term
--           (mean of the term averages of Term 1 .. chosen term; on the dashboard's whole-session row: the session average),
--      2nd  the MERIT SCORE (sum of grade points A=5 ... F=0 over the subjects),
--      then the average of the term, the total score.
--    dash_students sends cum_average and ranks class_pos / merit_pos by it; term_results (report cards, PDFs, e-mails) ranks class_position by it.
--    Report cards now show the cumulative average on EVERY term row (it used to appear only in Term 3). The Promoted / Repeat decision at Term 3 is unchanged
--    in meaning; the cumulative average counts the active terms in which the student has scores (the same terms the dashboard counts).
-- 2. PARENTS. A person who is a parent AND holds another role now acts as a parent only until they choose the other role ("View as").
--    active_role answers 'parent' when no valid choice is sent, so no page, list, report or function can show them another family's child
--    until they pick the staff role that allows it. Everyone else is unchanged ("all my roles" still works for them).
-- 3. SUBJECT TEACHERS see only the subjects they teach in the classes they teach (subject list, score-completeness list, CA forms).
-- 4. results_blockers no longer lists classes the caller cannot see (a class teacher or a head of another section used to get the whole section).
begin;

-- ======================= 2. Parents act as parents until they choose another role =======================
create or replace function active_role() returns text language sql stable security definer set search_path = public as $$
  with mine as (select ur.role::text r from user_roles ur where ur.user_id = auth.uid()),
  want as (select lower(nullif(btrim(nullif(current_setting('request.headers', true), '')::json ->> 'x-active-role'), '')) v)
  select case
    when (select v from want) in (select r from mine) then (select v from want)
    when exists (select 1 from mine where r = 'parent') and exists (select 1 from mine where r <> 'parent') then 'parent'
  end $$;

-- ======================= 3. Subject teachers: only their own subjects =======================
create or replace function can_see_subject_id(p_subject uuid) returns boolean language sql stable security definer set search_path = public as $$
  select is_admin() or role_active('board_member') or role_active('bursar')
    or exists (select 1 from classes c where subject_offered(p_subject, c.id) and (
         role_in_section(array['exam_officer','principal','headmaster']::app_role[], c.section)
         or (role_active('class_teacher') and exists (select 1 from class_teachers t where t.class_id = c.id and t.teacher_id = auth.uid()))
         or (role_active('subject_teacher') and exists (select 1 from class_subject_teachers x where x.class_id = c.id and x.subject_id = p_subject and x.teacher_id = auth.uid()))
         or (role_active('parent') and exists (select 1 from students st join guardians g on g.student_id = st.id where st.class_id = c.id and g.parent_id = auth.uid())))) $$;

create or replace function class_active_subjects(p_term uuid, p_class uuid) returns table (subject_id uuid, subject_name text)
language sql stable security definer set search_path = public as $$
  with y as (select year_id from terms where id = p_term)
  select s.id, s.name from classes c join subjects s on c.sub_section = any(s.sub_sections)
  where c.id = p_class
    and (not exists (select 1 from subject_classes k where k.subject_id = s.id) or exists (select 1 from subject_classes k where k.subject_id = s.id and k.class_id = c.id))
    and not exists (select 1 from subject_inactivity i where i.subject_id = s.id and i.class_id = c.id and i.year_id = (select year_id from y) and (i.term_id is null or i.term_id = p_term))
    and (c.section = 'basic' or exists (select 1 from class_subject_teachers x where x.class_id = c.id and x.subject_id = s.id))
    and (can_view_class(p_class) or leads_class(p_class) or parent_of_class(p_class)
         -- a subject teacher sees only the subjects they teach in this class
         or (teaches_class(p_class) and exists (select 1 from class_subject_teachers x where x.class_id = c.id and x.subject_id = s.id and x.teacher_id = auth.uid())))
  order by s.name $$;

-- ======================= 4. results_blockers: only classes the caller may see =======================
create or replace function results_blockers(p_term uuid, p_section school_section) returns table (class_id uuid, class_name text, subject_id uuid, subject_name text, problem text)
language sql stable security definer set search_path = public as $$
  with y as (select year_id from terms where id = p_term)
  select c.id, c.name, null::uuid, null::text, 'No class teacher is assigned.' from classes c
   where c.section = p_section and p_section = 'basic' and not exists (select 1 from class_teachers t where t.class_id = c.id)
     and (can_view_class(c.id) or leads_class(c.id) or teaches_class(c.id))
  union all
  select c.id, c.name, s.id, s.name, 'No subject teacher is assigned.' from classes c join subjects s on c.sub_section = any(s.sub_sections)
   where c.section = p_section and p_section = 'secondary'
     and (not exists (select 1 from subject_classes k where k.subject_id = s.id) or exists (select 1 from subject_classes k where k.subject_id = s.id and k.class_id = c.id))
     and not exists (select 1 from subject_inactivity i where i.subject_id = s.id and i.class_id = c.id and i.year_id = (select year_id from y) and (i.term_id is null or i.term_id = p_term))
     and not exists (select 1 from class_subject_teachers x where x.class_id = c.id and x.subject_id = s.id)
     and (can_view_class(c.id) or leads_class(c.id))
  order by 2, 4 $$;

-- ======================= 1a. Report cards: rank by cumulative average, then merit =======================
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
ta as (select student_id, round(avg(total), 2) a, sum(merit_points(total))::int merit from sc group by student_id),
-- the terms of this session up to and including the chosen one that are active for the student and in which the student has scores
st_terms as (select r.id as student_id, tt.id as term_id from roster r
             cross join (select a.id from terms a where a.year_id = (select year_id from t) and a.is_active and a.number <= (select number from t)) tt
             where not exists (select 1 from term_exclusions e where e.student_id = r.id and e.term_id = tt.id)),
term_avg as (select st.student_id, st.term_id,
             (select avg(x.ca1 + x.ca2 + x.exam) from scores x where x.student_id = st.student_id and x.term_id = st.term_id and x.class_id = p_class
                 and not exists (select 1 from inact n where n.subject_id = x.subject_id and (n.term_id is null or n.term_id = st.term_id))) a
             from st_terms st),
cum as (select student_id, round(avg(a), 2) c, count(*)::int n from term_avg where a is not null group by student_id),
-- 1st criterion: cumulative average (highest first); 2nd criterion: merit score; ties share a position
ranked as (select ta.student_id, ta.a, cum.c, cum.n, ta.merit,
       rank() over (order by coalesce(cum.c, ta.a) desc, ta.merit desc) pos
       from ta left join cum using (student_id))
select sc.student_id, sc.subject_id, sc.subject_name, sc.ca1, sc.ca2, sc.exam, sc.total, grade_for(sc.total),
       r.a, coalesce(r.c, r.a), r.pos::int, (select count(*) from roster)::int,
       case when (select number from t) = 3 then
         case when coalesce(r.c, r.a) >= (select target_average from t)
              then case when (select is_terminal from classes where id = p_class) then 'Graduated' else 'Promoted' end
              else 'Repeat' end end,
       remark_for(case when (select number from t) = 3 then coalesce(r.c, r.a) else r.a end), (select number from t), coalesce(r.n, 1)
from sc join ranked r using (student_id)
where (select ok from ready) and (can_view_class(p_class) or leads_class(p_class) or (parent_of(sc.student_id) and term_cleared(sc.student_id, p_term)))
order by sc.subject_name $$;

-- ======================= 1b. Dashboard: cumulative average first, merit score second =======================
create or replace function dash_students(p_year uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  with b as (select * from dash_base(p_year)),
  pt as (select student_id, class_id, term_no, sum(total) total, round(avg(total), 2) average, sum(merit_points(total))::int merit, count(*)::int subjects
         from b group by student_id, class_id, term_no),
  ss as (select student_id, class_id, 0::smallint term_no, sum(total) total, round(avg(average), 2) average, sum(merit)::int merit,
                sum(subjects)::int subjects, count(*)::int terms_counted
         from pt group by student_id, class_id),
  -- a term row: its own average, and the cumulative average = mean of the term averages from Term 1 up to this term
  u as (select p.student_id, p.class_id, p.term_no, p.total, p.average, p.merit, p.subjects, 1 terms_counted,
               (select round(avg(q.average), 2) from pt q where q.student_id = p.student_id and q.class_id = p.class_id and q.term_no <= p.term_no) cum_average
        from pt p
        union all
        select student_id, class_id, term_no, total, average, merit, subjects, terms_counted, average from ss),
  r as (select u.*, rank() over (partition by class_id, term_no order by cum_average desc, merit desc)::int pos,
               rank() over (partition by class_id, term_no order by cum_average desc, merit desc, average desc)::int mpos,
               count(*) over (partition by class_id, term_no)::int size from u)
  select coalesce(jsonb_agg(to_jsonb(q) order by q.class_name, q.term_no, q.class_pos, q.student_id), '[]'::jsonb) from (
    select r.student_id, s.last_name || ' ' || s.first_name as student_name, s.gender, r.class_id, c.name as class_name, c.section, c.sub_section,
           r.term_no, r.total, r.average, r.cum_average, r.merit, r.subjects, r.pos as class_pos, r.mpos as merit_pos, r.size as class_size, r.terms_counted,
           case when r.cum_average >= y.target_average then 'Promoted' else 'Repeat' end as status,
           case when r.pos <= 4 then s.photo_url end as photo_url
    from r join students s on s.id = r.student_id join classes c on c.id = r.class_id
         join academic_years y on y.id = p_year
  ) q $$;

do $$ declare f text; begin
  foreach f in array array['dash_students(uuid)', 'results_blockers(uuid,school_section)', 'class_active_subjects(uuid,uuid)', 'term_results(uuid,uuid)']
  loop execute format('revoke execute on function %s from public, anon', f); execute format('grant execute on function %s to authenticated', f); end loop;
end $$;

notify pgrst, 'reload schema';
commit;
