-- Run immediately before publishing the API-based website.
-- Fails safely if the old site has changed the snapshot since migration 01.
begin;

do $$
begin
  if not exists (select 1 from public.homework_workspaces) then
    raise exception 'Run migration 01 first';
  end if;
  if exists (
    select 1 from public.homework_workspaces w
    cross join public.homework_sync_state s
    where s.id = 'main' and w.source_updated_at is distinct from s.updated_at
  ) then
    raise exception 'Legacy data changed after migration; migrate the latest snapshot before cutover';
  end if;
end $$;

alter table public.homework_sync_state add column if not exists owner_id uuid;
update public.homework_sync_state
  set owner_id = (select owner_id from public.homework_workspaces limit 1)
  where id = 'main' and owner_id is null;
alter table public.homework_sync_state alter column owner_id set not null;

drop policy if exists "Teachers can sync homework state" on public.homework_sync_state;
drop policy if exists "Teacher can read legacy backup" on public.homework_sync_state;
create policy "Teacher can read legacy backup"
  on public.homework_sync_state for select to authenticated
  using (owner_id = (select auth.uid()) and (select auth.jwt()->>'is_anonymous') is distinct from 'true');
revoke all on public.homework_sync_state from public, anon, authenticated;
grant select on public.homework_sync_state to authenticated;

drop policy if exists "Teachers can manage homework samples" on storage.objects;
drop policy if exists "Teacher owns assignment samples" on storage.objects;
create policy "Teacher owns assignment samples"
  on storage.objects for all to authenticated
  using (
    bucket_id = 'homework-samples'
    and (select auth.jwt()->>'is_anonymous') is distinct from 'true'
    and exists (
      select 1 from public.homework_assignments a
      where a.id = name and a.owner_id = (select auth.uid())
    )
  )
  with check (
    bucket_id = 'homework-samples'
    and (select auth.jwt()->>'is_anonymous') is distinct from 'true'
    and exists (
      select 1 from public.homework_assignments a
      where a.id = name and a.owner_id = (select auth.uid())
    )
  );

commit;
