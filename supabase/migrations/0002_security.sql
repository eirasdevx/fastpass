-- Security upgrade. Apply after 0001 to a fresh/staging database first.
-- Existing rows with NULL organization_id are quarantined (global admin only).
-- No legacy ownership is guessed and no data is deleted.
begin;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120)
);
create table public.organization_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id),
  role text not null check (role in ('organizer', 'controller'))
);
create table public.event_staff (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.organization_members(user_id) on delete cascade,
  primary key(event_id, user_id)
);
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.event_staff enable row level security;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select auth.jwt()->>'aal') = 'aal2', false)
    and exists(select 1 from public.admins where user_id = (select auth.uid()));
$$;
create function public.current_organization_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select organization_id from public.organization_members where user_id = (select auth.uid());
$$;
create function public.can_manage_org(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin() or (
    coalesce((select auth.jwt()->>'aal') = 'aal2', false) and exists (
      select 1 from public.organization_members
      where user_id = (select auth.uid()) and organization_id = p_org and role = 'organizer'
    ));
$$;
create function public.staff_role() returns text
language sql stable security definer set search_path = '' as $$
  select case when public.is_admin() then 'admin'
    when (select auth.jwt()->>'aal') = 'aal2' then
      (select role from public.organization_members where user_id = (select auth.uid())) end;
$$;

alter table public.events add column organization_id uuid references public.organizations(id)
  default public.current_organization_id();
alter table public.ticket_templates add column organization_id uuid references public.organizations(id)
  default public.current_organization_id();
alter table public.events add column capacity integer check (capacity is null or capacity > 0);
create index events_org_idx on public.events(organization_id);
create index templates_org_idx on public.ticket_templates(organization_id);
create index members_org_idx on public.organization_members(organization_id);
-- Enforce limits at the REST/SQL boundary as well as Server Actions.
alter table public.events add constraint events_content_limits check (
  char_length(description) <= 5000 and char_length(venue) <= 200
  and (cover_url is null or (char_length(cover_url) <= 2048 and cover_url ~ '^https?://'))
) not valid;
alter table public.ticket_types add constraint type_content_limits check (
  char_length(description) <= 500 and price <= 100000
) not valid;
alter table public.ticket_templates add constraint template_content_limits check (
  char_length(description_template) <= 1000 and jsonb_typeof(design) = 'object'
  and octet_length(design::text) <= 16384
) not valid;
create function public.can_manage_event(p_event uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.events where id = p_event and public.can_manage_org(organization_id));
$$;
create function public.can_scan_event(p_event uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.can_manage_event(p_event) or (
    coalesce((select auth.jwt()->>'aal') = 'aal2', false) and exists (
      select 1 from public.event_staff s
      join public.organization_members m on m.user_id = s.user_id
      join public.events e on e.id = s.event_id and e.organization_id = m.organization_id
      where s.event_id = p_event and s.user_id = (select auth.uid()) and m.role = 'controller'
    ));
$$;

-- Membership and assignments are provisioned by a trusted DB operator only.
create policy "organization self" on public.organizations for select
  using (id = public.current_organization_id() or public.is_admin());
create policy "membership self" on public.organization_members for select
  using (user_id = (select auth.uid()) or public.is_admin());
create policy "assignment self" on public.event_staff for select
  using (user_id = (select auth.uid()) or public.can_manage_event(event_id));

drop policy "plantillas: admin" on public.ticket_templates;
create policy "template tenant" on public.ticket_templates for all
  using (public.can_manage_org(organization_id))
  with check (organization_id is not null and public.can_manage_org(organization_id));
drop policy "eventos: lectura pública" on public.events;
drop policy "eventos: admin inserta" on public.events;
drop policy "eventos: admin actualiza" on public.events;
drop policy "eventos: admin borra" on public.events;
create policy "event public or staff" on public.events for select
  using (published or public.can_scan_event(id));
create policy "event insert tenant" on public.events for insert
  with check (organization_id is not null and public.can_manage_org(organization_id));
create policy "event update tenant" on public.events for update
  using (public.can_manage_org(organization_id))
  with check (organization_id is not null and public.can_manage_org(organization_id));
create policy "event delete tenant" on public.events for delete
  using (public.can_manage_org(organization_id));
drop policy "tipos: lectura pública" on public.ticket_types;
drop policy "tipos: admin inserta" on public.ticket_types;
drop policy "tipos: admin actualiza" on public.ticket_types;
drop policy "tipos: admin borra" on public.ticket_types;
create policy "type read" on public.ticket_types for select using (
  public.can_scan_event(event_id) or exists(select 1 from public.events e where e.id = event_id and e.published)
);
create policy "type insert" on public.ticket_types for insert with check (public.can_manage_event(event_id));
create policy "type update" on public.ticket_types for update
  using(public.can_manage_event(event_id)) with check(public.can_manage_event(event_id));
create policy "type delete" on public.ticket_types for delete using(public.can_manage_event(event_id));
drop policy "pedidos: admin" on public.orders;
drop policy "entradas: admin" on public.tickets;
create policy "order tenant read" on public.orders for select using(public.can_manage_event(event_id));
create policy "ticket tenant read" on public.tickets for select using(public.can_manage_event(event_id));
create policy "ticket tenant update" on public.tickets for update
  using(public.can_manage_event(event_id)) with check(public.can_manage_event(event_id));
-- Orders/tickets are issued through RPC only; no direct insert/delete policy.

-- Privacy-safe audit trail. No names, emails, QR codes, bearer tokens or request payloads.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table private.security_audit (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_id uuid,
  action text not null,
  outcome text not null,
  event_id uuid
);
create function private.audit(p_action text, p_outcome text, p_event uuid default null) returns void
language sql security definer set search_path = '' as $$
  insert into private.security_audit(actor_id, action, outcome, event_id)
  values(auth.uid(), p_action, p_outcome, p_event);
$$;
create table private.scan_limits (
  user_id uuid primary key,
  window_start timestamptz not null,
  attempts integer not null
);
create function private.allow_scan() returns boolean
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  insert into private.scan_limits values(auth.uid(), date_trunc('minute', clock_timestamp()), 1)
  on conflict(user_id) do update set
    attempts = case when scan_limits.window_start = excluded.window_start then scan_limits.attempts + 1 else 1 end,
    window_start = excluded.window_start
  returning attempts into n;
  return n <= 120;
end;
$$;

-- Serialise capacity changes, purchases and reactivations on the event row.
-- Count is authoritative in PostgreSQL, never in a cache.
create function private.guard_ticket() returns trigger
language plpgsql security definer set search_path = '' as $$
declare ev public.events%rowtype; tt public.ticket_types%rowtype; n bigint;
begin
  if TG_OP = 'UPDATE' and (new.id, new.event_id, new.order_id, new.ticket_type_id, new.code)
    is distinct from (old.id, old.event_id, old.order_id, old.ticket_type_id, old.code) then
    raise exception 'IMMUTABLE_TICKET';
  end if;
  select * into ev from public.events where id = new.event_id for update;
  select * into tt from public.ticket_types where id = new.ticket_type_id;
  if tt.event_id is distinct from new.event_id or not exists (
    select 1 from public.orders where id = new.order_id and event_id = new.event_id
  ) then raise exception 'INVALID_INPUT'; end if;
  if new.status <> 'cancelled' and (TG_OP = 'INSERT' or old.status = 'cancelled') then
    select count(*) into n from public.tickets where event_id = new.event_id and status <> 'cancelled' and id <> new.id;
    if ev.capacity is not null and n >= ev.capacity then raise exception 'SOLD_OUT'; end if;
    select count(*) into n from public.tickets where ticket_type_id = new.ticket_type_id and status <> 'cancelled' and id <> new.id;
    if tt.capacity is not null and n >= tt.capacity then raise exception 'SOLD_OUT'; end if;
  end if;
  if TG_OP = 'UPDATE' and new.status is distinct from old.status then
    perform private.audit('ticket_status', new.status::text, new.event_id);
  end if;
  if new.status = 'used' then
    new.used_at := coalesce(old.used_at, now()); new.validated_by := auth.uid();
  else new.used_at := null; new.validated_by := null;
  end if;
  return new;
end;
$$;
create trigger guard_ticket before insert or update on public.tickets for each row execute function private.guard_ticket();

create function private.guard_event() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.organization_id is distinct from old.organization_id then raise exception 'IMMUTABLE_ORGANIZATION'; end if;
  if new.capacity is not null and new.capacity < (select count(*) from public.tickets where event_id = new.id and status <> 'cancelled')
    then raise exception 'CAPACITY_BELOW_SOLD'; end if;
  return new;
end;
$$;
create trigger guard_event before update on public.events for each row execute function private.guard_event();
create function private.guard_type() returns trigger
language plpgsql security definer set search_path = '' as $$
declare org uuid;
begin
  if TG_OP = 'UPDATE' and new.event_id is distinct from old.event_id then raise exception 'IMMUTABLE_EVENT'; end if;
  select organization_id into org from public.events where id = new.event_id for update;
  if new.template_id is not null and not exists(
    select 1 from public.ticket_templates where id = new.template_id and organization_id = org
  ) then raise exception 'INVALID_TEMPLATE'; end if;
  if new.capacity is not null and new.capacity < (select count(*) from public.tickets where ticket_type_id = new.id and status <> 'cancelled')
    then raise exception 'CAPACITY_BELOW_SOLD'; end if;
  return new;
end;
$$;
create trigger guard_type before insert or update on public.ticket_types for each row execute function private.guard_type();
create function private.guard_template() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.organization_id is distinct from old.organization_id then raise exception 'IMMUTABLE_ORGANIZATION'; end if;
  return new;
end;
$$;
create trigger guard_template before update on public.ticket_templates for each row execute function private.guard_template();

create function private.audit_event_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.audit('event_change', TG_OP, coalesce(new.id, old.id));
  return coalesce(new, old);
end;
$$;
create trigger audit_event_change after insert or update or delete on public.events
  for each row execute function private.audit_event_change();

alter table public.tickets alter column code set default upper(replace(gen_random_uuid()::text, '-', ''));
alter table public.orders add column request_id uuid unique;
alter table public.orders add column request_payload jsonb;
-- request_payload contains only the canonical item selection, no duplicate PII.

drop function public.purchase_tickets(uuid,text,text,jsonb);
create function public.purchase_tickets(p_event_id uuid, p_buyer_name text, p_buyer_email text,
  p_items jsonb, p_request_id uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare ev public.events%rowtype; tt public.ticket_types%rowtype; item jsonb; qty integer;
  order_id uuid; token uuid; previous public.orders%rowtype; canonical jsonb;
begin
  if p_buyer_name is null or char_length(trim(p_buyer_name)) not between 2 and 120
    or p_buyer_email is null or char_length(p_buyer_email) > 254
    or p_buyer_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    or jsonb_typeof(p_items) is distinct from 'array' then raise exception 'INVALID_INPUT'; end if;
  if jsonb_array_length(p_items) not between 1 and 50 then raise exception 'INVALID_INPUT'; end if;
  for item in select * from jsonb_array_elements(p_items) loop
    if jsonb_typeof(item) is distinct from 'object'
      or jsonb_typeof(item->'quantity') is distinct from 'number'
      or (item->>'quantity') !~ '^[1-9][0-9]?$'
      or (item->>'quantity')::int > 50
      or coalesce(item->>'ticket_type_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then raise exception 'INVALID_INPUT'; end if;
  end loop;
  if (select count(distinct (x->>'ticket_type_id')::uuid) from jsonb_array_elements(p_items) x) <> jsonb_array_length(p_items)
    or (select sum((x->>'quantity')::int) from jsonb_array_elements(p_items) x) > 50
    then raise exception 'INVALID_INPUT'; end if;
  select jsonb_agg(jsonb_build_object('ticket_type_id',(x->>'ticket_type_id')::uuid,'quantity',(x->>'quantity')::int)
    order by (x->>'ticket_type_id')::uuid) into canonical from jsonb_array_elements(p_items) x;
  if p_request_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
    select * into previous from public.orders where request_id = p_request_id;
    if found then
      if previous.event_id <> p_event_id or previous.buyer_name <> trim(p_buyer_name)
        or previous.buyer_email <> lower(trim(p_buyer_email)) or previous.request_payload <> canonical
        then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
      return previous.access_token;
    end if;
  end if;
  select * into ev from public.events where id = p_event_id and published for update;
  if not found or ev.organization_id is null or coalesce(ev.ends_at, ev.starts_at) < now() then raise exception 'EVENT_UNAVAILABLE'; end if;
  insert into public.orders(event_id,buyer_name,buyer_email,request_id,request_payload)
    values(p_event_id,trim(p_buyer_name),lower(trim(p_buyer_email)),p_request_id,canonical)
    returning id, access_token into order_id, token;
  for item in select * from jsonb_array_elements(canonical) loop
    qty := (item->>'quantity')::int;
    select * into tt from public.ticket_types where id = (item->>'ticket_type_id')::uuid and event_id = p_event_id;
    if not found then raise exception 'INVALID_INPUT'; end if;
    if not tt.sales_open then raise exception 'SALES_CLOSED'; end if;
    if qty > tt.max_per_order then raise exception 'ORDER_LIMIT'; end if;
    -- 0003_sales_gate rejects paid types in the insert trigger until payments exist.
    insert into public.tickets(order_id,event_id,ticket_type_id,attendee_name)
      select order_id,p_event_id,tt.id,trim(p_buyer_name) from generate_series(1,qty);
  end loop;
  return token;
end;
$$;

create or replace function public.validate_ticket(p_code text,p_event_id uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_code text; t public.tickets%rowtype; event uuid; info jsonb;
begin
  if public.staff_role() is null then
    perform private.audit('scan','denied'); return jsonb_build_object('result','forbidden');
  end if;
  -- Return, rather than raise: failed-attempt counters/audit must commit.
  if not private.allow_scan() then
    perform private.audit('scan','rate_limited'); return jsonb_build_object('result','rate_limited');
  end if;
  if p_code is null or char_length(p_code) > 64 or p_code !~* '^[0-9a-f -]+$' then
    perform private.audit('scan','invalid'); return jsonb_build_object('result','not_found','code','');
  end if;
  v_code := upper(regexp_replace(p_code,'[ -]','','g'));
  if length(v_code) not in (16,32) then return jsonb_build_object('result','not_found','code',''); end if;
  select event_id into event from public.tickets where tickets.code = v_code;
  if event is null or not public.can_scan_event(event) then
    perform private.audit('scan','denied'); return jsonb_build_object('result','not_found','code',v_code);
  end if;
  if p_event_id is not null and event <> p_event_id then
    perform private.audit('scan','wrong_event'); return jsonb_build_object('result','wrong_event','code',v_code);
  end if;
  perform 1 from public.events where id = event for update;
  select * into t from public.tickets where tickets.code = v_code for update;
  info := jsonb_build_object('code',v_code,'attendee_name',t.attendee_name,'used_at',t.used_at,
    'event_title',(select title from public.events where id = event),
    'starts_at',(select starts_at from public.events where id = event),
    'type_name',(select name from public.ticket_types where id = t.ticket_type_id));
  if t.status = 'cancelled' then return info || jsonb_build_object('result','cancelled'); end if;
  if t.status = 'used' then return info || jsonb_build_object('result','already_used'); end if;
  update public.tickets set status = 'used', used_at = now(), validated_by = auth.uid() where id = t.id;
  perform private.audit('scan','valid',event);
  return info || jsonb_build_object('result','valid','used_at',now());
end;
$$;

-- Lists for the dashboard do not accidentally mix published events of other tenants.
create function public.staff_events() returns setof public.events
language sql stable security invoker set search_path = '' as $$
  select * from public.events where public.can_scan_event(id);
$$;

-- Prevent default PUBLIC function execution and table privileges from bypassing RLS.
revoke all on all functions in schema private from public, anon, authenticated;
revoke all on public.organizations, public.organization_members, public.event_staff from anon, authenticated;
grant select on public.organizations, public.organization_members, public.event_staff to authenticated;
revoke insert,delete on public.orders,public.tickets from anon,authenticated;
revoke update on public.orders from anon,authenticated;
revoke update on public.tickets from anon,authenticated;
grant update(status) on public.tickets to authenticated;
-- Functions with SQL signatures must have explicit least-privilege grants.
revoke all on function public.current_organization_id(), public.can_manage_org(uuid),
  public.can_manage_event(uuid), public.can_scan_event(uuid), public.staff_role(), public.staff_events(),
  public.purchase_tickets(uuid,text,text,jsonb,uuid) from public;
grant execute on function public.current_organization_id(),public.can_manage_org(uuid),
  public.can_manage_event(uuid),public.can_scan_event(uuid),public.staff_role() to anon,authenticated;
grant execute on function public.staff_events() to authenticated;
grant execute on function public.purchase_tickets(uuid,text,text,jsonb,uuid) to anon,authenticated;
create or replace function public.get_order(p_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'buyer_name',  o.buyer_name,

    'created_at',  o.created_at,
    'event', jsonb_build_object(
      'title',     e.title,
      'slug',      e.slug,
      'venue',     e.venue,
      'starts_at', e.starts_at,
      'ends_at',   e.ends_at
    ),
    'tickets', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'code',          t.code,
          'status',        t.status,
          'used_at',       t.used_at,
          'attendee_name', t.attendee_name,
          'type_name',        tt.name,
          'type_description', tt.description,
          'price',            tt.price,
          'design',               tpl.design,
          'description_template', tpl.description_template
        )
        order by tt.name, t.created_at
      )
      from public.tickets t
      join public.ticket_types tt on tt.id = t.ticket_type_id
      left join public.ticket_templates tpl on tpl.id = tt.template_id
      where t.order_id = o.id
    ), '[]'::jsonb)
  )
  from public.orders o
  join public.events e on e.id = o.event_id
  where o.access_token = p_token;
$$;
create or replace function public.event_ticket_stats(p_event_id uuid)
returns table (ticket_type_id uuid, sold integer, used integer)
language sql
stable
security definer
set search_path = public
as $$
  select
    tt.id,
    (count(t.id) filter (where t.status <> 'cancelled'))::integer,
    (count(t.id) filter (where t.status = 'used'))::integer
  from public.ticket_types tt
  join public.events e on e.id = tt.event_id
  left join public.tickets t on t.ticket_type_id = tt.id
  where tt.event_id = p_event_id
    and (e.published or public.can_manage_event(p_event_id))
  group by tt.id;
$$;
commit;
