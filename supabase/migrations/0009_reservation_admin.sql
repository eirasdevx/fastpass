-- Panel de reservas: listado, detalle y nuevo enlace del justificante. Aplicar después de 0008.
-- Se puede repetir sin riesgo. Solo para quien gestiona el evento (no para personal de puerta).
begin;

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
      r.source, r.created_at
    from public.reservations r join public.events e on e.id = r.event_id join public.ticket_types tt on tt.id = r.ticket_type_id
    where r.event_id = p_event
  ), filtered as (
    select * from rows where (coalesce(p_status, '') = '' or status = p_status) and (p_type is null or type_id = p_type)
      and (q = '' or position(q in lower(name)) > 0 or position(q in email) > 0 or code = upper(q))
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
    'pickups', coalesce((select jsonb_agg(jsonb_build_object('quantity', p.quantity, 'amount', p.amount,
        'payment_method', p.payment_method, 'created_at', p.created_at, 'admin_email', u.email) order by p.created_at)
      from public.reservation_pickups p left join auth.users u on u.id = p.admin_id where p.reservation_id = r.id), '[]'::jsonb));
end;
$$;

-- Nuevo enlace/QR del justificante (p. ej. si el titular lo pierde). El anterior deja de funcionar.
create or replace function public.rotate_reservation_link(p_reservation uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare r public.reservations%rowtype; token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  select * into r from public.reservations where id = p_reservation;
  if not found or not public.can_manage_event(r.event_id) then raise exception 'FORBIDDEN'; end if;
  update public.reservations set token_hash = encode(sha256(convert_to(token, 'UTF8')), 'hex') where id = r.id;
  perform private.audit('reservation', 'link_rotated', r.event_id);
  return token;
end;
$$;

revoke all on function public.list_reservations(uuid, text, text, uuid, integer, integer, boolean),
  public.reservation_detail(uuid), public.rotate_reservation_link(uuid) from public, anon, authenticated;
grant execute on function public.list_reservations(uuid, text, text, uuid, integer, integer, boolean),
  public.reservation_detail(uuid), public.rotate_reservation_link(uuid) to authenticated;
commit;
