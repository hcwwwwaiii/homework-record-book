-- Approved teachers own separate workspaces. No existing homework rows are moved.
begin;

create table private.homework_site_admins (
  user_id uuid primary key references auth.users(id)
);
create table private.homework_teacher_approvals (
  email text primary key check (email = lower(btrim(email))),
  user_id uuid unique references auth.users(id),
  enabled boolean not null default true,
  approved_by uuid not null references auth.users(id),
  approved_at timestamptz not null default now()
);
alter table private.homework_site_admins enable row level security;
alter table private.homework_teacher_approvals enable row level security;
revoke all on private.homework_site_admins, private.homework_teacher_approvals from public, anon, authenticated;

-- Bootstrap only the already-existing sole workspace owner as administrator.
do $$
declare v_admin uuid;
begin
  if (select count(*) from public.homework_workspaces) <> 1 then
    raise exception 'Expected exactly one existing workspace; review administrator assignment';
  end if;
  select owner_id into v_admin from public.homework_workspaces;
  if not exists (select 1 from auth.users where id=v_admin and email_confirmed_at is not null) then
    raise exception 'Existing administrator must have a verified email';
  end if;
  insert into private.homework_site_admins values (v_admin);
  insert into private.homework_teacher_approvals(email,user_id,approved_by)
    select lower(btrim(email)),id,v_admin from auth.users where id=v_admin;
end $$;

-- These narrow helpers read private authorization data; no caller-controlled owner ID.
-- SECURITY DEFINER is required because auth.users and the approval registry are private.
create function private.homework_allowed()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and (auth.jwt()->>'is_anonymous') is distinct from 'true'
    and exists (
      select 1 from private.homework_teacher_approvals a join auth.users u on u.id=auth.uid()
      where a.enabled and u.email_confirmed_at is not null
        and (a.user_id=u.id or (a.user_id is null and a.email=lower(btrim(u.email))))
    );
$$;
create function private.homework_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select private.homework_allowed() and exists (
    select 1 from private.homework_site_admins where user_id=auth.uid()
  );
$$;
revoke all on function private.homework_allowed(), private.homework_admin() from public, anon, authenticated;
-- Schema usage does not grant table access. Only this boolean predicate is exposed to RLS.
grant usage on schema private to authenticated;
grant execute on function private.homework_allowed() to authenticated;

create function private.homework_open_workspace()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := auth.uid(); v_email text; v_inserted integer;
begin
  if not private.homework_allowed() then
    raise exception 'teacher_approval_required' using errcode='42501';
  end if;
  select lower(btrim(email)) into v_email from auth.users where id=v_owner;
  -- Bind an approved email to its first verified account; later email changes cannot steal a workspace.
  perform 1 from private.homework_teacher_approvals
    where enabled and (user_id=v_owner or (user_id is null and email=v_email)) for update;
  if not found then raise exception 'teacher_approval_required' using errcode='42501'; end if;
  update private.homework_teacher_approvals set user_id=v_owner
    where user_id is null and email=v_email and enabled
      and not exists(select 1 from private.homework_teacher_approvals where user_id=v_owner);
  insert into public.homework_workspaces(owner_id,metadata)
    values(v_owner,'{"dailyRecordVersion":1,"rosterSeedVersion":1,"misses":[],"absences":[],"excellentByMonth":[]}'::jsonb)
    on conflict(owner_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted=1 then
    insert into public.homework_classes(owner_id,id,name,subject,payload)
      select v_owner,x->>'id',x->>'name',x->>'subject',x
      from jsonb_array_elements('[{"id":"math-a","name":"數學 A 班","subject":"數學"},{"id":"math-b","name":"數學 B 班","subject":"數學"},{"id":"physics","name":"物理班","subject":"物理"}]'::jsonb) x;
  end if;
  return public.homework_load() || jsonb_build_object('isAdmin',private.homework_admin(),'newWorkspace',v_inserted=1);
end $$;

-- Only the original administrator can approve/revoke emails; other teachers cannot list them.
create function private.homework_manage_teachers(p_email text default null,p_enabled boolean default true)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_email text := lower(btrim(p_email));
begin
  if not private.homework_admin() then
    raise exception 'teacher_admin_required' using errcode='42501';
  end if;
  if p_email is not null then
    if v_email is null or length(v_email)>254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or p_enabled is null then
      raise exception 'invalid_teacher_email' using errcode='22023';
    end if;
    if not p_enabled and exists (
      select 1 from private.homework_teacher_approvals a join private.homework_site_admins s on s.user_id=a.user_id where a.email=v_email
    ) then raise exception 'cannot_revoke_administrator' using errcode='42501'; end if;
    insert into private.homework_teacher_approvals(email,enabled,approved_by)
      values(v_email,p_enabled,auth.uid())
      on conflict(email) do update set enabled=excluded.enabled,approved_by=excluded.approved_by,approved_at=now();
  end if;
  return jsonb_build_object('teachers',coalesce((
    select jsonb_agg(jsonb_build_object('email',a.email,'enabled',a.enabled,'registered',a.user_id is not null,
      'isAdmin',exists(select 1 from private.homework_site_admins s where s.user_id=a.user_id)) order by a.approved_at)
    from private.homework_teacher_approvals a),'[]'::jsonb));
end $$;

revoke all on function private.homework_open_workspace(),private.homework_manage_teachers(text,boolean) from public, anon, authenticated;
grant execute on function private.homework_open_workspace(),private.homework_manage_teachers(text,boolean) to authenticated;
create function public.homework_open_workspace()
returns jsonb language sql security invoker set search_path = '' as $$
  select private.homework_open_workspace();
$$;
create function public.homework_manage_teachers(p_email text default null,p_enabled boolean default true)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.homework_manage_teachers(p_email,p_enabled);
$$;
revoke all on function public.homework_open_workspace(),public.homework_manage_teachers(text,boolean) from public, anon;
grant execute on function public.homework_open_workspace(),public.homework_manage_teachers(text,boolean) to authenticated;

-- Preserve every existing API body and owner filter; add approval checks at entry.
do $$
declare v_signature text; v_definition text;
begin
  foreach v_signature in array array['public.homework_load()','public.homework_apply_patch(bigint,jsonb)'] loop
    v_definition := pg_get_functiondef(v_signature::regprocedure);
    if position('teacher_approval_required' in v_definition)>0 then
      raise exception 'Approval check already installed';
    end if;
    v_definition := regexp_replace(v_definition,E'\\mbegin\\M',E'begin\n  if not private.homework_allowed() then\n    raise exception ''teacher_approval_required'' using errcode=''42501'';\n  end if;', 'i');
    execute v_definition;
  end loop;
end $$;

-- Revocation must cover direct reads and realtime as well as RPC writes.
do $$
declare v_table text;
begin
  foreach v_table in array array['homework_workspaces','homework_classes','homework_students','homework_assignments','homework_daily_records','homework_warning_actions'] loop
    execute format('alter policy "Owner can read" on public.%I using (owner_id=(select auth.uid()) and (select private.homework_allowed()))',v_table);
  end loop;
end $$;
alter policy "Teacher can read legacy backup" on public.homework_sync_state
  using(owner_id=(select auth.uid()) and (select private.homework_allowed()));

-- New samples use <teacher UUID>/<assignment ID>. Existing bare-ID objects remain private to their original uploader.
alter policy "Teacher owns assignment samples" on storage.objects
  using (
    bucket_id='homework-samples' and (select private.homework_allowed()) and
    exists(select 1 from public.homework_assignments a where a.owner_id=(select auth.uid()) and
      ((objects.name=(select auth.uid())::text || '/' || a.id) or (objects.name=a.id and objects.owner_id=(select auth.uid())::text)))
  ) with check (
    bucket_id='homework-samples' and (select private.homework_allowed()) and
    exists(select 1 from public.homework_assignments a where a.owner_id=(select auth.uid()) and
      ((objects.name=(select auth.uid())::text || '/' || a.id) or (objects.name=a.id and objects.owner_id=(select auth.uid())::text)))
  );

commit;
