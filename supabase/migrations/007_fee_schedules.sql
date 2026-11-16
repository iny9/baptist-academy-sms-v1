-- (payment schedules, clearing, carry-forward, bursar queue, parent inbox). Safe to run more than once.
--
--
--  * Schedule items now have VARIANTS: 1 (bursar, whole section), 2A (section head, whole section), 2B (section head, one sub-section),
--    3A (class teacher, whole class), 3B (class teacher, chosen students of the class). Creating an item adds it to every matching student at once.
--  * A line is "Cleared" when the bursar confirms the payment, or when an authorised user marks it "Ignored" (an ignored line is cleared by the system).
--    Who may ignore: bursar -> level 3 items; section heads -> level 1 and 2 items; class teachers -> level 1 items; admin -> any.
--  * Carry-forward: when a term (or session) is created, every line of earlier terms that is neither cleared nor ignored (and not waiting for the bursar)
--    becomes a "Brought forward" line in the new term, one for one. The old line is settled when its brought-forward line is cleared.
--  * Results are visible to a parent only when every line of that term is settled (cleared, ignored, or cleared through its brought-forward line).
--  * The bursar confirms or rejects payments on the dashboard (many at once), a rejection needs a reason, and the parent sees it in the inbox.
--  * Parent inbox: messages and reminders from the bursar, drafts, and sent / confirmed / rejected payments. Newsletters appear beside them.
begin;

-- ---------- 1. columns and tables ----------
alter table fee_items add column if not exists variant text check (variant in ('1', '2A', '2B', '3A', '3B'));
alter table fee_items add column if not exists sub_section sub_section_name;
update fee_items set variant = case level when 1 then '1' when 2 then '2A' else '3A' end where variant is null and not is_extramural;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'fee_items_variant_ok') then
    alter table fee_items add constraint fee_items_variant_ok check (variant is null or (left(variant, 1)::int = level and ((variant = '2B') = (sub_section is not null))));
  end if;
end $$;
create table if not exists fee_item_students (   -- the chosen students of a 3B item
  fee_item_id uuid not null references fee_items(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  primary key (fee_item_id, student_id));
create index if not exists fee_item_students_student on fee_item_students (student_id);
alter table fee_item_students enable row level security;
drop policy if exists "fis read" on fee_item_students;
create policy "fis read" on fee_item_students for select to authenticated using (exists (select 1 from fee_items f where f.id = fee_item_id));

alter table student_fee_lines add column if not exists ignored boolean not null default false;
alter table student_fee_lines add column if not exists ignored_by uuid references profiles(id) on delete set null;
alter table student_fee_lines add column if not exists ignored_at timestamptz;
alter table student_fee_lines add column if not exists origin_level smallint check (origin_level between 1 and 3);      -- level of the item a brought-forward line came from
alter table student_fee_lines add column if not exists source_line_id uuid references student_fee_lines(id) on delete set null;   -- the older line a brought-forward line replaces
alter table student_fee_lines add column if not exists carried_to uuid references student_fee_lines(id) on delete set null;       -- set on the older line once it is brought forward
alter table student_fee_lines add column if not exists carried_at timestamptz;
update student_fee_lines set origin_level = level where origin_level is null and kind = 'fee';
drop index if exists sfl_bf_unique;
create unique index if not exists sfl_bf_opening on student_fee_lines (student_id) where kind = 'brought_forward' and source_line_id is null;   -- the balance typed when the student was added
create unique index if not exists sfl_bf_source on student_fee_lines (source_line_id) where source_line_id is not null;                        -- one brought-forward line per older line
create index if not exists sfl_student_term on student_fee_lines (student_id, term_id);

create table if not exists inbox_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid references profiles(id) on delete set null,
  recipient_id uuid references profiles(id) on delete cascade,
  to_role text check (to_role in ('bursar')),
  kind text not null default 'message' check (kind in ('message', 'reminder', 'payment')),
  subject text not null check (char_length(btrim(subject)) between 1 and 120),
  body text not null default '' check (char_length(body) <= 4000),
  status text not null default 'sent' check (status in ('draft', 'sent')),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  check (status = 'draft' or recipient_id is not null or to_role is not null));
create index if not exists inbox_recipient on inbox_messages (recipient_id, created_at desc) where status = 'sent';
create index if not exists inbox_sender on inbox_messages (sender_id, status, created_at desc);
alter table inbox_messages enable row level security;
drop policy if exists "inbox read" on inbox_messages;
create policy "inbox read" on inbox_messages for select to authenticated
  using (recipient_id = auth.uid() or sender_id = auth.uid() or (to_role = 'bursar' and status = 'sent' and role_active('bursar')));
revoke insert, update, delete on inbox_messages, fee_item_students from authenticated;   -- writes go through the functions below
revoke all on inbox_messages, fee_item_students from anon;

-- Items are created, changed and deleted through the functions below (no direct writes), so every rule is enforced in one place.
drop policy if exists "fees write" on fee_items;

-- ---------- 2. opening balance helpers must ignore brought-forward lines that came from earlier terms ----------
create or replace function ensure_bf(p_student uuid, p_term uuid default null) returns void language plpgsql security definer set search_path = public as $$
declare d numeric; l student_fee_lines%rowtype; t uuid;
begin
  select debt_forward_ngn into d from students where id = p_student;
  if d is null then return; end if;
  select * into l from student_fee_lines where student_id = p_student and kind = 'brought_forward' and source_line_id is null;
  if d > 0 then
    if l.id is null then
      t := coalesce(p_term, current_term_id());
      if t is null then return; end if;
      insert into student_fee_lines (student_id, term_id, kind, title, amount_ngn) values (p_student, t, 'brought_forward', 'Balance brought forward', d) on conflict do nothing;
    elsif l.status = 'pending' and l.carried_to is null and l.amount_ngn <> d then
      update student_fee_lines set amount_ngn = d where id = l.id;
    end if;
  elsif l.id is not null and l.status = 'pending' and l.carried_to is null then
    delete from student_fee_lines where id = l.id;
  end if;
end $$;
create or replace function guard_debt_change() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.debt_forward_ngn is distinct from old.debt_forward_ngn
     and exists (select 1 from student_fee_lines where student_id = old.id and kind = 'brought_forward' and source_line_id is null and (status <> 'pending' or carried_to is not null)) then
    raise exception 'This student''s brought-forward balance is already claimed, confirmed or moved to a later term, so the amount cannot be changed.';
  end if;
  return new;
end $$;
create or replace function debt_integrity_report() returns table (student_id uuid, student_name text, problem text)
language sql stable security definer set search_path = public as $$
  select s.id, s.last_name || ' ' || s.first_name, 'Brought-forward balance has no debt record'
    from students s where (is_admin() or role_active('bursar')) and s.debt_forward_ngn > 0 and exists (select 1 from terms)
     and not exists (select 1 from student_fee_lines l where l.student_id = s.id and l.kind = 'brought_forward' and l.source_line_id is null)
  union all
  select s.id, s.last_name || ' ' || s.first_name, 'Debt record amount differs from the student''s balance brought forward'
    from students s join student_fee_lines l on l.student_id = s.id and l.kind = 'brought_forward' and l.source_line_id is null
    where (is_admin() or role_active('bursar')) and l.amount_ngn <> s.debt_forward_ngn and l.status = 'pending' and l.carried_to is null
  union all
  select s.id, s.last_name || ' ' || s.first_name, 'Debt record exists but the student has no balance brought forward'
    from students s join student_fee_lines l on l.student_id = s.id and l.kind = 'brought_forward' and l.source_line_id is null
    where (is_admin() or role_active('bursar')) and s.debt_forward_ngn = 0 and l.status = 'pending' and l.carried_to is null $$;

-- ---------- 3. which students an item reaches, and adding it to their schedules ----------
create or replace function fee_applies(p_item uuid, p_student uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from fee_items f join students st on st.id = p_student join classes c on c.id = st.class_id
    where f.id = p_item and not f.is_extramural and c.section = f.section and (
      coalesce(f.variant, '') in ('1', '2A') or (f.variant = '2B' and c.sub_section = f.sub_section) or (f.variant = '3A' and st.class_id = f.class_id)
      or (f.variant = '3B' and exists (select 1 from fee_item_students x where x.fee_item_id = f.id and x.student_id = st.id)))) $$;

create or replace function fee_apply_item(p_item uuid) returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into student_fee_lines (student_id, term_id, fee_item_id, kind, level, title, amount_ngn, origin_level)
  select st.id, f.term_id, f.id, 'fee', f.level, f.title, f.amount_ngn, f.level
  from fee_items f join students st on st.status = 'active' join classes c on c.id = st.class_id
  where f.id = p_item and not f.is_extramural and c.section = f.section and term_is_open(f.term_id, st.id) and (
      coalesce(f.variant, '') in ('1', '2A') or (f.variant = '2B' and c.sub_section = f.sub_section) or (f.variant = '3A' and st.class_id = f.class_id)
      or (f.variant = '3B' and exists (select 1 from fee_item_students x where x.fee_item_id = f.id and x.student_id = st.id)))
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- a student who joins, or moves class, gets the items of the current and coming terms that apply to them
create or replace function fee_apply_student(p_student uuid) returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into student_fee_lines (student_id, term_id, fee_item_id, kind, level, title, amount_ngn, origin_level)
  select st.id, f.term_id, f.id, 'fee', f.level, f.title, f.amount_ngn, f.level
  from students st join classes c on c.id = st.class_id join fee_items f on f.section = c.section and not f.is_extramural
  join terms t on t.id = f.term_id and t.ends_on >= att_today()
  where st.id = p_student and st.status = 'active' and term_is_open(f.term_id, st.id) and (
      coalesce(f.variant, '') in ('1', '2A') or (f.variant = '2B' and c.sub_section = f.sub_section) or (f.variant = '3A' and st.class_id = f.class_id)
      or (f.variant = '3B' and exists (select 1 from fee_item_students x where x.fee_item_id = f.id and x.student_id = st.id)))
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
create or replace function trg_student_fee_lines() returns trigger language plpgsql security definer set search_path = public as $$
begin perform fee_apply_student(new.id); return new; end $$;
drop trigger if exists trg_students_fee_lines on students;
create trigger trg_students_fee_lines after insert or update of class_id on students for each row execute function trg_student_fee_lines();

create or replace function create_fee_item(p_term uuid, p_variant text, p_section school_section, p_class uuid, p_sub sub_section_name, p_title text, p_amount numeric, p_students uuid[] default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare lv smallint; sec school_section := p_section; fid uuid; n int; ids uuid[] := coalesce(p_students, '{}');
begin
  if p_variant not in ('1', '2A', '2B', '3A', '3B') then raise exception 'Choose a schedule level.'; end if;
  lv := left(p_variant, 1)::smallint;
  if lv = 3 then
    if p_class is null then raise exception 'Choose the class.'; end if;
    sec := class_section(p_class);
  elsif sec is null then raise exception 'Choose the section.'; end if;
  if not fee_writer(lv, sec, p_class) then raise exception 'You cannot set this level of schedule (Level 1: bursar; Level 2: principal or headmaster/headmistress; Level 3: class teacher or form master).'; end if;
  if char_length(btrim(coalesce(p_title, ''))) < 2 then raise exception 'Give the item a name.'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'The amount must be more than zero.'; end if;
  if not exists (select 1 from terms where id = p_term) then raise exception 'Term not found.'; end if;
  if p_variant = '2B' and not ((sec = 'basic' and p_sub in ('nursery', 'primary')) or (sec = 'secondary' and p_sub in ('junior', 'senior'))) then raise exception 'Choose a sub-section that belongs to this section.'; end if;
  if p_variant = '3B' then
    if cardinality(ids) = 0 then raise exception 'Choose at least one student.'; end if;
    if (select count(*) from students where id = any (ids) and class_id = p_class and status = 'active') <> (select count(distinct x) from unnest(ids) x) then raise exception 'Every chosen student must be an active student of this class.'; end if;
  end if;
  insert into fee_items (term_id, level, section, class_id, title, amount_ngn, variant, sub_section, created_by)
    values (p_term, lv, sec, case when lv = 3 then p_class end, left(btrim(p_title), 100), p_amount, p_variant, case when p_variant = '2B' then p_sub end, auth.uid()) returning id into fid;
  if p_variant = '3B' then insert into fee_item_students (fee_item_id, student_id) select fid, x from (select distinct unnest(ids) x) q; end if;
  n := fee_apply_item(fid);
  return jsonb_build_object('id', fid, 'students', n);
end $$;

create or replace function update_fee_item(p_id uuid, p_title text, p_amount numeric) returns int language plpgsql security definer set search_path = public as $$
declare f fee_items; n int;
begin
  select * into f from fee_items where id = p_id; if not found then raise exception 'Item not found.'; end if;
  if f.is_extramural or not fee_writer(f.level, f.section, f.class_id) then raise exception 'You cannot change this item.'; end if;
  if char_length(btrim(coalesce(p_title, ''))) < 2 or p_amount is null or p_amount <= 0 then raise exception 'Give a name and an amount above zero.'; end if;
  update fee_items set title = left(btrim(p_title), 100), amount_ngn = p_amount where id = p_id;
  update student_fee_lines set title = left(btrim(p_title), 100), amount_ngn = p_amount where fee_item_id = p_id and status = 'pending' and carried_to is null;
  get diagnostics n = row_count; return n;   -- lines already sent for payment, cleared or brought forward keep their old figures
end $$;
create or replace function delete_fee_item(p_id uuid) returns void language plpgsql security definer set search_path = public as $$
declare f fee_items;
begin
  select * into f from fee_items where id = p_id; if not found then return; end if;
  if f.is_extramural or not fee_writer(f.level, f.section, f.class_id) then raise exception 'You cannot delete this item.'; end if;
  if exists (select 1 from student_fee_lines where fee_item_id = p_id and (status <> 'pending' or carried_to is not null)) then
    raise exception 'Some students have already paid, sent evidence for, or had this item brought forward, so it cannot be deleted.'; end if;
  delete from student_fee_lines where fee_item_id = p_id;
  delete from fee_items where id = p_id;
end $$;
-- the older "issue schedule" button stays as a catch-up: it only adds lines that are missing, and sends nothing by e-mail
create or replace function issue_schedule(p_term uuid, p_class uuid default null) returns int language plpgsql security definer set search_path = public as $$
declare n int := 0; f record; s record;
begin
  if not (is_admin() or role_active('bursar')) then raise exception 'Only the bursar can issue schedules'; end if;
  for f in select id from fee_items where term_id = p_term and not is_extramural loop n := n + fee_apply_item(f.id); end loop;
  for s in select id from students where status = 'active' and (p_class is null or class_id = p_class) and debt_forward_ngn > 0 loop perform ensure_bf(s.id, p_term); end loop;
  return n;
end $$;

-- ---------- 4. cleared, ignored, settled ----------
create or replace function line_settled(p_line uuid) returns boolean language plpgsql stable security definer set search_path = public as $$
declare l student_fee_lines; cur uuid := p_line; n int := 0;
begin
  loop
    select * into l from student_fee_lines where id = cur;
    if not found then return false; end if;
    if l.status = 'confirmed' then return true; end if;
    if l.carried_to is null or n > 20 then return false; end if;
    cur := l.carried_to; n := n + 1;
  end loop;
end $$;

create or replace function can_ignore_line(p_line uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from student_fee_lines l where l.id = p_line and (
    is_admin()
    or (coalesce(l.origin_level, l.level) = 3 and role_active('bursar'))
    or (coalesce(l.origin_level, l.level) is null and role_active('bursar'))
    or (coalesce(l.origin_level, l.level) in (1, 2) and role_in_section(array['principal', 'headmaster']::app_role[], student_section(l.student_id)))
    or (coalesce(l.origin_level, l.level) = 1 and leads_student(l.student_id)))) $$;

create or replace function ignore_lines(p_lines uuid[], p_note text default null) returns jsonb language plpgsql security definer set search_path = public as $$
declare l student_fee_lines; ok int := 0; denied int := 0; busy int := 0; v_id uuid;
begin
  if p_lines is null or cardinality(p_lines) = 0 then raise exception 'Choose at least one schedule line.'; end if;
  if cardinality(p_lines) > 2000 then raise exception 'Choose at most 2000 lines at a time.'; end if;
  for v_id in select distinct unnest(p_lines) loop
    select * into l from student_fee_lines where student_fee_lines.id = v_id for update;
    if not found or l.status = 'confirmed' or l.carried_to is not null then continue; end if;
    if not can_ignore_line(l.id) then denied := denied + 1; continue; end if;
    if l.status = 'claimed' then busy := busy + 1; continue; end if;     -- evidence is waiting for the bursar: decide that first
    update student_fee_lines set status = 'confirmed', ignored = true, ignored_by = auth.uid(), ignored_at = now(), confirmed_at = now(), confirmed_by = auth.uid(), review_note = left(nullif(btrim(p_note), ''), 200)
      where student_fee_lines.id = l.id;
    ok := ok + 1;
  end loop;
  return jsonb_build_object('ignored', ok, 'not_allowed', denied, 'awaiting_bursar', busy);
end $$;

-- a parent may be shown results only when every line of the term is settled (cleared, ignored, or cleared through its brought-forward line)
create or replace function term_cleared(p_student uuid, p_term uuid) returns boolean language sql stable security definer set search_path = public as $$
  select not exists (select 1 from student_fee_lines l where l.student_id = p_student and l.term_id = p_term and not line_settled(l.id))
     and not exists (select 1 from fee_items f where f.term_id = p_term and not f.is_extramural and fee_applies(f.id, p_student)
                       and not exists (select 1 from student_fee_lines l where l.student_id = p_student and l.fee_item_id = f.id)) $$;

-- ---------- 5. carry-forward ----------
create or replace function carry_into(p_term uuid) returns int language plpgsql security definer set search_path = public as $$
declare t terms; n int;
begin
  select * into t from terms where id = p_term; if not found then return 0; end if;
  with src as (
    select l.id, l.student_id, l.title, l.amount_ngn, coalesce(l.origin_level, l.level) olvl, tt.number tn, y.name yn
    from student_fee_lines l join terms tt on tt.id = l.term_id join academic_years y on y.id = tt.year_id join students s on s.id = l.student_id
    where tt.starts_on < t.starts_on and l.status = 'pending' and l.carried_to is null and s.status = 'active' and term_is_open(p_term, s.id)),
  ins as (
    insert into student_fee_lines (student_id, term_id, kind, title, amount_ngn, origin_level, source_line_id)
    select student_id, p_term, 'brought_forward', left('B/F: ' || title || ' (Term ' || tn || ', ' || yn || ')', 100), amount_ngn, olvl, id from src
    on conflict do nothing returning id, source_line_id)
  update student_fee_lines l set carried_to = ins.id, carried_at = now() from ins where l.id = ins.source_line_id;
  get diagnostics n = row_count;
  return n;
end $$;
-- carries into every term that has begun (idempotent; the pages call it when they open, so a rejected payment or a late term is picked up too)
create or replace function carry_due() returns int language plpgsql security definer set search_path = public as $$
declare t record; n int := 0;
begin
  for t in select id from terms where starts_on <= att_today() order by starts_on loop n := n + carry_into(t.id); end loop;
  return n;
end $$;
create or replace function trg_term_after_insert() returns trigger language plpgsql security definer set search_path = public as $$
declare s record;
begin
  for s in select id from students st where st.debt_forward_ngn > 0 and not exists (select 1 from student_fee_lines l where l.student_id = st.id and l.kind = 'brought_forward' and l.source_line_id is null) loop
    perform ensure_bf(s.id);
  end loop;
  -- a new session's first term (or any term already under way) takes in everything not cleared, at once
  if new.starts_on <= att_today() or new.number = (select min(number) from terms where year_id = new.year_id) then perform carry_into(new.id); end if;
  return new;
end $$;
drop trigger if exists trg_terms_bf on terms;
drop trigger if exists trg_terms_after_insert on terms;
create trigger trg_terms_after_insert after insert on terms for each row execute function trg_term_after_insert();

-- ---------- 6. schedule rows for viewing and downloading (scope decided inside) ----------
-- admin and bursar: everyone; section heads, exam officers: their section; class teachers: their own class
create or replace function fee_schedule(p_term uuid default null, p_year uuid default null) returns table (
  line_id uuid, student_id uuid, student_name text, admission_no text, gender text, class_id uuid, class_name text, section school_section, sub_section sub_section_name,
  parents text, term_id uuid, term_number smallint, year_name text, kind text, level smallint, variant text, title text, amount_ngn numeric, state text,
  claimed_at timestamptz, confirmed_at timestamptz, note text, origin_level smallint)
language sql stable security definer set search_path = public as $$
  select l.id, s.id, s.last_name || ' ' || s.first_name, s.admission_no, s.gender::text, c.id, c.name, c.section, c.sub_section,
         (select string_agg(coalesce(p.full_name, p.username, p.email), ', ' order by p.full_name) from guardians g join profiles p on p.id = g.parent_id where g.student_id = s.id),
         t.id, t.number, y.name, l.kind, l.level, case when l.kind = 'brought_forward' then 'B/F' else f.variant end, l.title, l.amount_ngn,
         case when l.ignored then 'ignored' when l.status = 'confirmed' then 'cleared' when l.carried_to is not null then 'carried' when l.status = 'claimed' then 'awaiting' else 'outstanding' end,
         l.claimed_at, l.confirmed_at, l.review_note, coalesce(l.origin_level, l.level)
  from student_fee_lines l join students s on s.id = l.student_id join classes c on c.id = s.class_id
  join terms t on t.id = l.term_id join academic_years y on y.id = t.year_id left join fee_items f on f.id = l.fee_item_id
  where (p_term is null or l.term_id = p_term) and (p_year is null or t.year_id = p_year)
    and (is_admin() or role_active('bursar') or can_view_fees(c.section) or leads_class(c.id))
  order by c.name, s.last_name, s.first_name, l.kind desc, l.title
  limit 20000 $$;

-- the fee ledger used by the debtor lists: a line that was brought forward is no longer owed where it was
create or replace function fee_ledger(p_term uuid default null, p_year uuid default null)
returns table (line_id uuid, student_id uuid, student_name text, admission_no text, student_status student_status, class_id uuid, class_name text, section school_section,
               term_id uuid, term_number smallint, year_name text, kind text, level smallint, title text, amount_ngn numeric, status text,
               claimed_at timestamptz, claim_reference text, confirmed_at timestamptz, review_note text)
language sql stable security definer set search_path = public as $$
  select l.id, s.id, s.last_name || ' ' || s.first_name, s.admission_no, s.status, c.id, c.name, c.section,
         t.id, t.number, y.name, l.kind, l.level, l.title, l.amount_ngn, l.status, l.claimed_at, l.claim_reference, l.confirmed_at, l.review_note
  from student_fee_lines l join students s on s.id = l.student_id join classes c on c.id = s.class_id
  join terms t on t.id = l.term_id join academic_years y on y.id = t.year_id
  where (p_term is null or l.term_id = p_term) and (p_year is null or t.year_id = p_year) and l.carried_to is null
    and (is_admin() or role_active('bursar') or can_view_fees(c.section) or leads_class(c.id)) $$;

-- ---------- 7. bursar: queue with filters, many at once, notes, reminders ----------
create or replace function bursar_queue(p_status text default 'pending', p_term uuid default null, p_year uuid default null)
returns table (id uuid, status text, reference text, amount_ngn numeric, teller_path text, created_at timestamptz, reviewed_at timestamptz, review_note text, receipt_no text,
               student_id uuid, student_name text, admission_no text, class_name text, section school_section, parent_id uuid, parent_name text, items jsonb, items_total numeric)
language sql stable security definer set search_path = public as $$
  select p.id, p.status, p.reference, p.amount_ngn, p.teller_path, p.created_at, p.reviewed_at, p.review_note, p.receipt_no,
         s.id, s.last_name || ' ' || s.first_name, s.admission_no, c.name, c.section, p.parent_id, coalesce(pr.full_name, pr.username, pr.email),
         (select coalesce(jsonb_agg(jsonb_build_object('title', l.title, 'amount', l.amount_ngn, 'term', t.number, 'year', y.name) order by l.title), '[]'::jsonb)
            from payment_submission_lines k join student_fee_lines l on l.id = k.line_id join terms t on t.id = l.term_id join academic_years y on y.id = t.year_id where k.submission_id = p.id),
         (select coalesce(sum(l.amount_ngn), 0) from payment_submission_lines k join student_fee_lines l on l.id = k.line_id where k.submission_id = p.id)
  from payment_submissions p join students s on s.id = p.student_id join classes c on c.id = s.class_id left join profiles pr on pr.id = p.parent_id
  where (is_admin() or role_active('bursar')) and (p_status is null or p_status = 'all' or p.status = p_status)
    and (p_term is null and p_year is null or exists (select 1 from payment_submission_lines k join student_fee_lines l on l.id = k.line_id join terms t on t.id = l.term_id
          where k.submission_id = p.id and (p_term is null or t.id = p_term) and (p_year is null or t.year_id = p_year)))
  order by p.created_at desc limit 500 $$;

-- confirm or reject: tells the parent in the inbox (no e-mail needed)
create or replace function review_submission(p_id uuid, p_accept boolean, p_note text default null) returns int
language plpgsql security definer set search_path = public as $$
declare s payment_submissions%rowtype; n int; v_name text;
begin
  if not role_active('bursar') then raise exception 'Only the bursar can confirm or reject a payment'; end if;
  select * into s from payment_submissions where id = p_id for update;
  if not found then raise exception 'Payment not found'; end if;
  if s.status <> 'pending' then raise exception 'This payment has already been %', s.status; end if;
  select last_name || ' ' || first_name into v_name from students where id = s.student_id;
  if p_accept then
    update student_fee_lines set status = 'confirmed', confirmed_at = now(), confirmed_by = auth.uid(), review_note = left(p_note, 200)
    where id in (select line_id from payment_submission_lines where submission_id = p_id) and status in ('claimed', 'pending');
    get diagnostics n = row_count;
    update payment_submissions set status = 'confirmed', reviewed_by = auth.uid(), reviewed_at = now(), review_note = left(p_note, 200),
      receipt_no = 'BA-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('receipt_seq')::text, 6, '0') where id = p_id;
    insert into inbox_messages (sender_id, recipient_id, kind, subject, body) values (auth.uid(), s.parent_id, 'payment', 'Payment confirmed: ' || v_name,
      'Your payment (teller ' || s.reference || ') for ' || v_name || ' was confirmed and the items are now cleared.' || coalesce(E'\nNote: ' || nullif(btrim(p_note), ''), ''));
  else
    if char_length(btrim(coalesce(p_note, ''))) < 3 then raise exception 'Write a short reason so the parent knows why'; end if;
    update student_fee_lines set status = 'pending', claimed_at = null, claimed_by = null, claim_reference = null, review_note = left(p_note, 200)
    where id in (select line_id from payment_submission_lines where submission_id = p_id) and status = 'claimed';
    get diagnostics n = row_count;
    update payment_submissions set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), review_note = left(p_note, 200) where id = p_id;
    insert into inbox_messages (sender_id, recipient_id, kind, subject, body) values (auth.uid(), s.parent_id, 'payment', 'Payment not confirmed: ' || v_name,
      'Your payment (teller ' || s.reference || ') for ' || v_name || ' could not be confirmed.' || E'\nReason: ' || btrim(p_note) || E'\nYou can upload the evidence again from Payment schedule.');
  end if;
  return n;
end $$;
create or replace function review_submissions(p_ids uuid[], p_accept boolean, p_note text default null) returns jsonb language plpgsql security definer set search_path = public as $$
declare i uuid; ok int := 0; skipped int := 0;
begin
  if not role_active('bursar') then raise exception 'Only the bursar can confirm or reject payments'; end if;
  if p_ids is null or cardinality(p_ids) = 0 then raise exception 'Tick at least one payment.'; end if;
  if not p_accept and char_length(btrim(coalesce(p_note, ''))) < 3 then raise exception 'Write a short reason so the parents know why'; end if;
  for i in select distinct unnest(p_ids) loop
    begin perform review_submission(i, p_accept, p_note); ok := ok + 1;
    exception when others then skipped := skipped + 1; end;
  end loop;
  return jsonb_build_object('done', ok, 'skipped', skipped);
end $$;

-- a line brought forward cannot be paid where it was; a parent pays the brought-forward line in the new term
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
  select count(*) into have from student_fee_lines l where l.id = any (p_lines) and l.student_id = p_student and l.status = 'pending' and l.carried_to is null;
  if have <> want then raise exception 'Some of those items are already paid, awaiting the bursar, brought forward to a later term, or are not this child''s'; end if;
  begin
    insert into payment_submissions (parent_id, student_id, teller_path, reference, amount_ngn) values (auth.uid(), p_student, p_path, left(ref, 80), p_amount) returning id into sid;
  exception when unique_violation then raise exception 'That teller or reference number has already been submitted'; end;
  insert into payment_submission_lines (submission_id, line_id) select sid, x from (select distinct unnest(p_lines) x) q;
  update student_fee_lines set status = 'claimed', claimed_at = now(), claimed_by = auth.uid(), claim_reference = left(ref, 80), review_note = null where id = any (p_lines);
  return sid;
end $$;

-- one button: a personalised reminder in each parent's inbox for the students chosen (or every student with an uncleared line in the term/class)
create or replace function notify_uncleared(p_term uuid, p_class uuid default null, p_students uuid[] default null) returns int
language plpgsql security definer set search_path = public as $$
declare n int; label text;
begin
  if not role_active('bursar') then raise exception 'Only the bursar can send fee reminders.'; end if;
  select 'Term ' || t.number || ', ' || y.name into label from terms t join academic_years y on y.id = t.year_id where t.id = p_term;
  if label is null then raise exception 'Choose a term.'; end if;
  with owed as (
    select g.parent_id, s.id sid, s.last_name || ' ' || s.first_name nm, c.name cn, l.title, l.amount_ngn, l.kind
    from student_fee_lines l join students s on s.id = l.student_id join classes c on c.id = s.class_id join guardians g on g.student_id = s.id
    where l.term_id = p_term and l.status = 'pending' and l.carried_to is null and s.status = 'active'
      and (p_class is null or s.class_id = p_class) and (p_students is null or s.id = any (p_students))),
  per as (
    select parent_id, sum(amount_ngn) total,
      string_agg(nm || ' (' || cn || '): ' || title || ' - ₦' || to_char(amount_ngn, 'FM999,999,999,990.00'), E'\n' order by nm, kind desc, title) body
    from owed group by parent_id),
  ins as (
    insert into inbox_messages (sender_id, recipient_id, kind, subject, body)
    select auth.uid(), parent_id, 'reminder', 'Fee reminder: ' || label,
      'Dear parent/guardian,' || E'\n\nThese items are not yet cleared for ' || label || E':\n\n' || body || E'\n\nTotal outstanding: ₦' || to_char(total, 'FM999,999,999,990.00')
      || E'\n\nPlease pay and upload the teller under Payment schedule. If you have already paid, please ignore this reminder.' from per returning 1)
  select count(*) into n from ins;
  return n;
end $$;

-- ---------- 8. parent inbox ----------
create or replace function inbox_save_draft(p_id uuid, p_subject text, p_body text) returns uuid language plpgsql security definer set search_path = public as $$
declare v uuid := p_id;
begin
  if not role_active('parent') then raise exception 'Only parents write messages here.'; end if;
  if v is null then
    insert into inbox_messages (sender_id, to_role, kind, subject, body, status) values (auth.uid(), 'bursar', 'message', left(coalesce(nullif(btrim(p_subject), ''), '(no subject)'), 120), left(coalesce(p_body, ''), 4000), 'draft') returning id into v;
  else
    update inbox_messages set subject = left(coalesce(nullif(btrim(p_subject), ''), '(no subject)'), 120), body = left(coalesce(p_body, ''), 4000) where id = v and sender_id = auth.uid() and status = 'draft';
    if not found then raise exception 'Draft not found.'; end if;
  end if;
  return v;
end $$;
create or replace function inbox_send(p_id uuid, p_subject text, p_body text) returns void language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if char_length(btrim(coalesce(p_body, ''))) < 2 then raise exception 'Write your message first.'; end if;
  v := inbox_save_draft(p_id, p_subject, p_body);
  update inbox_messages set status = 'sent', created_at = now() where id = v and sender_id = auth.uid();
end $$;
create or replace function inbox_delete_draft(p_id uuid) returns void language sql security definer set search_path = public as
$$ delete from inbox_messages where id = p_id and sender_id = auth.uid() and status = 'draft' $$;
create or replace function inbox_mark_read(p_ids uuid[]) returns void language sql security definer set search_path = public as
$$ update inbox_messages set read_at = now() where id = any (p_ids) and read_at is null and (recipient_id = auth.uid() or (to_role = 'bursar' and role_active('bursar'))) $$;

-- ---------- 8b. older finance readers that must understand carried and ignored lines ----------
create or replace function owed_overview()
returns table (student_id uuid, student_name text, admission_no text, class_name text, section school_section, student_status student_status, owed numeric, bf_status text)
language sql stable security definer set search_path = public as $$
  select s.id, s.last_name || ' ' || s.first_name, s.admission_no, c.name, c.section, s.status, s.debt_forward_ngn, coalesce(l.status, 'not yet in a schedule')
  from students s join classes c on c.id = s.class_id
  left join student_fee_lines l on l.student_id = s.id and l.kind = 'brought_forward' and l.source_line_id is null
  where s.debt_forward_ngn > 0 and coalesce(l.status, 'pending') <> 'confirmed' and l.carried_to is null
    and (is_admin() or role_active('bursar') or can_view_fees(c.section))
  order by s.last_name, s.first_name $$;
-- status is shown as: pending | claimed | confirmed | ignored (cleared by an authorised user) | carried (brought forward to a later term)
create or replace function student_finance_record(p_student uuid)
returns table (term_id uuid, term_number smallint, year_name text, starts_on date, line_id uuid, kind text, level smallint, title text, amount_ngn numeric,
               status text, claim_reference text, confirmed_at timestamptz, review_note text, term_is_cleared boolean)
language sql stable security definer set search_path = public as $$
  select t.id, t.number, y.name, t.starts_on, l.id, l.kind, l.level, l.title, l.amount_ngn,
         case when l.ignored then 'ignored' when l.status <> 'confirmed' and l.carried_to is not null then 'carried' else l.status end,
         l.claim_reference, l.confirmed_at, l.review_note, term_cleared(p_student, t.id)
  from student_fee_lines l join terms t on t.id = l.term_id join academic_years y on y.id = t.year_id
  where l.student_id = p_student and (is_admin() or role_active('bursar') or can_view_fees(student_section(p_student)) or parent_of(p_student))
  order by t.starts_on, l.kind desc, l.level, l.title $$;

-- the bursar reads messages parents wrote to the school bursar
create or replace function bursar_messages() returns table (id uuid, subject text, body text, created_at timestamptz, read_at timestamptz, sender_name text, children text)
language sql stable security definer set search_path = public as $$
  select m.id, m.subject, m.body, m.created_at, m.read_at, coalesce(p.full_name, p.username, p.email),
         (select string_agg(s.last_name || ' ' || s.first_name || ' (' || c.name || ')', ', ') from guardians g join students s on s.id = g.student_id join classes c on c.id = s.class_id where g.parent_id = m.sender_id)
  from inbox_messages m left join profiles p on p.id = m.sender_id
  where role_active('bursar') and m.to_role = 'bursar' and m.status = 'sent' order by m.created_at desc limit 200 $$;

-- ---------- 9. grants ----------
do $$ declare f text; begin
  foreach f in array array['create_fee_item(uuid,text,school_section,uuid,sub_section_name,text,numeric,uuid[])', 'update_fee_item(uuid,text,numeric)', 'delete_fee_item(uuid)', 'issue_schedule(uuid,uuid)',
    'ignore_lines(uuid[],text)', 'can_ignore_line(uuid)', 'line_settled(uuid)', 'term_cleared(uuid,uuid)', 'carry_due()', 'fee_schedule(uuid,uuid)', 'fee_ledger(uuid,uuid)', 'bursar_queue(text,uuid,uuid)',
    'review_submission(uuid,boolean,text)', 'review_submissions(uuid[],boolean,text)', 'submit_payment(uuid,uuid[],text,text,numeric)', 'notify_uncleared(uuid,uuid,uuid[])',
    'inbox_save_draft(uuid,text,text)', 'inbox_send(uuid,text,text)', 'inbox_delete_draft(uuid)', 'inbox_mark_read(uuid[])', 'fee_applies(uuid,uuid)', 'bursar_messages()', 'owed_overview()', 'student_finance_record(uuid)']
  loop execute format('revoke execute on function %s from public, anon', f); execute format('grant execute on function %s to authenticated', f); end loop;
  foreach f in array array['carry_into(uuid)', 'fee_apply_item(uuid)', 'fee_apply_student(uuid)']
  loop execute format('revoke execute on function %s from public, anon, authenticated', f); end loop;
end $$;

commit;
notify pgrst, 'reload schema';
