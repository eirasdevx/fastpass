-- Datos de cada persona de una reserva (nombre, apellidos, DNI y fecha de nacimiento) y edad
-- mínima. Aplicar después de 0010. No es idempotente: ejecutar una sola vez.
-- Si el evento pide DNI o fecha de nacimiento, se piden a TODAS las personas, titular incluido
-- (la persona 1 es el titular). Solo la organización del evento puede leerlos.
begin;

alter table public.events
  -- Pedir nombre y apellidos de cada persona cuando se reserva más de una.
  add column attendee_details boolean not null default false,
  add column require_document boolean not null default false,
  add column require_birth_date boolean not null default false,
  -- Edad mínima el día del evento; exige fecha de nacimiento.
  add column min_age integer check (min_age is null or min_age between 1 and 120);

create table public.reservation_attendees (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null,
  event_id uuid not null,
  position integer not null check (position between 1 and 100),
  first_name text not null check (length(first_name) between 1 and 60),
  last_name text not null default '' check (length(last_name) <= 60),
  document_id text check (document_id ~ '^[A-Z0-9]{5,20}$'),
  birth_date date,
  unique (reservation_id, position),
  foreign key (reservation_id, event_id) references public.reservations(id, event_id) on delete cascade
);
create index reservation_attendees_document on public.reservation_attendees(event_id, document_id);
alter table public.reservation_attendees enable row level security;
create policy reservation_attendee_read on public.reservation_attendees for select using (public.can_manage_event(event_id));
revoke all on public.reservation_attendees from anon, authenticated;
grant select on public.reservation_attendees to authenticated;

-- DNI y NIE con su letra de control; otros documentos (pasaporte…) solo con formato básico.
create function private.valid_document(p text) returns boolean
language plpgsql immutable set search_path = '' as $$
declare letters constant text := 'TRWAGMYFPDXBNJZSQVHLCKE';
begin
  if p ~ '^[0-9]{8}[A-Z]$' then return substr(letters, (left(p, 8)::bigint % 23)::integer + 1, 1) = right(p, 1); end if;
  if p ~ '^[XYZ][0-9]{7}[A-Z]$' then
    return substr(letters, ((translate(left(p, 1), 'XYZ', '012') || substr(p, 2, 7))::bigint % 23)::integer + 1, 1) = right(p, 1);
  end if;
  return p ~ '^[A-Z0-9]{5,20}$';
end;
$$;

-- Valida y normaliza la lista de personas. Devuelve '[]' si el evento no pide datos por persona.
create function private.validate_attendees(ev public.events, p_attendees jsonb, p_quantity integer) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  birth_needed boolean := ev.require_birth_date or ev.min_age is not null;
  item jsonb; result jsonb := '[]'::jsonb; docs text[] := '{}';
  v_first text; v_last text; v_doc text; v_birth date; v_raw text;
begin
  if not (ev.attendee_details or ev.require_document or birth_needed) then return '[]'::jsonb; end if;
  if p_attendees is null or jsonb_typeof(p_attendees) <> 'array' or jsonb_array_length(p_attendees) <> p_quantity then
    raise exception 'ATTENDEES_REQUIRED';
  end if;
  for item in select value from jsonb_array_elements(p_attendees) loop
    if jsonb_typeof(item) <> 'object' then raise exception 'INVALID_INPUT'; end if;
    v_first := btrim(coalesce(item->>'first_name', ''));
    v_last := btrim(coalesce(item->>'last_name', ''));
    if length(v_first) not between 1 and 60 or length(v_last) > 60 or (ev.last_name_required and v_last = '') then
      raise exception 'ATTENDEES_REQUIRED';
    end if;
    v_doc := nullif(upper(regexp_replace(coalesce(item->>'document_id', ''), '[\s.-]', '', 'g')), '');
    if ev.require_document and v_doc is null then raise exception 'ATTENDEES_REQUIRED'; end if;
    if v_doc is not null then
      if length(v_doc) > 20 or not private.valid_document(v_doc) then raise exception 'INVALID_DOCUMENT'; end if;
      if v_doc = any(docs) then raise exception 'DUPLICATE_DOCUMENT'; end if;
      docs := docs || v_doc;
    end if;
    v_raw := coalesce(item->>'birth_date', '');
    v_birth := null;
    if v_raw <> '' then
      if v_raw !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'INVALID_BIRTH_DATE'; end if;
      begin v_birth := v_raw::date; exception when others then v_birth := null; end;
      if v_birth is null or v_birth > current_date or v_birth < date '1900-01-01' then raise exception 'INVALID_BIRTH_DATE'; end if;
    end if;
    if birth_needed and v_birth is null then raise exception 'ATTENDEES_REQUIRED'; end if;
    if ev.min_age is not null and extract(year from age((ev.starts_at at time zone 'Europe/Madrid')::date, v_birth)) < ev.min_age then
      raise exception 'AGE_RESTRICTED';
    end if;
    result := result || jsonb_build_array(jsonb_build_object('first_name', v_first, 'last_name', v_last, 'document_id', v_doc, 'birth_date', v_birth));
  end loop;
  -- Una misma persona no puede figurar en dos reservas vigentes del mismo evento.
  if exists(select 1 from public.reservation_attendees a join public.reservations r on r.id = a.reservation_id
    where a.event_id = ev.id and a.document_id = any(docs)
      and private.reservation_status(r.status, ev.pickup_deadline) in ('pending_pickup','partially_picked_up','completed')) then
    raise exception 'DUPLICATE_DOCUMENT';
  end if;
  return result;
end;
$$;

-- Reservar: igual que en 0008 más la lista de personas (p_attendees).
drop function public.reserve_bonocopas(uuid, uuid, integer, text, text, text, text, boolean, boolean, text);
create function public.reserve_bonocopas(p_event uuid, p_type uuid, p_quantity integer, p_first text, p_last text,
  p_email text, p_phone text default '', p_consent boolean default false, p_manual boolean default false, p_notes text default '',
  p_attendees jsonb default '[]'::jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare ev public.events%rowtype; tt public.ticket_types%rowtype; n bigint; v_email text; v_code text; token text;
  v_reservation uuid; people jsonb;
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
    people := private.validate_attendees(ev, p_attendees, p_quantity);

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
      case when p_consent then now() end)
    returning id into v_reservation;
    insert into public.reservation_attendees(reservation_id, event_id, position, first_name, last_name, document_id, birth_date)
      select v_reservation, p_event, (e.ordinality)::integer, e.value->>'first_name', e.value->>'last_name',
        e.value->>'document_id', (e.value->>'birth_date')::date
      from jsonb_array_elements(people) with ordinality e;
    perform private.audit('reservation', case when p_manual then 'created_manual' else 'created' end, p_event);
    return jsonb_build_object('token', token, 'code', v_code);
  exception when raise_exception then return jsonb_build_object('error', SQLERRM);
  end;
end;
$$;

-- Justificante y punto de recogida: personas con el documento enmascarado y plantilla del justificante.
create or replace function private.reservation_summary(p_reservation uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'code', r.code, 'holder', trim(r.first_name || ' ' || r.last_name), 'type_name', tt.name,
    'quantity', r.quantity, 'delivered_quantity', r.delivered_quantity,
    'pending_quantity', case when s.status in ('pending_pickup','partially_picked_up') then r.quantity - r.delivered_quantity else 0 end,
    'unit_price', r.unit_price, 'total', r.unit_price * r.quantity, 'amount_paid', r.amount_paid,
    'amount_pending', case when s.status in ('pending_pickup','partially_picked_up') then r.unit_price * (r.quantity - r.delivered_quantity) else 0 end,
    'status', s.status, 'created_at', r.created_at, 'expires_at', e.pickup_deadline,
    'event_title', e.title, 'event_starts_at', e.starts_at, 'event_venue', e.venue, 'event_status', e.status,
    'pickup_address', e.pickup_address, 'pickup_instructions', e.pickup_instructions, 'item_name', e.pickup_item_name,
    -- Personas de la reserva con el documento enmascarado: basta para cotejarlo en la recogida.
    'people', coalesce((select jsonb_agg(jsonb_build_object('name', trim(a.first_name || ' ' || a.last_name),
        'document', case when a.document_id is null then null else repeat('•', greatest(length(a.document_id) - 4, 0)) || right(a.document_id, 4) end)
        order by a.position) from public.reservation_attendees a where a.reservation_id = r.id), '[]'::jsonb),
    -- Plantilla del justificante (la del tipo); sin plantilla se usa la de por defecto.
    'design', (select tpl.design from public.ticket_templates tpl where tpl.id = tt.template_id))
  from public.reservations r
  join public.events e on e.id = r.event_id
  join public.ticket_types tt on tt.id = r.ticket_type_id
  cross join lateral (select private.reservation_status(r.status, e.pickup_deadline) as status) s
  where r.id = p_reservation;
$$;

-- Panel: buscar también por nombre o documento de cualquier persona; detalle con todos sus datos.
create or replace function public.list_reservations(p_event uuid, p_query text default '', p_status text default '',
  p_type uuid default null, p_page integer default 1, p_size integer default 25, p_ascending boolean default false) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb; q text := lower(trim(coalesce(p_query, '')));
begin
  if not public.can_manage_event(p_event) then raise exception 'FORBIDDEN'; end if;
  if p_page is null or p_page < 1 or p_page > 100000 or p_size is null or p_size not between 1 and 500
    or length(q) > 120 or coalesce(p_status, '') not in ('','pending_pickup','partially_picked_up','completed','cancelled','expired') then raise exception 'INVALID_INPUT'; end if;
  with rows as (
    select r.id, r.code, r.first_name, r.last_name, trim(r.first_name || ' ' || r.last_name) as name, r.email, r.phone,
      r.ticket_type_id as type_id, tt.name as type_name, r.quantity, r.delivered_quantity, r.unit_price, r.amount_paid,
      r.unit_price * r.quantity as total, private.reservation_status(r.status, e.pickup_deadline) as status,
      r.source, r.created_at,
      (select string_agg(trim(a.first_name || ' ' || a.last_name) || coalesce(' · ' || a.document_id, '') || coalesce(' · ' || to_char(a.birth_date, 'DD/MM/YYYY'), ''), '; ' order by a.position)
        from public.reservation_attendees a where a.reservation_id = r.id) as people
    from public.reservations r join public.events e on e.id = r.event_id join public.ticket_types tt on tt.id = r.ticket_type_id
    where r.event_id = p_event
  ), filtered as (
    select * from rows where (coalesce(p_status, '') = '' or status = p_status) and (p_type is null or type_id = p_type)
      and (q = '' or position(q in lower(name)) > 0 or position(q in email) > 0 or code = upper(q)
        or exists(select 1 from public.reservation_attendees a where a.reservation_id = rows.id
          and (position(q in lower(a.first_name || ' ' || a.last_name)) > 0 or lower(a.document_id) = q)))
  ), page as (
    select * from filtered order by case when p_ascending then created_at end asc, case when not p_ascending then created_at end desc, id
    limit p_size offset (p_page - 1) * p_size
  ) select jsonb_build_object('total', (select count(*) from filtered),
      'rows', coalesce((select jsonb_agg(to_jsonb(page)) from page), '[]'::jsonb)) into result;
  return result;
end;
$$;

create or replace function public.reservation_detail(p_reservation uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r public.reservations%rowtype;
begin
  select * into r from public.reservations where id = p_reservation;
  if not found or not public.can_manage_event(r.event_id) then raise exception 'FORBIDDEN'; end if;
  return private.reservation_summary(r.id) || jsonb_build_object(
    'id', r.id, 'event_id', r.event_id, 'email', r.email, 'phone', r.phone, 'notes', r.notes, 'source', r.source,
    'cancelled_at', r.cancelled_at, 'privacy_accepted_at', r.privacy_accepted_at,
    'attendees', coalesce((select jsonb_agg(jsonb_build_object('position', a.position, 'first_name', a.first_name,
        'last_name', a.last_name, 'document_id', a.document_id, 'birth_date', a.birth_date) order by a.position)
      from public.reservation_attendees a where a.reservation_id = r.id), '[]'::jsonb),
    'pickups', coalesce((select jsonb_agg(jsonb_build_object('quantity', p.quantity, 'amount', p.amount,
        'payment_method', p.payment_method, 'created_at', p.created_at, 'admin_email', u.email) order by p.created_at)
      from public.reservation_pickups p left join auth.users u on u.id = p.admin_id where p.reservation_id = r.id), '[]'::jsonb));
end;
$$;

revoke all on function private.valid_document(text), private.validate_attendees(public.events, jsonb, integer),
  private.reservation_summary(uuid) from public, anon, authenticated;
revoke all on function public.reserve_bonocopas(uuid, uuid, integer, text, text, text, text, boolean, boolean, text, jsonb) from public, anon, authenticated;
grant execute on function public.reserve_bonocopas(uuid, uuid, integer, text, text, text, text, boolean, boolean, text, jsonb) to anon, authenticated;
commit;
