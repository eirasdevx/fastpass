-- Nombre configurable de lo que se recoge en la modalidad 'pickup' (bonocopas, pulseras,
-- entradas físicas…), para que la plataforma sirva para otros eventos. Aplicar después de 0009.
-- Se puede repetir sin riesgo.
begin;

alter table public.events add column if not exists pickup_item_name text not null default 'bonocopas'
  check (char_length(btrim(pickup_item_name)) between 1 and 40);

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
    'pickup_address', e.pickup_address, 'pickup_instructions', e.pickup_instructions, 'item_name', e.pickup_item_name)
  from public.reservations r
  join public.events e on e.id = r.event_id
  join public.ticket_types tt on tt.id = r.ticket_type_id
  cross join lateral (select private.reservation_status(r.status, e.pickup_deadline) as status) s
  where r.id = p_reservation;
$$;
revoke all on function private.reservation_summary(uuid) from public, anon, authenticated;

commit;
