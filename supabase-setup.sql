-- Homework Record Book cloud sync setup (run once in Supabase SQL Editor)
-- Before using the website:
-- 1. In Authentication settings, disable "Allow new users to sign up" and anonymous sign-ins.
-- 2. In Authentication > Users, create/confirm the teacher account used on all devices.
-- This keeps shared class and student data private to teacher accounts you create.
-- The website signs in existing users only.

create table if not exists public.homework_sync_state (
  id text primary key check (id = 'main'),
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.homework_sync_state enable row level security;
revoke all on public.homework_sync_state from public, anon;
grant select, insert, update on public.homework_sync_state to authenticated;

drop policy if exists "Teachers can sync homework state" on public.homework_sync_state;
create policy "Teachers can sync homework state"
  on public.homework_sync_state
  for all
  to authenticated
  using (auth.uid() is not null and (auth.jwt() ->> 'is_anonymous') is distinct from 'true')
  with check (auth.uid() is not null and (auth.jwt() ->> 'is_anonymous') is distinct from 'true');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'homework-samples',
  'homework-samples',
  false,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Teachers can manage homework samples" on storage.objects;
create policy "Teachers can manage homework samples"
  on storage.objects
  for all
  to authenticated
  using (bucket_id = 'homework-samples' and auth.uid() is not null)
  with check (bucket_id = 'homework-samples' and auth.uid() is not null);

do $$
begin
  alter publication supabase_realtime add table public.homework_sync_state;
exception
  when duplicate_object then null;
end $$;