-- Panel: resumen que cuenta las reservas, historial unificado (accesos + entregas),
-- invitaciones al equipo y borrado de cuentas. Aplicar después de 0015.
-- Se puede ejecutar más de una vez.
begin;

-- --- Resumen ---------------------------------------------------------------------------------
-- Antes solo contaba entradas e inscripciones: en un evento con reservas (modalidad pickup)
-- las cifras no cambiaban nunca. Ahora añade el bloque 'reservations'.

create or replace function public.event_dashboard(p_event uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'issued',(select count(*) from public.tickets where event_id=e.id),
    'used',(select count(*) from public.tickets where event_id=e.id and status='used'),
    'valid',(select count(*) from public.tickets where event_id=e.id and status='valid'),
    'cancelled',(select count(*) from public.tickets where event_id=e.id and status='cancelled'),
    'pending',(select count(*) from public.registrations where event_id=e.id and status='pending'),
    'capacity',e.capacity,
    'mode',e.registration_mode,
    'item_name',e.pickup_item_name,
    'reservations',case when e.registration_mode='pickup' or exists(select 1 from public.reservations where event_id=e.id)
      then public.reservation_stats(e.id) end)
  from public.events e
  where e.id=p_event and public.can_manage_event(p_event);
$$;

create or replace function public.global_dashboard() returns jsonb
language sql stable security definer set search_path='' as $$
  select case when public.is_admin() then jsonb_build_object(
    'issued',(select count(*) from public.tickets),
    'used',(select count(*) from public.tickets where status='used'),
    'valid',(select count(*) from public.tickets where status='valid'),
    'cancelled',(select count(*) from public.tickets where status='cancelled'),
    'pending',(select count(*) from public.registrations where status='pending'),
    'capacity',(select case when count(*)=count(capacity) then sum(capacity) end from public.events),
    'mode','all',
    'reservations',(select case when count(r.id)>0 then jsonb_build_object(
        'reserved_pending',coalesce(sum(r.quantity-r.delivered_quantity) filter(where s.status in ('pending_pickup','partially_picked_up')),0),
        'delivered',coalesce(sum(r.delivered_quantity),0),
        'amount_collected',coalesce(sum(r.amount_paid),0),
        'reservations_active',count(r.id) filter(where s.status in ('pending_pickup','partially_picked_up')),
        'reservations_completed',count(r.id) filter(where s.status='completed'),
        'reservations_cancelled',count(r.id) filter(where s.status='cancelled'),
        'reservations_expired',count(r.id) filter(where s.status='expired')) end
      from public.reservations r join public.events ev on ev.id=r.event_id
      cross join lateral (select private.reservation_status(r.status,ev.pickup_deadline) as status) s)) end;
$$;

-- --- Historial ---------------------------------------------------------------------------------
-- Une los accesos con entrada y las entregas de reservas, con el nombre de quien lo hizo.
-- Las consultas previas a confirmar ('ready') no son operaciones y no se muestran.

create or replace function public.event_history(p_event uuid, p_page integer default 1, p_size integer default 50) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if not public.can_manage_event(p_event) then raise exception 'FORBIDDEN'; end if;
  if p_page is null or p_page<1 or p_page>100000 or p_size is null or p_size not between 1 and 200 then raise exception 'INVALID_INPUT'; end if;
  with rows as (
    select 'access'::text as kind,l.id,l.created_at,t.attendee_name as name,l.attempted_code as code,l.result,
      null::integer as quantity,null::numeric as amount,null::text as payment_method,l.admin_id
    from public.access_logs l left join public.tickets t on t.id=l.ticket_id
    where l.event_id=p_event and l.result<>'ready'
    union all
    select 'pickup',p.id,p.created_at,trim(r.first_name||' '||r.last_name),r.code,'pickup',p.quantity,p.amount,p.payment_method,p.admin_id
    from public.reservation_pickups p join public.reservations r on r.id=p.reservation_id
    where p.event_id=p_event
  ), page as (
    select * from rows order by created_at desc,kind,id desc limit p_size offset (p_page-1)*p_size
  )
  select jsonb_build_object('total',(select count(*) from rows),'rows',coalesce((select jsonb_agg(jsonb_build_object(
      'kind',pg.kind,'id',pg.id,'created_at',pg.created_at,'name',pg.name,'code',pg.code,'result',pg.result,
      'quantity',pg.quantity,'amount',pg.amount,'payment_method',pg.payment_method,
      'staff',coalesce(nullif(trim(coalesce(u.raw_user_meta_data->>'first_name','')||' '||coalesce(u.raw_user_meta_data->>'last_name','')),''),u.email))
      order by pg.created_at desc,pg.kind,pg.id desc)
    from page pg left join auth.users u on u.id=pg.admin_id),'[]'::jsonb)) into result;
  return result;
end;
$$;

-- --- Invitaciones --------------------------------------------------------------------------------
-- Un administrador genera un enlace personal (caduca a los 7 días) y lo envía como quiera.
-- Solo se guarda la huella del token. Al crear la cuenta con ese correo (o al aceptarla
-- con una cuenta existente sin grupo) la persona entra en el grupo con el rol indicado.

create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null check (length(email)<=254 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role text not null check (role in ('organizer','controller')),
  event_id uuid references public.events(id) on delete cascade,
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '7 days',
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  check (role='controller' or event_id is null)
);
create index if not exists invitations_org on public.invitations(organization_id,created_at desc);
alter table public.invitations enable row level security;
drop policy if exists invitation_read on public.invitations;
create policy invitation_read on public.invitations for select using (public.can_manage_org(organization_id));
revoke all on public.invitations from anon,authenticated;
grant select on public.invitations to authenticated;

create or replace function public.create_invitation(p_email text,p_role text,p_org uuid default null,p_event uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_org uuid := coalesce(p_org,public.current_organization_id()); v_email text := lower(trim(coalesce(p_email,''))); token text; v_expires timestamptz;
begin
  if v_org is null or not public.can_manage_org(v_org) then raise exception 'FORBIDDEN'; end if;
  if length(v_email)>254 or v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' or p_role is null or p_role not in ('organizer','controller')
    or (p_role='organizer' and p_event is not null) then raise exception 'INVALID_INPUT'; end if;
  if p_event is not null and not exists(select 1 from public.events where id=p_event and organization_id=v_org) then raise exception 'INVALID_INPUT'; end if;
  if exists(select 1 from public.organization_members m join auth.users u on u.id=m.user_id where lower(u.email)=v_email) then raise exception 'ALREADY_MEMBER'; end if;
  -- Una invitación vigente por persona y grupo: la nueva sustituye a la anterior.
  delete from public.invitations where organization_id=v_org and email=v_email and accepted_at is null;
  token := replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
  insert into public.invitations(token_hash,organization_id,email,role,event_id,invited_by)
    values(encode(sha256(convert_to(token,'UTF8')),'hex'),v_org,v_email,p_role,p_event,auth.uid()) returning expires_at into v_expires;
  perform private.audit('invitation','created',p_event);
  return jsonb_build_object('token',token,'expires_at',v_expires);
end;
$$;

create or replace function public.revoke_invitation(p_invitation uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v_org uuid;
begin
  select organization_id into v_org from public.invitations where id=p_invitation and accepted_at is null;
  if v_org is null or not public.can_manage_org(v_org) then raise exception 'FORBIDDEN'; end if;
  delete from public.invitations where id=p_invitation;
  perform private.audit('invitation','revoked');
end;
$$;

-- Lo que ve quien abre el enlace: el grupo, el rol y su correo. Nada si el token no existe.
create or replace function public.get_invitation(p_token text) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('email',i.email,'role',i.role,'organization',o.name,'event_title',e.title,
    'status',case when i.accepted_at is not null then 'accepted' when i.expires_at<=now() then 'expired' else 'valid' end)
  from public.invitations i join public.organizations o on o.id=i.organization_id
  left join public.events e on e.id=i.event_id
  where p_token ~ '^[a-f0-9]{64}$' and i.token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
$$;

create or replace function private.accept_invitation(p_user uuid,p_email text,p_token text) returns boolean
language plpgsql security definer set search_path='' as $$
declare i public.invitations%rowtype;
begin
  if coalesce(p_token,'') !~ '^[a-f0-9]{64}$' then return false; end if;
  select * into i from public.invitations where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') for update;
  if not found or i.accepted_at is not null or i.expires_at<=now() or i.email<>lower(trim(coalesce(p_email,''))) then return false; end if;
  -- Una cuenta pertenece a un único grupo y los superadministradores no necesitan grupo.
  if exists(select 1 from public.organization_members where user_id=p_user)
    or exists(select 1 from public.admins where user_id=p_user) then return false; end if;
  insert into public.organization_members values(p_user,i.organization_id,i.role);
  if i.event_id is not null then insert into public.event_staff values(i.event_id,p_user) on conflict do nothing; end if;
  update public.invitations set accepted_at=now(),accepted_by=p_user where id=i.id;
  perform private.audit('invitation','accepted',i.event_id);
  return true;
end;
$$;

-- Para cuentas que ya existían: se acepta tras iniciar sesión con el mismo correo.
create or replace function public.accept_invitation(p_token text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not private.accept_invitation(auth.uid(),(select email from auth.users where id=auth.uid()),p_token) then
    raise exception 'INVITATION_INVALID';
  end if;
end;
$$;

-- Altas: con invitación entra en ese grupo; sin ella sigue creando su propio grupo (0005).
create or replace function private.handle_organizer_signup() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  org_name text := btrim(coalesce(new.raw_user_meta_data->>'organization_name', ''));
  invitation text := coalesce(new.raw_user_meta_data->>'invitation', '');
  org uuid;
begin
  if new.email_confirmed_at is null then return new; end if;
  if TG_OP = 'UPDATE' and old.email_confirmed_at is not null then return new; end if;
  -- Los metadatos los escribe el usuario: nunca se lanza una excepción que bloquee la confirmación.
  if invitation <> '' then
    begin
      perform private.accept_invitation(new.id, new.email, invitation);
    exception when others then null;
    end;
    return new;
  end if;
  if char_length(org_name) not between 1 and 120 then return new; end if;
  if exists(select 1 from public.organization_members where user_id = new.id)
    or exists(select 1 from public.admins where user_id = new.id) then return new; end if;
  insert into public.organizations(name) values (org_name) returning id into org;
  insert into public.organization_members values (new.id, org, 'organizer');
  return new;
end;
$$;

-- --- Equipo y borrado de cuentas -------------------------------------------------------------------

-- Quién es el dueño de los eventos: el último administrador que queda en el grupo.
-- Si se borra su cuenta, sus eventos se borran con ella.
create or replace function private.owned_events(p_user uuid) returns setof uuid
language sql stable security definer set search_path='' as $$
  select e.id from public.events e join public.organization_members m on m.organization_id=e.organization_id
  where m.user_id=p_user and m.role='organizer'
    and not exists(select 1 from public.organization_members o where o.organization_id=m.organization_id and o.role='organizer' and o.user_id<>p_user);
$$;

create or replace function public.list_team() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'user_id',m.user_id,'email',u.email,
      'name',nullif(trim(coalesce(u.raw_user_meta_data->>'first_name','')||' '||coalesce(u.raw_user_meta_data->>'last_name','')),''),
      'organization_id',m.organization_id,'organization',o.name,'role',m.role,'is_self',m.user_id=auth.uid(),
      'events',coalesce((select jsonb_agg(e.title order by e.starts_at) from public.event_staff s join public.events e on e.id=s.event_id where s.user_id=m.user_id),'[]'::jsonb),
      'owned_events',coalesce((select jsonb_agg(e.title order by e.starts_at) from public.events e where e.id in (select private.owned_events(m.user_id))),'[]'::jsonb))
    order by o.name,m.role desc,u.email),'[]'::jsonb)
  from public.organization_members m
  join public.organizations o on o.id=m.organization_id
  join auth.users u on u.id=m.user_id
  where public.can_manage_org(m.organization_id);
$$;

create or replace function public.delete_account(p_user uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m public.organization_members%rowtype; owned uuid[]; n integer;
begin
  if p_user is null or p_user=auth.uid() then raise exception 'CANNOT_DELETE_SELF'; end if;
  select * into m from public.organization_members where user_id=p_user;
  if not found or not public.can_manage_org(m.organization_id) then raise exception 'FORBIDDEN'; end if;
  if exists(select 1 from public.admins where user_id=p_user) then raise exception 'FORBIDDEN'; end if;
  select coalesce(array_agg(id),'{}') into owned from private.owned_events(p_user) id;
  n := cardinality(owned);
  -- Entradas primero: su tipo es ON DELETE RESTRICT y no debe depender del orden de la cascada.
  delete from public.tickets where event_id = any(owned);
  delete from public.events where id = any(owned);
  delete from auth.users where id=p_user;
  -- Un grupo que se queda sin nadie desaparece con sus plantillas e invitaciones.
  if not exists(select 1 from public.organization_members where organization_id=m.organization_id) then
    delete from public.invitations where organization_id=m.organization_id;
    if not exists(select 1 from public.events where organization_id=m.organization_id) then
      delete from public.ticket_templates where organization_id=m.organization_id;
      delete from public.organizations where id=m.organization_id;
    end if;
  end if;
  perform private.audit('account','deleted');
  return jsonb_build_object('deleted_events',n);
end;
$$;

-- --- Permisos -----------------------------------------------------------------------------------------
revoke all on function private.accept_invitation(uuid,text,text), private.owned_events(uuid) from public,anon,authenticated;
revoke all on function public.event_history(uuid,integer,integer), public.create_invitation(text,text,uuid,uuid),
  public.revoke_invitation(uuid), public.get_invitation(text), public.accept_invitation(text),
  public.list_team(), public.delete_account(uuid) from public,anon,authenticated;
grant execute on function public.get_invitation(text) to anon,authenticated;
grant execute on function public.event_history(uuid,integer,integer), public.create_invitation(text,text,uuid,uuid),
  public.revoke_invitation(uuid), public.accept_invitation(text), public.list_team(), public.delete_account(uuid) to authenticated;
commit;
