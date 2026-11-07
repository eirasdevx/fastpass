-- Reservas de bonocopas con recogida y pago presencial (modalidad 'pickup').
-- Aplicar después de 0007. No es idempotente: ejecutar una sola vez.
-- No hay pagos online: la reserva genera un justificante que NO da acceso al evento.
-- Todas las operaciones que consumen aforo bloquean la fila del evento; las entregas
-- bloquean la fila de la reserva. El aforo comprometido de un evento es:
--   entradas emitidas + inscripciones pendientes + bonocopas reservados (activos)
--   + bonocopas entregados + plazas reservadas para otros canales.
begin;

-- --- Configuración del evento ----------------------------------------------------------

do $$
declare c text;
begin
  for c in select conname from pg_constraint
    where conrelid='public.events'::regclass and contype='c' and pg_get_constraintdef(oid) like '%registration_mode%'
  loop execute format('alter table public.events drop constraint %I', c); end loop;
end;
$$;
alter table public.events
  add constraint events_registration_mode_check check (registration_mode in ('manual','automatic','payment','pickup')),
  add column reservations_open_at timestamptz,
  add column reservations_close_at timestamptz,
  add column pickup_deadline timestamptz,
  add column pickup_address text not null default '' check (length(pickup_address) <= 300),
  add column pickup_instructions text not null default '' check (length(pickup_instructions) <= 2000),
  add column max_per_person integer check (max_per_person is null or max_per_person between 1 and 100),
  add column reserved_other_channels integer not null default 0 check (reserved_other_channels between 0 and 1000000),
  add constraint events_reservation_window check (reservations_close_at is null or reservations_open_at is null or reservations_close_at > reservations_open_at);

-- --- Reservas y entregas ----------------------------------------------------------------

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  ticket_type_id uuid not null references public.ticket_types(id),
  -- Identificador para localizar la reserva; no basta para autorizar una entrega.
  code text not null check (code ~ '^[A-Z0-9]{4}$'),
  -- Solo la huella SHA-256 del token del QR; el token no se guarda.
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  first_name text not null check (length(first_name) between 1 and 60),
  last_name text not null check (length(last_name) <= 60),
  email text not null check (length(email) <= 254 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone text not null default '' check (length(phone) <= 30),
  quantity integer not null check (quantity between 1 and 100),
  delivered_quantity integer not null default 0 check (delivered_quantity between 0 and quantity),
  -- Precio fijado al reservar: cambiar el precio del tipo no altera reservas hechas.
  unit_price numeric(10,2) not null check (unit_price >= 0),
  amount_paid numeric(10,2) not null default 0 check (amount_paid >= 0),
  status text not null default 'pending_pickup'
    check (status in ('pending_pickup','partially_picked_up','completed','cancelled','expired')),
  source text not null check (source in ('public','manual')),
  notes text not null default '' check (length(notes) <= 2000),
  privacy_accepted_at timestamptz,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  unique(event_id, code),
  unique(id, event_id)
);
create index reservations_event_created on public.reservations(event_id, created_at desc, id);
create index reservations_type on public.reservations(ticket_type_id);
create index reservations_event_email on public.reservations(event_id, email);

create table public.reservation_pickups (
  id bigint generated always as identity primary key,
  reservation_id uuid not null,
  event_id uuid not null,
  quantity integer not null check (quantity between 1 and 100),
  amount numeric(10,2) not null check (amount >= 0),
  payment_method text not null check (payment_method in ('cash','card','bizum','other')),
  admin_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (reservation_id, event_id) references public.reservations(id, event_id) on delete cascade
);
create index reservation_pickups_reservation on public.reservation_pickups(reservation_id, created_at);
create index reservation_pickups_event on public.reservation_pickups(event_id, created_at desc);

alter table public.reservations enable row level security;
alter table public.reservation_pickups enable row level security;
create policy reservation_read on public.reservations for select using (public.can_manage_event(event_id));
create policy reservation_pickup_read on public.reservation_pickups for select using (public.can_manage_event(event_id));
-- Solo lectura para el panel; toda escritura pasa por las funciones de abajo.
revoke all on public.reservations, public.reservation_pickups from anon, authenticated;
grant select on public.reservations, public.reservation_pickups to authenticated;

-- --- Utilidades internas ----------------------------------------------------------------

-- Estado real: una reserva activa pasada la fecha límite de recogida está caducada,
-- aunque todavía no se haya actualizado la fila (caducidad automática sin tareas programadas).
create function private.reservation_status(p_status text, p_deadline timestamptz) returns text
language sql stable set search_path = '' as $$
  select case when p_status in ('pending_pickup','partially_picked_up') and p_deadline is not null and p_deadline <= now()
    then 'expired' else p_status end;
$$;

-- Bonocopas que ocupan aforo: los reservados de reservas activas y, en las demás,
-- los ya entregados (cancelar o caducar libera solo lo no entregado).
create function private.reserved_units(p_event uuid, p_type uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(case when private.reservation_status(r.status, e.pickup_deadline) in ('pending_pickup','partially_picked_up')
    then r.quantity else r.delivered_quantity end), 0)::bigint
  from public.reservations r join public.events e on e.id = r.event_id
  where case when p_type is null then r.event_id = p_event else r.ticket_type_id = p_type end;
$$;

create function private.expire_reservations(p_event uuid) returns void
language sql security definer set search_path = '' as $$
  update public.reservations r set status = 'expired'
  from public.events e
  where e.id = r.event_id and r.event_id = p_event and r.status in ('pending_pickup','partially_picked_up')
    and e.pickup_deadline is not null and e.pickup_deadline <= now();
$$;

-- Mismo alfabeto que los códigos de entrada (sin 0/O ni 1/I): 32^4 = 1.048.576 códigos.
create function private.reservation_code(p_event uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare candidate text; n integer; alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
begin
  -- Con más de la mitad ocupada los reintentos dejarían de ser fiables.
  if (select count(*) from public.reservations where event_id = p_event) >= 524288 then raise exception 'CODE_SPACE_EXHAUSTED'; end if;
  for attempt in 1..128 loop
    n := ('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 5))::bit(20)::integer;
    candidate := '';
    for pos in 1..4 loop
      candidate := candidate || substr(alphabet, (n % 32) + 1, 1); n := n / 32;
    end loop;
    if not exists(select 1 from public.reservations where event_id = p_event and code = candidate) then return candidate; end if;
  end loop;
  raise exception 'CODE_RETRY_EXHAUSTED';
end;
$$;

-- Datos mínimos para el justificante y para el punto de recogida (sin correo ni teléfono).
create function private.reservation_summary(p_reservation uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'code', r.code, 'holder', trim(r.first_name || ' ' || r.last_name), 'type_name', tt.name,
    'quantity', r.quantity, 'delivered_quantity', r.delivered_quantity,
    'pending_quantity', case when s.status in ('pending_pickup','partially_picked_up') then r.quantity - r.delivered_quantity else 0 end,
    'unit_price', r.unit_price, 'total', r.unit_price * r.quantity, 'amount_paid', r.amount_paid,
    'amount_pending', case when s.status in ('pending_pickup','partially_picked_up') then r.unit_price * (r.quantity - r.delivered_quantity) else 0 end,
    'status', s.status, 'created_at', r.created_at, 'expires_at', e.pickup_deadline,
    'event_title', e.title, 'event_starts_at', e.starts_at, 'event_venue', e.venue, 'event_status', e.status,
    'pickup_address', e.pickup_address, 'pickup_instructions', e.pickup_instructions)
  from public.reservations r
  join public.events e on e.id = r.event_id
  join public.ticket_types tt on tt.id = r.ticket_type_id
  cross join lateral (select private.reservation_status(r.status, e.pickup_deadline) as status) s
  where r.id = p_reservation;
$$;

-- --- Controles de aforo existentes, ahora contando bonocopas y otros canales --------------

create or replace function private.guard_ticket() returns trigger
language plpgsql security definer set search_path='' as $$
declare ev public.events%rowtype; tt public.ticket_types%rowtype; n bigint;
begin
  if TG_OP='UPDATE' and (new.id,new.event_id,new.order_id,new.ticket_type_id,new.code,new.registration_id)
    is distinct from (old.id,old.event_id,old.order_id,old.ticket_type_id,old.code,old.registration_id) then raise exception 'IMMUTABLE_TICKET'; end if;
  select * into ev from public.events where id=new.event_id for update;
  select * into tt from public.ticket_types where id=new.ticket_type_id;
  if tt.event_id is distinct from new.event_id or not exists(select 1 from public.orders where id=new.order_id and event_id=new.event_id)
    or (new.registration_id is not null and new.status<>'cancelled' and not exists(select 1 from public.registrations where id=new.registration_id and event_id=new.event_id and ticket_type_id=new.ticket_type_id and status='approved'))
    then raise exception 'INVALID_INPUT'; end if;
  if new.status <> 'cancelled' and (TG_OP='INSERT' or old.status='cancelled') then
    select (select count(*) from public.tickets where event_id=new.event_id and status<>'cancelled' and id<>new.id)
      + (select count(*) from public.registrations where event_id=new.event_id and status='pending')
      + private.reserved_units(new.event_id,null) + ev.reserved_other_channels into n;
    if ev.capacity is not null and n>=ev.capacity then raise exception 'SOLD_OUT'; end if;
    select (select count(*) from public.tickets where ticket_type_id=new.ticket_type_id and status<>'cancelled' and id<>new.id)
      + (select count(*) from public.registrations where ticket_type_id=new.ticket_type_id and status='pending')
      + private.reserved_units(null,new.ticket_type_id) into n;
    if tt.capacity is not null and n>=tt.capacity then raise exception 'SOLD_OUT'; end if;
  end if;
  if TG_OP='UPDATE' and new.status is distinct from old.status then perform private.audit('ticket_status',new.status::text,new.event_id); end if;
  if new.status='used' then
    new.used_at:=coalesce(old.used_at,clock_timestamp());
    new.validated_by:=case when TG_OP='UPDATE' and old.status='used' then old.validated_by else auth.uid() end;
  else new.used_at:=null; new.validated_by:=null; end if;
  return new;
end;
$$;

create or replace function private.guard_event() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.organization_id is distinct from old.organization_id then raise exception 'IMMUTABLE_ORGANIZATION'; end if;
  if new.capacity is not null and new.capacity <
    (select count(*) from public.tickets where event_id=new.id and status<>'cancelled') +
    (select count(*) from public.registrations where event_id=new.id and status='pending') +
    private.reserved_units(new.id,null) + new.reserved_other_channels then raise exception 'CAPACITY_BELOW_SOLD'; end if;
  return new;
end;
$$;

create or replace function private.guard_type() returns trigger
language plpgsql security definer set search_path='' as $$
declare org uuid;
begin
  if TG_OP='UPDATE' and new.event_id is distinct from old.event_id then raise exception 'IMMUTABLE_EVENT'; end if;
  select organization_id into org from public.events where id=new.event_id for update;
  if new.template_id is not null and not exists(select 1 from public.ticket_templates where id=new.template_id and organization_id=org) then raise exception 'INVALID_TEMPLATE'; end if;
  if new.capacity is not null and new.capacity <
    (select count(*) from public.tickets where ticket_type_id=new.id and status<>'cancelled') +
    (select count(*) from public.registrations where ticket_type_id=new.id and status='pending') +
    private.reserved_units(null,new.id) then raise exception 'CAPACITY_BELOW_SOLD'; end if;
  return new;
end;
$$;

create or replace function public.register_attendee(p_event uuid,p_type uuid,p_first text,p_last text,p_email text,
  p_phone text default '',p_consent boolean default false,p_manual boolean default false,p_approve boolean default false,p_notes text default '') returns jsonb
language plpgsql security definer set search_path='' as $$
declare ev public.events%rowtype; tt public.ticket_types%rowtype; a uuid; r uuid; t uuid; token text; n bigint;
begin
  if p_manual is null or p_approve is null or p_consent is null then return jsonb_build_object('error','INVALID_INPUT'); end if;
  if p_manual and not public.can_manage_event(p_event) then return jsonb_build_object('error','FORBIDDEN'); end if;
  if not exists(select 1 from public.events where id=p_event and (p_manual or (published and registration_enabled))) then return jsonb_build_object('error','EVENT_UNAVAILABLE'); end if;
  if not p_manual then
    -- An event-wide DB budget also bounds callers who rotate email or bypass Next.
    if not private.registration_attempt('event:'||p_event::text,100,60) then return jsonb_build_object('error','RATE_LIMITED'); end if;
    if p_email is not null and not private.registration_attempt('email:'||p_event::text||':'||encode(sha256(convert_to(lower(trim(p_email)),'UTF8')),'hex'),5,3600) then return jsonb_build_object('error','RATE_LIMITED'); end if;
  end if;
  -- Catch expected failures inside a subtransaction so rate counters commit.
  begin
    if p_first is null or length(trim(p_first)) not between 1 and 60 or p_last is null or length(trim(p_last))>60
      or p_email is null or length(p_email)>254 or p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
      or p_phone is null or length(p_phone)>30 or p_notes is null or length(p_notes)>2000
      or (not p_manual and (not p_consent or p_approve or p_notes<>'')) then raise exception 'INVALID_INPUT'; end if;
    select * into ev from public.events where id=p_event for update;
    if not found or ev.organization_id is null or ev.status in ('cancelled','finished') or coalesce(ev.ends_at,ev.starts_at)<now()
      or (not p_manual and (not ev.published or not ev.registration_enabled or ev.status not in ('published','live')
        or trim(ev.privacy_controller)='' or trim(ev.privacy_contact)='' or ev.registration_mode='pickup')) then raise exception 'EVENT_UNAVAILABLE'; end if;
    if (ev.last_name_required and trim(p_last)='') or (ev.phone_required and trim(p_phone)='') then raise exception 'INVALID_INPUT'; end if;
    select * into tt from public.ticket_types where id=p_type and event_id=p_event;
    if not found or (not p_manual and not tt.sales_open) then raise exception 'SALES_CLOSED'; end if;
    if ev.prevent_duplicates and exists(select 1 from public.registrations r join public.attendees a on a.id=r.attendee_id
      where r.event_id=p_event and r.status<>'cancelled' and a.email=lower(trim(p_email))) then raise exception 'DUPLICATE_REGISTRATION'; end if;
    select (select count(*) from public.tickets where event_id=p_event and status<>'cancelled')+
      (select count(*) from public.registrations where event_id=p_event and status='pending')+
      private.reserved_units(p_event,null)+ev.reserved_other_channels into n;
    if ev.capacity is not null and n>=ev.capacity then raise exception 'SOLD_OUT'; end if;
    select (select count(*) from public.tickets where ticket_type_id=p_type and status<>'cancelled')+
      (select count(*) from public.registrations where ticket_type_id=p_type and status='pending')+
      private.reserved_units(null,p_type) into n;
    if tt.capacity is not null and n>=tt.capacity then raise exception 'SOLD_OUT'; end if;
    insert into public.attendees(event_id,first_name,last_name,email,phone) values(p_event,trim(p_first),trim(p_last),lower(trim(p_email)),trim(p_phone)) returning id into a;
    insert into public.registrations(event_id,attendee_id,ticket_type_id,source,notes,privacy_accepted_at)
      values(p_event,a,p_type,case when p_manual then 'manual' else 'public' end,case when p_manual then p_notes else '' end,case when p_consent then now() end) returning id into r;
    token:=private.registration_link(r);
    if (p_manual and p_approve) or (not p_manual and ev.registration_mode='automatic') then t:=private.issue_registration(r); end if;
    perform private.audit('registration',case when t is null then 'pending' else 'approved' end,p_event);
    return jsonb_build_object('token',token,'status',case when t is null then 'pending' else 'approved' end);
  exception when raise_exception then return jsonb_build_object('error',SQLERRM);
  end;
end;
$$;

-- --- Reservar (público y alta manual desde el panel) --------------------------------------

create function public.reserve_bonocopas(p_event uuid, p_type uuid, p_quantity integer, p_first text, p_last text,
  p_email text, p_phone text default '', p_consent boolean default false, p_manual boolean default false, p_notes text default '')
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare ev public.events%rowtype; tt public.ticket_types%rowtype; n bigint; v_email text; v_code text; token text;
begin
  if p_manual is null or p_consent is null or p_quantity is null then return jsonb_build_object('error','INVALID_INPUT'); end if;
  if p_manual and not public.can_manage_event(p_event) then return jsonb_build_object('error','FORBIDDEN'); end if;
  if not p_manual then
    -- Límite por evento (también frena a quien cambia de correo) y por correo.
    if not private.registration_attempt('reserve:' || p_event::text, 100, 60) then return jsonb_build_object('error','RATE_LIMITED'); end if;
    if p_email is not null and not private.registration_attempt('reserve-email:' || p_event::text || ':' ||
      encode(sha256(convert_to(lower(trim(p_email)), 'UTF8')), 'hex'), 5, 3600) then return jsonb_build_object('error','RATE_LIMITED'); end if;
  end if;
  -- Los errores esperados se capturan en una subtransacción para que los contadores se guarden.
  begin
    v_email := lower(trim(coalesce(p_email, '')));
    if p_first is null or length(trim(p_first)) not between 1 and 60 or p_last is null or length(trim(p_last)) > 60
      or length(v_email) > 254 or v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
      or p_phone is null or length(p_phone) > 30 or p_notes is null or length(p_notes) > 2000
      or p_quantity not between 1 and 100
      or (not p_manual and (not p_consent or p_notes <> '')) then raise exception 'INVALID_INPUT'; end if;

    select * into ev from public.events where id = p_event for update;
    if not found or ev.organization_id is null or ev.registration_mode <> 'pickup'
      or ev.status in ('cancelled','finished') or coalesce(ev.ends_at, ev.starts_at) < now()
      or (ev.pickup_deadline is not null and ev.pickup_deadline <= now())
      or (not p_manual and (not ev.published or not ev.registration_enabled or ev.status not in ('published','live')
        or trim(ev.privacy_controller) = '' or trim(ev.privacy_contact) = '')) then raise exception 'EVENT_UNAVAILABLE'; end if;
    if not p_manual and ev.reservations_open_at is not null and now() < ev.reservations_open_at then raise exception 'RESERVATIONS_NOT_OPEN'; end if;
    if not p_manual and ev.reservations_close_at is not null and now() >= ev.reservations_close_at then raise exception 'RESERVATIONS_CLOSED'; end if;
    if (ev.last_name_required and trim(p_last) = '') or (ev.phone_required and trim(p_phone) = '') then raise exception 'INVALID_INPUT'; end if;

    select * into tt from public.ticket_types where id = p_type and event_id = p_event;
    if not found or (not p_manual and not tt.sales_open) then raise exception 'SALES_CLOSED'; end if;
    if not p_manual and p_quantity > tt.max_per_order then raise exception 'ORDER_LIMIT'; end if;
    if not p_manual and ev.max_per_person is not null and p_quantity + (
      select coalesce(sum(case when private.reservation_status(status, ev.pickup_deadline) in ('pending_pickup','partially_picked_up')
        then quantity else delivered_quantity end), 0)
      from public.reservations where event_id = p_event and email = v_email) > ev.max_per_person then raise exception 'PERSON_LIMIT'; end if;

    perform private.expire_reservations(p_event);
    if ev.capacity is not null then
      select (select count(*) from public.tickets where event_id = p_event and status <> 'cancelled')
        + (select count(*) from public.registrations where event_id = p_event and status = 'pending')
        + private.reserved_units(p_event, null) + ev.reserved_other_channels into n;
      if n + p_quantity > ev.capacity then raise exception 'SOLD_OUT'; end if;
    end if;
    if tt.capacity is not null then
      select (select count(*) from public.tickets where ticket_type_id = p_type and status <> 'cancelled')
        + (select count(*) from public.registrations where ticket_type_id = p_type and status = 'pending')
        + private.reserved_units(null, p_type) into n;
      if n + p_quantity > tt.capacity then raise exception 'SOLD_OUT'; end if;
    end if;

    v_code := private.reservation_code(p_event);
    token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
    insert into public.reservations(event_id, ticket_type_id, code, token_hash, first_name, last_name, email, phone,
      quantity, unit_price, source, notes, privacy_accepted_at)
    values (p_event, p_type, v_code, encode(sha256(convert_to(token, 'UTF8')), 'hex'), trim(p_first), trim(p_last), v_email, trim(p_phone),
      p_quantity, tt.price, case when p_manual then 'manual' else 'public' end, case when p_manual then p_notes else '' end,
      case when p_consent then now() end);
    perform private.audit('reservation', case when p_manual then 'created_manual' else 'created' end, p_event);
    return jsonb_build_object('token', token, 'code', v_code);
  exception when raise_exception then return jsonb_build_object('error', SQLERRM);
  end;
end;
$$;

-- Justificante y consulta del estado: solo con el token completo del enlace/QR.
create function public.get_reservation(p_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select private.reservation_summary(r.id) from public.reservations r
  where p_token ~ '^[a-f0-9]{64}$' and r.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
$$;

-- --- Punto de recogida ---------------------------------------------------------------------

-- p_credential: token del QR (64 hex, o la URL que lo contiene) o código de 4 caracteres.
create function private.find_reservation(p_event uuid, p_credential text, out reservation_id uuid, out by_code boolean)
language plpgsql stable security definer set search_path = '' as $$
declare v text := coalesce(p_credential, ''); token text;
begin
  if length(v) > 300 then return; end if;
  token := substring(lower(v) from '([a-f0-9]{64})');
  if token is not null then
    select id into reservation_id from public.reservations
      where event_id = p_event and token_hash = encode(sha256(convert_to(token, 'UTF8')), 'hex');
    by_code := false;
    return;
  end if;
  v := upper(regexp_replace(v, '[\s-]', '', 'g'));
  if v ~ '^[A-Z0-9]{4}$' then
    select id into reservation_id from public.reservations where event_id = p_event and code = v;
    by_code := true;
  end if;
end;
$$;

create function public.lookup_reservation(p_event uuid, p_credential text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare f record;
begin
  if not public.can_scan_event(p_event) then perform private.audit('reservation_lookup','denied', p_event); return jsonb_build_object('error','FORBIDDEN'); end if;
  if not private.allow_scan() then return jsonb_build_object('error','RATE_LIMITED'); end if;
  select * into f from private.find_reservation(p_event, p_credential);
  if f.reservation_id is null then return jsonb_build_object('error','NOT_FOUND'); end if;
  return jsonb_build_object('by_code', f.by_code, 'reservation', private.reservation_summary(f.reservation_id));
end;
$$;

create function public.record_pickup(p_event uuid, p_credential text, p_quantity integer, p_method text,
  p_payment_confirmed boolean, p_identity_checked boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare f record; r public.reservations%rowtype; ev public.events%rowtype; v_amount numeric(10,2); v_delivered integer;
begin
  if not public.can_scan_event(p_event) then perform private.audit('reservation_pickup','denied', p_event); return jsonb_build_object('error','FORBIDDEN'); end if;
  if not private.allow_scan() then return jsonb_build_object('error','RATE_LIMITED'); end if;
  if p_quantity is null or p_quantity < 1 or p_method is null or p_method not in ('cash','card','bizum','other') then return jsonb_build_object('error','INVALID_INPUT'); end if;
  if p_payment_confirmed is not true then return jsonb_build_object('error','PAYMENT_NOT_CONFIRMED'); end if;
  select * into f from private.find_reservation(p_event, p_credential);
  if f.reservation_id is null then return jsonb_build_object('error','NOT_FOUND'); end if;
  -- Con solo el código de 4 caracteres hay que comprobar la identidad del titular.
  if f.by_code and p_identity_checked is not true then return jsonb_build_object('error','IDENTITY_CHECK_REQUIRED'); end if;

  -- Bloquea la reserva: una segunda entrega simultánea espera y ve la cantidad ya actualizada.
  select * into r from public.reservations where id = f.reservation_id for update;
  select * into ev from public.events where id = r.event_id;
  if ev.status = 'cancelled' then return jsonb_build_object('error','EVENT_UNAVAILABLE'); end if;
  if r.status = 'cancelled' then return jsonb_build_object('error','RESERVATION_CANCELLED'); end if;
  if r.status = 'completed' then return jsonb_build_object('error','ALREADY_COMPLETED'); end if;
  if private.reservation_status(r.status, ev.pickup_deadline) = 'expired' then
    update public.reservations set status = 'expired' where id = r.id and status <> 'expired';
    return jsonb_build_object('error','RESERVATION_EXPIRED');
  end if;
  if p_quantity > r.quantity - r.delivered_quantity then return jsonb_build_object('error','QUANTITY_EXCEEDED'); end if;

  -- El importe lo calcula el servidor con el precio fijado al reservar.
  v_amount := r.unit_price * p_quantity;
  v_delivered := r.delivered_quantity + p_quantity;
  update public.reservations set delivered_quantity = v_delivered, amount_paid = amount_paid + v_amount,
    status = case when v_delivered = quantity then 'completed' else 'partially_picked_up' end
  where id = r.id;
  insert into public.reservation_pickups(reservation_id, event_id, quantity, amount, payment_method, admin_id)
    values (r.id, r.event_id, p_quantity, v_amount, p_method, auth.uid());
  perform private.audit('reservation_pickup', case when v_delivered = r.quantity then 'completed' else 'partial' end, r.event_id);
  return jsonb_build_object('delivered', p_quantity, 'amount', v_amount, 'reservation', private.reservation_summary(r.id));
end;
$$;

-- --- Gestión --------------------------------------------------------------------------------

create function public.cancel_reservation(p_reservation uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.reservations%rowtype;
begin
  select * into r from public.reservations where id = p_reservation;
  if not found or not public.can_manage_event(r.event_id) then return jsonb_build_object('error','FORBIDDEN'); end if;
  select * into r from public.reservations where id = p_reservation for update;
  if r.status in ('completed','cancelled') then return jsonb_build_object('error','INVALID_TRANSITION'); end if;
  -- Lo ya entregado sigue contando en el aforo; se libera solo lo pendiente.
  update public.reservations set status = 'cancelled', cancelled_at = now() where id = r.id;
  perform private.audit('reservation', 'cancelled', r.event_id);
  return jsonb_build_object('reservation', private.reservation_summary(r.id));
end;
$$;

create function public.reservation_stats(p_event uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'capacity', e.capacity,
    'other_channels', e.reserved_other_channels,
    'tickets', (select count(*) from public.tickets where event_id = e.id and status <> 'cancelled'),
    'registrations_pending', (select count(*) from public.registrations where event_id = e.id and status = 'pending'),
    'reserved_pending', coalesce(sum(r.quantity - r.delivered_quantity) filter (where s.status in ('pending_pickup','partially_picked_up')), 0),
    'delivered', coalesce(sum(r.delivered_quantity), 0),
    'amount_collected', coalesce(sum(r.amount_paid), 0),
    'reservations_active', count(r.id) filter (where s.status in ('pending_pickup','partially_picked_up')),
    'reservations_completed', count(r.id) filter (where s.status = 'completed'),
    'reservations_cancelled', count(r.id) filter (where s.status = 'cancelled'),
    'reservations_expired', count(r.id) filter (where s.status = 'expired'),
    'committed', (select count(*) from public.tickets where event_id = e.id and status <> 'cancelled')
      + (select count(*) from public.registrations where event_id = e.id and status = 'pending')
      + private.reserved_units(e.id, null) + e.reserved_other_channels)
  from public.events e
  left join public.reservations r on r.event_id = e.id
  left join lateral (select private.reservation_status(r.status, e.pickup_deadline) as status) s on true
  where e.id = p_event and public.can_manage_event(p_event)
  group by e.id;
$$;

-- --- Permisos -------------------------------------------------------------------------------

revoke all on function private.reservation_status(text, timestamptz), private.reserved_units(uuid, uuid),
  private.expire_reservations(uuid), private.reservation_code(uuid), private.reservation_summary(uuid),
  private.find_reservation(uuid, text) from public, anon, authenticated;
revoke all on function public.reserve_bonocopas(uuid, uuid, integer, text, text, text, text, boolean, boolean, text),
  public.get_reservation(text), public.lookup_reservation(uuid, text),
  public.record_pickup(uuid, text, integer, text, boolean, boolean), public.cancel_reservation(uuid),
  public.reservation_stats(uuid) from public, anon, authenticated;
grant execute on function public.reserve_bonocopas(uuid, uuid, integer, text, text, text, text, boolean, boolean, text),
  public.get_reservation(text) to anon, authenticated;
grant execute on function public.lookup_reservation(uuid, text), public.record_pickup(uuid, text, integer, text, boolean, boolean),
  public.cancel_reservation(uuid), public.reservation_stats(uuid) to authenticated;
commit;
