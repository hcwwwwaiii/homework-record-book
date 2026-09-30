-- Run once in the Supabase SQL Editor. Keeps the old snapshot and a private backup.
-- The project must contain exactly one existing teacher account and one legacy snapshot.
begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table if not exists private.homework_snapshot_backup_20260930
  as select * from public.homework_sync_state;
revoke all on private.homework_snapshot_backup_20260930 from public, anon, authenticated;

create table if not exists public.homework_workspaces (
  owner_id uuid primary key references auth.users(id),
  revision bigint not null default 0,
  source_updated_at timestamptz,
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object')
);

create table if not exists public.homework_classes (
  owner_id uuid not null references public.homework_workspaces(owner_id) on delete cascade,
  id text not null check (id <> '' and length(id) <= 100),
  name text not null check (name <> ''),
  subject text not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and payload->>'id' = id),
  primary key (owner_id, id)
);

create table if not exists public.homework_students (
  owner_id uuid not null,
  id text not null check (id <> '' and length(id) <= 100),
  class_id text not null,
  name text not null check (name <> ''),
  sort_order integer,
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and payload->>'id' = id and payload->>'classId' = class_id),
  primary key (owner_id, id),
  unique (owner_id, class_id, id),
  foreign key (owner_id, class_id) references public.homework_classes(owner_id, id)
);

create table if not exists public.homework_assignments (
  owner_id uuid not null,
  id text not null check (id <> '' and length(id) <= 100),
  class_id text not null,
  title text not null check (title <> ''),
  due date not null,
  archived_at timestamptz,
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and payload->>'id' = id and payload->>'classId' = class_id),
  primary key (owner_id, id),
  unique (owner_id, class_id, id),
  foreign key (owner_id, class_id) references public.homework_classes(owner_id, id)
);

create table if not exists public.homework_daily_records (
  owner_id uuid not null,
  id text not null check (id <> '' and length(id) <= 100),
  class_id text not null,
  assignment_id text not null,
  student_id text not null,
  record_date date not null,
  status text not null check (status in ('missing', 'submitted', 'absent')),
  payload jsonb not null check (
    jsonb_typeof(payload) = 'object' and payload->>'id' = id
    and payload->>'classId' = class_id and payload->>'assignmentId' = assignment_id
    and payload->>'studentId' = student_id and payload->>'date' = record_date::text
    and payload->>'status' = status
  ),
  primary key (owner_id, id),
  unique (owner_id, assignment_id, student_id, record_date),
  foreign key (owner_id, class_id, assignment_id) references public.homework_assignments(owner_id, class_id, id) on delete cascade,
  foreign key (owner_id, class_id, student_id) references public.homework_students(owner_id, class_id, id) on delete cascade
);

create table if not exists public.homework_warning_actions (
  owner_id uuid not null,
  id text not null check (id <> '' and length(id) <= 100),
  student_id text not null,
  warning_number integer not null check (warning_number > 0),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and payload->>'id' = id and payload->>'studentId' = student_id),
  primary key (owner_id, id),
  unique (owner_id, student_id, warning_number),
  foreign key (owner_id, student_id) references public.homework_students(owner_id, id) on delete cascade
);

create index if not exists homework_assignments_due_idx on public.homework_assignments(owner_id, class_id, due);
create index if not exists homework_daily_student_date_idx on public.homework_daily_records(owner_id, student_id, record_date);
create index if not exists homework_daily_assignment_date_idx on public.homework_daily_records(owner_id, assignment_id, record_date);

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'homework_workspaces', 'homework_classes', 'homework_students',
    'homework_assignments', 'homework_daily_records', 'homework_warning_actions'
  ] loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format('revoke all on public.%I from public, anon, authenticated', v_table);
    execute format('grant select on public.%I to authenticated', v_table);
    execute format('drop policy if exists "Owner can read" on public.%I', v_table);
    execute format(
      'create policy "Owner can read" on public.%I for select to authenticated using (owner_id = (select auth.uid()) and (select auth.jwt()->>''is_anonymous'') is distinct from ''true'')',
      v_table
    );
  end loop;
end $$;

create or replace function public.homework_load()
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_workspace public.homework_workspaces%rowtype;
begin
  if v_owner is null or (auth.jwt()->>'is_anonymous') = 'true' then
    raise exception 'teacher_login_required' using errcode = '42501';
  end if;
  select * into v_workspace from public.homework_workspaces where owner_id = v_owner;
  if not found then raise exception 'teacher_access_denied' using errcode = '42501'; end if;
  return jsonb_build_object(
    'revision', v_workspace.revision,
    'updatedAt', v_workspace.updated_at,
    'state', jsonb_build_object(
      'classes', (select coalesce(jsonb_agg(payload order by case id when 'math-a' then 1 when 'math-b' then 2 when 'physics' then 3 else 4 end, id), '[]'::jsonb) from public.homework_classes where owner_id = v_owner),
      'students', (select coalesce(jsonb_agg(payload order by class_id, sort_order nulls last, id), '[]'::jsonb) from public.homework_students where owner_id = v_owner),
      'assignments', (select coalesce(jsonb_agg(payload order by due, id), '[]'::jsonb) from public.homework_assignments where owner_id = v_owner),
      'dailyRecords', (select coalesce(jsonb_agg(payload order by record_date, id), '[]'::jsonb) from public.homework_daily_records where owner_id = v_owner),
      'warningsHandled', (select coalesce(jsonb_agg(payload order by id), '[]'::jsonb) from public.homework_warning_actions where owner_id = v_owner),
      'misses', coalesce(v_workspace.metadata->'misses', '[]'::jsonb),
      'absences', coalesce(v_workspace.metadata->'absences', '[]'::jsonb),
      'excellentByMonth', coalesce(v_workspace.metadata->'excellentByMonth', '[]'::jsonb),
      'dailyRecordVersion', coalesce(v_workspace.metadata->'dailyRecordVersion', '1'::jsonb),
      'rosterSeedVersion', coalesce(v_workspace.metadata->'rosterSeedVersion', '1'::jsonb)
    )
  );
end;
$$;

create or replace function public.homework_apply_patch(p_expected_revision bigint, p_patch jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_revision bigint;
  v_updated timestamptz := clock_timestamp();
begin
  if v_owner is null or (auth.jwt()->>'is_anonymous') = 'true' then
    raise exception 'teacher_login_required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_patch) <> 'object' then
    raise exception 'invalid_patch' using errcode = '22023';
  end if;
  select revision into v_revision from public.homework_workspaces
    where owner_id = v_owner for update;
  if not found then raise exception 'teacher_access_denied' using errcode = '42501'; end if;
  if v_revision <> p_expected_revision then
    raise exception 'revision_conflict' using errcode = 'P0001';
  end if;

  delete from public.homework_daily_records where owner_id = v_owner
    and id in (select jsonb_array_elements_text(coalesce(p_patch->'dailyRecords'->'deletes', '[]'::jsonb)));
  delete from public.homework_warning_actions where owner_id = v_owner
    and id in (select jsonb_array_elements_text(coalesce(p_patch->'warningsHandled'->'deletes', '[]'::jsonb)));
  delete from public.homework_assignments where owner_id = v_owner
    and id in (select jsonb_array_elements_text(coalesce(p_patch->'assignments'->'deletes', '[]'::jsonb)));
  delete from public.homework_students where owner_id = v_owner
    and id in (select jsonb_array_elements_text(coalesce(p_patch->'students'->'deletes', '[]'::jsonb)));
  delete from public.homework_classes where owner_id = v_owner
    and id in (select jsonb_array_elements_text(coalesce(p_patch->'classes'->'deletes', '[]'::jsonb)));

  insert into public.homework_classes(owner_id, id, name, subject, payload)
    select v_owner, x->>'id', x->>'name', coalesce(x->>'subject', ''), x
    from jsonb_array_elements(coalesce(p_patch->'classes'->'upserts', '[]'::jsonb)) x
    on conflict (owner_id, id) do update set name = excluded.name, subject = excluded.subject, payload = excluded.payload;
  insert into public.homework_students(owner_id, id, class_id, name, sort_order, payload)
    select v_owner, x->>'id', x->>'classId', x->>'name', (x->>'order')::integer, x
    from jsonb_array_elements(coalesce(p_patch->'students'->'upserts', '[]'::jsonb)) x
    on conflict (owner_id, id) do update set class_id = excluded.class_id, name = excluded.name, sort_order = excluded.sort_order, payload = excluded.payload;
  insert into public.homework_assignments(owner_id, id, class_id, title, due, archived_at, payload)
    select v_owner, x->>'id', x->>'classId', x->>'title', (x->>'due')::date, (x->>'archivedAt')::timestamptz, x
    from jsonb_array_elements(coalesce(p_patch->'assignments'->'upserts', '[]'::jsonb)) x
    on conflict (owner_id, id) do update set class_id = excluded.class_id, title = excluded.title, due = excluded.due, archived_at = excluded.archived_at, payload = excluded.payload;
  insert into public.homework_daily_records(owner_id, id, class_id, assignment_id, student_id, record_date, status, payload)
    select v_owner, x->>'id', x->>'classId', x->>'assignmentId', x->>'studentId', (x->>'date')::date, x->>'status', x
    from jsonb_array_elements(coalesce(p_patch->'dailyRecords'->'upserts', '[]'::jsonb)) x
    on conflict (owner_id, id) do update set class_id = excluded.class_id, assignment_id = excluded.assignment_id,
      student_id = excluded.student_id, record_date = excluded.record_date, status = excluded.status, payload = excluded.payload;
  insert into public.homework_warning_actions(owner_id, id, student_id, warning_number, payload)
    select v_owner, x->>'id', x->>'studentId', (x->>'warningNumber')::integer, x
    from jsonb_array_elements(coalesce(p_patch->'warningsHandled'->'upserts', '[]'::jsonb)) x
    on conflict (owner_id, id) do update set student_id = excluded.student_id,
      warning_number = excluded.warning_number, payload = excluded.payload;

  update public.homework_workspaces
    set metadata = coalesce(p_patch->'metadata', metadata),
        revision = revision + 1,
        updated_at = v_updated
    where owner_id = v_owner;
  return jsonb_build_object('revision', v_revision + 1, 'updatedAt', v_updated);
end;
$$;

revoke all on function public.homework_load() from public, anon;
revoke all on function public.homework_apply_patch(bigint, jsonb) from public, anon;
grant execute on function public.homework_load() to authenticated;
grant execute on function public.homework_apply_patch(bigint, jsonb) to authenticated;

do $$
declare
  v_owner uuid;
  v_data jsonb;
  v_source_updated timestamptz;
  v_count integer;
begin
  select count(*) into v_count from auth.users;
  if v_count <> 1 then raise exception 'Expected one teacher account; found %', v_count; end if;
  select id into v_owner from auth.users limit 1;
  if exists (select 1 from public.homework_workspaces) then
    raise exception 'New workspace already exists; migration will not overwrite it';
  end if;
  select data, updated_at into v_data, v_source_updated
    from public.homework_sync_state where id = 'main';
  if v_data is null then raise exception 'Legacy snapshot missing'; end if;
  if jsonb_typeof(v_data->'classes') <> 'array'
    or jsonb_typeof(v_data->'students') <> 'array'
    or jsonb_typeof(v_data->'assignments') <> 'array'
    or jsonb_typeof(v_data->'dailyRecords') <> 'array' then
    raise exception 'Legacy snapshot has an unexpected shape';
  end if;

  insert into public.homework_workspaces(owner_id, source_updated_at, updated_at, metadata)
    values (v_owner, v_source_updated, v_source_updated, jsonb_build_object(
      'dailyRecordVersion', coalesce(v_data->'dailyRecordVersion', '1'::jsonb),
      'rosterSeedVersion', coalesce(v_data->'rosterSeedVersion', '1'::jsonb),
      'misses', coalesce(v_data->'misses', '[]'::jsonb),
      'absences', coalesce(v_data->'absences', '[]'::jsonb),
      'excellentByMonth', coalesce(v_data->'excellentByMonth', '[]'::jsonb)
    ));
  insert into public.homework_classes(owner_id, id, name, subject, payload)
    select v_owner, x->>'id', x->>'name', coalesce(x->>'subject', ''), x
    from jsonb_array_elements(v_data->'classes') x;
  insert into public.homework_students(owner_id, id, class_id, name, sort_order, payload)
    select v_owner, x->>'id', x->>'classId', x->>'name', (x->>'order')::integer, x
    from jsonb_array_elements(v_data->'students') x;
  insert into public.homework_assignments(owner_id, id, class_id, title, due, archived_at, payload)
    select v_owner, x->>'id', x->>'classId', x->>'title', (x->>'due')::date, (x->>'archivedAt')::timestamptz, x
    from jsonb_array_elements(v_data->'assignments') x;
  insert into public.homework_daily_records(owner_id, id, class_id, assignment_id, student_id, record_date, status, payload)
    select v_owner, x->>'id', x->>'classId', x->>'assignmentId', x->>'studentId', (x->>'date')::date, x->>'status', x
    from jsonb_array_elements(v_data->'dailyRecords') x;
  insert into public.homework_warning_actions(owner_id, id, student_id, warning_number, payload)
    select v_owner, x->>'id', x->>'studentId', (x->>'warningNumber')::integer, x
    from jsonb_array_elements(coalesce(v_data->'warningsHandled', '[]'::jsonb)) x;

  if (select count(*) from public.homework_classes where owner_id = v_owner) <> jsonb_array_length(v_data->'classes')
    or (select count(*) from public.homework_students where owner_id = v_owner) <> jsonb_array_length(v_data->'students')
    or (select count(*) from public.homework_assignments where owner_id = v_owner) <> jsonb_array_length(v_data->'assignments')
    or (select count(*) from public.homework_daily_records where owner_id = v_owner) <> jsonb_array_length(v_data->'dailyRecords')
    or (select count(*) from public.homework_warning_actions where owner_id = v_owner) <> jsonb_array_length(coalesce(v_data->'warningsHandled', '[]'::jsonb)) then
    raise exception 'Migrated row counts do not match the legacy snapshot';
  end if;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.homework_workspaces;
exception when duplicate_object then null;
end $$;

commit;
