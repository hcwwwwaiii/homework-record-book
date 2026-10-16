-- Keep the existing API names while placing privileged implementations outside the exposed schema.
begin;
do $$
declare v_signature text; v_definition text;
begin
  foreach v_signature in array array['public.homework_load()','public.homework_apply_patch(bigint,jsonb)'] loop
    v_definition := pg_get_functiondef(v_signature::regprocedure);
    if position('teacher_approval_required' in v_definition)=0 then raise exception 'Install approval checks first'; end if;
    execute replace(v_definition,'FUNCTION public.homework_','FUNCTION private.homework_');
  end loop;
end $$;
revoke all on function private.homework_load(),private.homework_apply_patch(bigint,jsonb) from public, anon, authenticated;
grant execute on function private.homework_load(),private.homework_apply_patch(bigint,jsonb) to authenticated;

create or replace function public.homework_load()
returns jsonb language sql security invoker set search_path = '' as $$
  select private.homework_load();
$$;
create or replace function public.homework_apply_patch(p_expected_revision bigint,p_patch jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.homework_apply_patch(p_expected_revision,p_patch);
$$;
revoke all on function public.homework_load(),public.homework_apply_patch(bigint,jsonb) from public,anon;
grant execute on function public.homework_load(),public.homework_apply_patch(bigint,jsonb) to authenticated;
commit;
