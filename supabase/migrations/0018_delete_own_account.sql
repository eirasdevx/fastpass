-- Cada persona puede borrar su propia cuenta desde «Mi cuenta». Aplicar después de 0017.
-- Se puede ejecutar más de una vez.
--
-- Las reglas son las mismas que al borrar a alguien del equipo (0016): si es la única persona
-- administradora de su grupo, sus eventos se borran con ella; un grupo que se queda vacío
-- desaparece. El último superadministrador no puede borrarse: la plataforma se quedaría sin dueño.
begin;

-- Limpieza común a los dos borrados. Devuelve cuántos eventos se han borrado.
create or replace function private.purge_account(p_user uuid) returns integer
language plpgsql security definer set search_path='' as $$
declare v_org uuid; owned uuid[];
begin
  select organization_id into v_org from public.organization_members where user_id=p_user;
  select coalesce(array_agg(id),'{}') into owned from private.owned_events(p_user) id;
  -- Entradas primero: su tipo es ON DELETE RESTRICT y no debe depender del orden de la cascada.
  delete from public.tickets where event_id = any(owned);
  delete from public.events where id = any(owned);
  delete from auth.users where id=p_user;
  -- Un grupo que se queda sin nadie desaparece con sus plantillas e invitaciones.
  if v_org is not null and not exists(select 1 from public.organization_members where organization_id=v_org) then
    delete from public.invitations where organization_id=v_org;
    if not exists(select 1 from public.events where organization_id=v_org) then
      delete from public.ticket_templates where organization_id=v_org;
      delete from public.organizations where id=v_org;
    end if;
  end if;
  return cardinality(owned);
end;
$$;

create or replace function public.delete_account(p_user uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_org uuid; n integer;
begin
  if p_user is null or p_user=auth.uid() then raise exception 'CANNOT_DELETE_SELF'; end if;
  select organization_id into v_org from public.organization_members where user_id=p_user;
  if v_org is null or not public.can_manage_org(v_org) then raise exception 'FORBIDDEN'; end if;
  if exists(select 1 from public.admins where user_id=p_user) then raise exception 'FORBIDDEN'; end if;
  n := private.purge_account(p_user);
  perform private.audit('account','deleted');
  return jsonb_build_object('deleted_events',n);
end;
$$;

-- Lo que se borraría: para avisar antes de confirmar.
create or replace function public.own_account_summary() returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'owned_events',coalesce((select jsonb_agg(e.title order by e.starts_at) from public.events e where e.id in (select private.owned_events(auth.uid()))),'[]'::jsonb),
    'last_superadmin',exists(select 1 from public.admins where user_id=auth.uid())
      and not exists(select 1 from public.admins where user_id<>auth.uid()))
  where auth.uid() is not null;
$$;

create or replace function public.delete_own_account() returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid := auth.uid(); n integer;
begin
  -- Igual que el resto del panel: solo con la verificación en dos pasos completada.
  if me is null or coalesce(auth.jwt()->>'aal','')<>'aal2' then raise exception 'FORBIDDEN'; end if;
  if exists(select 1 from public.admins where user_id=me) and not exists(select 1 from public.admins where user_id<>me) then
    raise exception 'LAST_SUPERADMIN';
  end if;
  n := private.purge_account(me);
  perform private.audit('account','deleted_self');
  return jsonb_build_object('deleted_events',n);
end;
$$;

revoke all on function private.purge_account(uuid) from public,anon,authenticated;
revoke all on function public.own_account_summary(), public.delete_own_account() from public,anon,authenticated;
grant execute on function public.own_account_summary(), public.delete_own_account() to authenticated;
commit;
