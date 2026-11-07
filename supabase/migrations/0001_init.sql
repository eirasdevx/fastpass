-- =====================================================================
-- FastPass · esquema inicial
-- Ejecutar en Supabase → SQL Editor (o `supabase db push`).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Administradores
-- Solo los usuarios de auth.users presentes en esta tabla gestionan eventos.
-- Los clientes NO tienen cuenta.
-- ---------------------------------------------------------------------
create table public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- updated_at automático
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Plantillas de entrada (diseño visual + descripción con variables)
-- ---------------------------------------------------------------------
create table public.ticket_templates (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null check (char_length(name) between 1 and 80),
  design               jsonb not null default '{}'::jsonb,
  description_template text not null default '',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create trigger ticket_templates_updated_at
  before update on public.ticket_templates
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Eventos
-- ---------------------------------------------------------------------
create table public.events (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  title       text not null check (char_length(title) between 1 and 120),
  description text not null default '',
  venue       text not null default '',
  starts_at   timestamptz not null,
  ends_at     timestamptz,
  cover_url   text,
  published   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at)
);

create index events_published_starts_idx on public.events (published, starts_at);

create trigger events_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Tipos de entrada (General, VIP…) — cada uno usa una plantilla
-- ---------------------------------------------------------------------
create table public.ticket_types (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.events (id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 60),
  description   text not null default '',
  price         numeric(10, 2) not null default 0 check (price >= 0),
  capacity      integer check (capacity is null or capacity > 0), -- null = sin límite
  max_per_order integer not null default 10 check (max_per_order between 1 and 50),
  template_id   uuid references public.ticket_templates (id) on delete set null,
  sales_open    boolean not null default true,
  created_at    timestamptz not null default now()
);

create index ticket_types_event_idx on public.ticket_types (event_id);

-- ---------------------------------------------------------------------
-- Pedidos (clientes sin registro: se identifican por un token secreto)
-- ---------------------------------------------------------------------
create table public.orders (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references public.events (id) on delete cascade,
  buyer_name   text not null,
  buyer_email  text not null,
  access_token uuid not null unique default gen_random_uuid(),
  created_at   timestamptz not null default now()
);

create index orders_event_idx on public.orders (event_id);

-- ---------------------------------------------------------------------
-- Entradas
-- code: 16 caracteres hex aleatorios → es lo que va dentro del QR.
-- ---------------------------------------------------------------------
create type public.ticket_status as enum ('valid', 'used', 'cancelled');

create table public.tickets (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique
                   default upper(substr(md5(gen_random_uuid()::text), 1, 16)),
  order_id       uuid not null references public.orders (id) on delete cascade,
  event_id       uuid not null references public.events (id) on delete cascade,
  ticket_type_id uuid not null references public.ticket_types (id) on delete restrict,
  attendee_name  text not null,
  status         public.ticket_status not null default 'valid',
  used_at        timestamptz,
  validated_by   uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now()
);

create index tickets_event_idx on public.tickets (event_id);
create index tickets_type_idx  on public.tickets (ticket_type_id);
create index tickets_order_idx on public.tickets (order_id);

-- =====================================================================
-- RLS
-- =====================================================================
alter table public.admins           enable row level security;
alter table public.ticket_templates enable row level security;
alter table public.events           enable row level security;
alter table public.ticket_types     enable row level security;
alter table public.orders           enable row level security;
alter table public.tickets          enable row level security;

-- admins: cada uno ve su propia fila; el alta se hace desde el panel de Supabase
create policy "admins: ver la propia fila"
  on public.admins for select
  using (user_id = auth.uid());

-- plantillas: solo administradores
create policy "plantillas: admin"
  on public.ticket_templates for all
  using (public.is_admin())
  with check (public.is_admin());

-- eventos: lectura pública de publicados, gestión admin
create policy "eventos: lectura pública"
  on public.events for select
  using (published or public.is_admin());

create policy "eventos: admin inserta"
  on public.events for insert
  with check (public.is_admin());

create policy "eventos: admin actualiza"
  on public.events for update
  using (public.is_admin())
  with check (public.is_admin());

create policy "eventos: admin borra"
  on public.events for delete
  using (public.is_admin());

-- tipos de entrada: lectura pública si el evento está publicado
create policy "tipos: lectura pública"
  on public.ticket_types for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.events e
      where e.id = ticket_types.event_id and e.published
    )
  );

create policy "tipos: admin inserta"
  on public.ticket_types for insert
  with check (public.is_admin());

create policy "tipos: admin actualiza"
  on public.ticket_types for update
  using (public.is_admin())
  with check (public.is_admin());

create policy "tipos: admin borra"
  on public.ticket_types for delete
  using (public.is_admin());

-- pedidos y entradas: solo admin por acceso directo.
-- Los clientes compran y consultan mediante las funciones de abajo.
create policy "pedidos: admin"
  on public.orders for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "entradas: admin"
  on public.tickets for all
  using (public.is_admin())
  with check (public.is_admin());

-- =====================================================================
-- Funciones (RPC)
-- =====================================================================

-- ---------------------------------------------------------------------
-- Compra de entradas sin registro. Atómica: bloquea el tipo de entrada
-- para que dos compras simultáneas no superen el aforo.
-- p_items: [{ "ticket_type_id": "...", "quantity": 2 }, ...]
-- Devuelve el access_token del pedido.
-- ---------------------------------------------------------------------
create or replace function public.purchase_tickets(
  p_event_id    uuid,
  p_buyer_name  text,
  p_buyer_email text,
  p_items       jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event    public.events%rowtype;
  v_type     public.ticket_types%rowtype;
  v_item     jsonb;
  v_qty      integer;
  v_sold     integer;
  v_total    integer := 0;
  v_order_id uuid;
  v_token    uuid;
begin
  if coalesce(trim(p_buyer_name), '') = ''
     or char_length(p_buyer_name) > 120
     or p_buyer_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Nombre o email no válidos';
  end if;

  select * into v_event from public.events where id = p_event_id and published;
  if not found then
    raise exception 'El evento no está disponible';
  end if;

  if coalesce(v_event.ends_at, v_event.starts_at) < now() then
    raise exception 'El evento ya ha terminado';
  end if;

  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Selección de entradas no válida';
  end if;

  insert into public.orders (event_id, buyer_name, buyer_email)
  values (p_event_id, trim(p_buyer_name), lower(trim(p_buyer_email)))
  returning id, access_token into v_order_id, v_token;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := coalesce((v_item ->> 'quantity')::integer, 0);
    continue when v_qty <= 0;

    select * into v_type
    from public.ticket_types
    where id = (v_item ->> 'ticket_type_id')::uuid
      and event_id = p_event_id
    for update;

    if not found then
      raise exception 'Tipo de entrada no válido';
    end if;

    if not v_type.sales_open then
      raise exception 'La venta de "%" está cerrada', v_type.name;
    end if;

    if v_qty > v_type.max_per_order then
      raise exception 'Máximo % entradas de "%" por pedido', v_type.max_per_order, v_type.name;
    end if;

    if v_type.capacity is not null then
      select count(*) into v_sold
      from public.tickets
      where ticket_type_id = v_type.id and status <> 'cancelled';

      if v_sold + v_qty > v_type.capacity then
        raise exception 'No quedan suficientes entradas de "%" (disponibles: %)',
          v_type.name, greatest(v_type.capacity - v_sold, 0);
      end if;
    end if;

    insert into public.tickets (order_id, event_id, ticket_type_id, attendee_name)
    select v_order_id, p_event_id, v_type.id, trim(p_buyer_name)
    from generate_series(1, v_qty);

    v_total := v_total + v_qty;
  end loop;

  if v_total = 0 then
    raise exception 'Selecciona al menos una entrada';
  end if;

  return v_token;
end;
$$;

-- ---------------------------------------------------------------------
-- Consulta pública de un pedido por su token (lo que ve el cliente).
-- ---------------------------------------------------------------------
create or replace function public.get_order(p_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'buyer_name',  o.buyer_name,
    'buyer_email', o.buyer_email,
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

-- ---------------------------------------------------------------------
-- Entradas vendidas / usadas por tipo (para mostrar disponibilidad).
-- ---------------------------------------------------------------------
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
    and (e.published or public.is_admin())
  group by tt.id;
$$;

-- ---------------------------------------------------------------------
-- Validación de una entrada (solo administradores). Atómica: dos lectores
-- que escaneen la misma entrada a la vez no la dan por buena dos veces.
-- result: valid | already_used | not_found | cancelled | wrong_event
-- ---------------------------------------------------------------------
create or replace function public.validate_ticket(
  p_code     text,
  p_event_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^0-9A-Fa-f]', '', 'g'));
  v_t    record;
  v_info jsonb;
begin
  if not public.is_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  select t.id, t.code, t.status, t.used_at, t.attendee_name, t.event_id,
         e.title as event_title, e.starts_at, tt.name as type_name
    into v_t
  from public.tickets t
  join public.events e on e.id = t.event_id
  join public.ticket_types tt on tt.id = t.ticket_type_id
  where t.code = v_code
  for update of t;

  if not found then
    return jsonb_build_object('result', 'not_found', 'code', v_code);
  end if;

  v_info := jsonb_build_object(
    'code',          v_t.code,
    'attendee_name', v_t.attendee_name,
    'event_title',   v_t.event_title,
    'starts_at',     v_t.starts_at,
    'type_name',     v_t.type_name,
    'used_at',       v_t.used_at
  );

  if p_event_id is not null and v_t.event_id <> p_event_id then
    return v_info || jsonb_build_object('result', 'wrong_event');
  end if;

  if v_t.status = 'cancelled' then
    return v_info || jsonb_build_object('result', 'cancelled');
  end if;

  if v_t.status = 'used' then
    return v_info || jsonb_build_object('result', 'already_used');
  end if;

  update public.tickets
     set status = 'used', used_at = now(), validated_by = auth.uid()
   where id = v_t.id;

  return v_info || jsonb_build_object('result', 'valid', 'used_at', now());
end;
$$;

-- Permisos de ejecución
revoke execute on function public.purchase_tickets(uuid, text, text, jsonb) from public;
revoke execute on function public.get_order(uuid) from public;
revoke execute on function public.event_ticket_stats(uuid) from public;
revoke execute on function public.validate_ticket(text, uuid) from public, anon;

grant execute on function public.purchase_tickets(uuid, text, text, jsonb) to anon, authenticated;
grant execute on function public.get_order(uuid) to anon, authenticated;
grant execute on function public.event_ticket_stats(uuid) to anon, authenticated;
grant execute on function public.validate_ticket(text, uuid) to authenticated;

-- =====================================================================
-- Plantilla de ejemplo
-- =====================================================================
insert into public.ticket_templates (name, design, description_template)
values (
  'Clásica',
  '{
    "layout": "horizontal",
    "font": "sans",
    "backgroundColor": "#111827",
    "textColor": "#F9FAFB",
    "accentColor": "#F59E0B",
    "backgroundImageUrl": "",
    "logoUrl": "",
    "overlayOpacity": 40,
    "radius": 16,
    "headline": "ENTRADA",
    "footerText": "Presenta este QR en la puerta. Entrada personal e intransferible.",
    "showDate": true,
    "showVenue": true,
    "showPrice": true,
    "showAttendee": true,
    "showCode": true
  }'::jsonb,
  E'{{tipo}} · {{evento}}\nApertura de puertas 30 minutos antes. ¡Te esperamos, {{asistente}}!'
);
