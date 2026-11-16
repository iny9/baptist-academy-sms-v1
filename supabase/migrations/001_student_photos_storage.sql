-- make sure the student photo storage exists. Safe to run more than once.
begin;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('student-photos', 'student-photos', true, 3145728, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 3145728, allowed_mime_types = array['image/jpeg','image/png','image/webp'];
drop policy if exists "student photo read" on storage.objects;
create policy "student photo read" on storage.objects for select using (bucket_id = 'student-photos');
commit;
