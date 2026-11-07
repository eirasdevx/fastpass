-- Asistentes de un evento con reserva y recogida: una fila por persona de cada reserva (o el titular,
-- con sus plazas, si el evento no pide datos de cada persona). La entrada es lo físico que se recoge;
-- este listado dice quién va a asistir y en qué estado está su reserva. Aplicar después de 0012.
begin;

create function public.list_reservation_people(p_event uuid, p_query text default '', p_status text default '',
  p_type uuid default null, p_page integer default 1, p_size integer default 25, p_ascending boolean default false) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb; q text := lower(trim(coalesce(p_query, '')));
begin
  if not public.can_manage_event(p_event) then raise exception 'FORBIDDEN'; end if;
  if p_page is null or p_page < 1 or p_page > 100000 or p_size is null or p_size not between 1 and 500
    or length(q) > 120 or coalesce(p_status, '') not in ('','pending_pickup','partially_picked_up','completed','cancelled','expired') then raise exception 'INVALID_INPUT'; end if;
  with res as (
    select r.id, r.code, r.first_name, r.last_name, r.email, r.phone, r.quantity, r.delivered_quantity, r.created_at,
      r.ticket_type_id as type_id, tt.name as type_name, private.reservation_status(r.status, e.pickup_deadline) as status
    from public.reservations r join public.events e on e.id = r.event_id join public.ticket_types tt on tt.id = r.ticket_type_id
    where r.event_id = p_event
  ), rows as (
    select res.id as reservation_id, a.position, trim(a.first_name || ' ' || a.last_name) as name, a.document_id, a.birth_date,
      1 as places, res.code, res.email, res.phone, res.type_id, res.type_name, res.quantity, res.delivered_quantity, res.status, res.created_at
    from res join public.reservation_attendees a on a.reservation_id = res.id
    union all
    select res.id, 1, trim(res.first_name || ' ' || res.last_name), null, null,
      res.quantity, res.code, res.email, res.phone, res.type_id, res.type_name, res.quantity, res.delivered_quantity, res.status, res.created_at
    from res where not exists(select 1 from public.reservation_attendees a where a.reservation_id = res.id)
  ), filtered as (
    select * from rows where (coalesce(p_status, '') = '' or status = p_status) and (p_type is null or type_id = p_type)
      and (q = '' or position(q in lower(name)) > 0 or position(q in email) > 0 or code = upper(q) or lower(document_id) = q)
  ), page as (
    select * from filtered order by case when p_ascending then created_at end asc, case when not p_ascending then created_at end desc,
      reservation_id, position
    limit p_size offset (p_page - 1) * p_size
  ) select jsonb_build_object('total', (select count(*) from filtered),
      'places', (select coalesce(sum(places), 0) from filtered),
      'rows', coalesce((select jsonb_agg(to_jsonb(page)) from page), '[]'::jsonb)) into result;
  return result;
end;
$$;

revoke all on function public.list_reservation_people(uuid, text, text, uuid, integer, integer, boolean) from public, anon, authenticated;
grant execute on function public.list_reservation_people(uuid, text, text, uuid, integer, integer, boolean) to authenticated;
commit;
