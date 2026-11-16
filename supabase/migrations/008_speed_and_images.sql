-- (speed and storage hygiene). Safe to run more than once.
--
--  * Drops indexes that are provably redundant (an index whose columns are the leading columns of another index on the same table does nothing the bigger one
--    cannot do, and every extra index slows every insert and update). Each one dropped below is covered by a larger index that stays.
--  * perf_index_report: the administrator can list redundant and never-used indexes at any time (nothing is dropped automatically).
--  * image_columns_problems: proves no picture is stored inside a table. Picture columns may hold only a link or a storage path.
--  * ANALYZE so the planner has fresh numbers after the new tables of stages 2 and 3.
-- Nothing else changes: report cards, the Harvard template and the glass theme need no database change.
begin;

-- redundant (leading-column) indexes; the covering index is named beside each
drop index if exists sfl_student_term;                  -- duplicate of student_fee_lines_student_term (added again by the fee schedules migration)
drop index if exists scores_term_class;                 -- covered by scores_term_class_subject (term_id, class_id, subject_id)
drop index if exists students_class_id_idx;             -- covered by students_class_status (class_id, status)
drop index if exists ratings_term;                      -- covered by ratings_term_student (term_id, student_id)
drop index if exists class_teachers_teacher;            -- covered by class_teachers_teacher_class (teacher_id, class_id)
drop index if exists class_subject_teachers_class;      -- covered by class_subject_teachers_lookup (class_id, subject_id, teacher_id)
drop index if exists user_roles_user_id_idx;            -- covered by user_roles_user_role_section (user_id, role, section)
drop index if exists user_roles_user;                   -- same
drop index if exists user_roles_user_role;              -- same

-- internal: catalog queries without a role check (the verify script runs them as the project owner)
create or replace function perf_index_report_raw() returns table (kind text, table_name text, index_name text, index_columns text, detail text)
language sql stable security definer set search_path = public, pg_catalog as $$
  with ix as (
    select i.indrelid::regclass::text tbl, c.relname idx, i.indisunique uniq, i.indisprimary pk, (i.indpred is not null) partial, (i.indexprs is not null) expr,
           array(select a.attname::text from unnest(i.indkey::int2[]) with ordinality k(attnum, ord) join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum order by k.ord) cols,
           pg_relation_size(i.indexrelid) size, coalesce(s.idx_scan, 0) scans
    from pg_index i join pg_class c on c.oid = i.indexrelid join pg_namespace n on n.oid = c.relnamespace
    left join pg_stat_user_indexes s on s.indexrelid = i.indexrelid
    where n.nspname = 'public' and i.indisvalid)
  select 'redundant', a.tbl, a.idx, array_to_string(a.cols, ', '), 'covered by ' || b.idx
  from ix a join ix b on a.tbl = b.tbl and a.idx <> b.idx
   and not a.uniq and not a.pk and not a.partial and not a.expr and not b.partial and not b.expr
   and a.cols = b.cols[1:cardinality(a.cols)]
   and (cardinality(b.cols) > cardinality(a.cols) or (cardinality(b.cols) = cardinality(a.cols) and a.idx > b.idx))
  union all
  select 'never used', tbl, idx, array_to_string(cols, ', '), pg_size_pretty(size) || ', 0 scans since statistics were last reset'
  from ix where scans = 0 and not uniq and not pk and size > 65536 $$;
create or replace function perf_index_report() returns table (kind text, table_name text, index_name text, index_columns text, detail text)
language sql stable security definer set search_path = public as $$ select * from perf_index_report_raw() where is_admin() order by 1, 2, 3 $$;

-- internal: any picture-like column that holds picture data instead of a link
create or replace function image_columns_problems() returns table (table_name text, column_name text, problem text, rows_affected bigint)
language plpgsql stable security definer set search_path = public as $$
declare c record; n bigint;
begin
  for c in select table_name t, column_name col, data_type dt from information_schema.columns
           where table_schema = 'public' and (column_name ~* '(photo|image|picture|logo|avatar|signature|stamp|teller|slide|banner)' or data_type = 'bytea')
             and table_name in (select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE') loop
    if c.dt = 'bytea' then table_name := c.t; column_name := c.col; problem := 'binary column: pictures must live in storage'; rows_affected := 0; return next; continue; end if;
    if c.dt not in ('text', 'character varying') then continue; end if;
    execute format('select count(*) from public.%I where %I like %L or length(%I) > 700', c.t, c.col, 'data:%', c.col) into n;
    if n > 0 then table_name := c.t; column_name := c.col; problem := 'holds picture data or very long text instead of a link/path'; rows_affected := n; return next; end if;
  end loop;
  -- pictures kept as site settings (hero slides, stamps, signatures) must be links too
  select count(*) into n from site_settings where value like 'data:%' or length(value) > 2000;
  if n > 0 then table_name := 'site_settings'; column_name := 'value'; problem := 'holds picture data or very long text instead of a link/path'; rows_affected := n; return next; end if;
end $$;

revoke execute on function perf_index_report_raw() from public, anon, authenticated;
revoke execute on function image_columns_problems() from public, anon, authenticated;
revoke execute on function perf_index_report() from public, anon;
grant execute on function perf_index_report() to authenticated;

commit;
analyze;
