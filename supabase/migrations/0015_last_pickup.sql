-- Fecha de la última entrega en el resumen de la reserva, para que Accesos avise
-- «ya se ha escaneado antes» con la hora. Aplicar después de 0014. Se puede ejecutar más de una vez.
begin;

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
    'design', (select tpl.design from public.ticket_templates tpl where tpl.id = tt.template_id),
    -- Última entrega: en Accesos sirve para avisar de que ya se escaneó y recogió antes.
    'last_pickup_at', (select max(p.created_at) from public.reservation_pickups p where p.reservation_id = r.id))
  from public.reservations r
  join public.events e on e.id = r.event_id
  join public.ticket_types tt on tt.id = r.ticket_type_id
  cross join lateral (select private.reservation_status(r.status, e.pickup_deadline) as status) s
  where r.id = p_reservation;
$$;

revoke all on function private.reservation_summary(uuid) from public, anon, authenticated;
commit;
