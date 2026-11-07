-- Borrado de datos personales (RGPD). Aplicar después de 0011. No es idempotente: ejecutar una sola vez.
-- · Por evento: al cumplirse el plazo de conservación (retention_days tras el fin del evento) se borran
--   nombres, correos, teléfonos, observaciones, DNI y fechas de nacimiento. Se conservan cantidades,
--   importes y entregas, que no identifican a nadie y sirven para cuadrar las cuentas.
-- · Por reserva: «Suprimir datos» atiende una solicitud concreta en cualquier momento.
-- El borrado automático diario se programa aparte con pg_cron (ver docs/RESERVAS.md).
begin;

alter table public.events add column personal_data_purged_at timestamptz;
alter table public.reservations add column personal_data_removed_at timestamptz;

-- Anonimiza una reserva: sin datos de contacto ni personas, enlace revocado y, si seguía activa, anulada.
create function private.redact_reservation_row(p_reservation uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.reservation_attendees where reservation_id = p_reservation;
  update public.reservations set first_name = 'Datos suprimidos', last_name = '', email = id::text || '@deleted.invalid',
    phone = '', notes = '', token_hash = encode(sha256(convert_to(gen_random_uuid()::text, 'UTF8')), 'hex'),
    status = case when status in ('pending_pickup','partially_picked_up') then 'cancelled' else status end,
    cancelled_at = case when status in ('pending_pickup','partially_picked_up') then now() else cancelled_at end,
    personal_data_removed_at = now()
  where id = p_reservation and personal_data_removed_at is null;
end;
$$;

-- Borra los datos personales de un evento: reservas e inscripciones/entradas. No cambia el estado
-- de las entradas para que las estadísticas de asistencia se mantengan.
create function private.purge_event(p_event uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r uuid;
begin
  perform 1 from public.events where id = p_event for update;
  for r in select id from public.reservations where event_id = p_event and personal_data_removed_at is null loop
    perform private.redact_reservation_row(r);
  end loop;
  delete from private.entry_links where registration_id in (select id from public.registrations where event_id = p_event)
    or ticket_id in (select id from public.tickets where event_id = p_event);
  update public.registrations set notes = '' where event_id = p_event and notes <> '';
  update public.attendees set first_name = 'Datos suprimidos', last_name = '', email = id::text || '@deleted.invalid', phone = ''
    where event_id = p_event and email not like '%@deleted.invalid';
  update public.orders set buyer_name = 'Datos suprimidos', buyer_email = id::text || '@deleted.invalid', access_token = gen_random_uuid()
    where event_id = p_event and buyer_email not like '%@deleted.invalid';
  update public.tickets set attendee_name = 'Datos suprimidos' where event_id = p_event and attendee_name <> 'Datos suprimidos';
  update public.events set personal_data_purged_at = now() where id = p_event;
  perform private.audit('privacy', 'event_purged', p_event);
end;
$$;

-- Fecha a partir de la cual se borran los datos de un evento.
create function private.purge_due_at(ev public.events) returns timestamptz
language sql immutable set search_path = '' as $$
  select coalesce(ev.ends_at, ev.starts_at) + make_interval(days => ev.retention_days);
$$;

-- Panel: borrar ya los datos de un evento terminado (sin esperar al plazo).
create function public.purge_event_personal_data(p_event uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare ev public.events%rowtype;
begin
  select * into ev from public.events where id = p_event;
  if not found or not public.can_manage_event(p_event) then return jsonb_build_object('error', 'FORBIDDEN'); end if;
  if coalesce(ev.ends_at, ev.starts_at) > now() then return jsonb_build_object('error', 'EVENT_NOT_FINISHED'); end if;
  perform private.purge_event(p_event);
  return jsonb_build_object('purged_at', now());
end;
$$;

-- Panel: atender una solicitud de supresión de una sola reserva.
create function public.redact_reservation(p_reservation uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.reservations%rowtype;
begin
  select * into r from public.reservations where id = p_reservation;
  if not found or not public.can_manage_event(r.event_id) then return jsonb_build_object('error', 'FORBIDDEN'); end if;
  perform 1 from public.events where id = r.event_id for update;
  perform private.redact_reservation_row(r.id);
  perform private.audit('privacy', 'reservation_redacted', r.event_id);
  return jsonb_build_object('success', true);
end;
$$;

-- Tarea diaria (pg_cron): borra los eventos con el plazo cumplido y limpia los contadores de intentos.
create function private.purge_expired_personal_data() returns integer
language plpgsql security definer set search_path = '' as $$
declare ev public.events%rowtype; n integer := 0;
begin
  for ev in select * from public.events where personal_data_purged_at is null order by starts_at loop
    if private.purge_due_at(ev) <= now() then
      -- Un evento que falle no impide borrar los demás; queda anotado y se reintenta al día siguiente.
      begin perform private.purge_event(ev.id); n := n + 1;
      exception when others then perform private.audit('privacy', 'event_purge_failed', ev.id); end;
    end if;
  end loop;
  delete from private.registration_limits where window_start < now() - interval '1 day';
  delete from private.scan_limits where window_start < now() - interval '1 day';
  return n;
end;
$$;

-- Un enlace nuevo no tiene sentido en una reserva sin datos.
create or replace function public.rotate_reservation_link(p_reservation uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare r public.reservations%rowtype; token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  select * into r from public.reservations where id = p_reservation;
  if not found or not public.can_manage_event(r.event_id) then raise exception 'FORBIDDEN'; end if;
  if r.personal_data_removed_at is not null then raise exception 'INVALID_TRANSITION'; end if;
  update public.reservations set token_hash = encode(sha256(convert_to(token, 'UTF8')), 'hex') where id = r.id;
  perform private.audit('reservation', 'link_rotated', r.event_id);
  return token;
end;
$$;

-- Detalle: igual que en 0011 más la fecha de supresión de datos.
create or replace function public.reservation_detail(p_reservation uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r public.reservations%rowtype;
begin
  select * into r from public.reservations where id = p_reservation;
  if not found or not public.can_manage_event(r.event_id) then raise exception 'FORBIDDEN'; end if;
  return private.reservation_summary(r.id) || jsonb_build_object(
    'id', r.id, 'event_id', r.event_id, 'email', r.email, 'phone', r.phone, 'notes', r.notes, 'source', r.source,
    'cancelled_at', r.cancelled_at, 'privacy_accepted_at', r.privacy_accepted_at, 'personal_data_removed_at', r.personal_data_removed_at,
    'attendees', coalesce((select jsonb_agg(jsonb_build_object('position', a.position, 'first_name', a.first_name,
        'last_name', a.last_name, 'document_id', a.document_id, 'birth_date', a.birth_date) order by a.position)
      from public.reservation_attendees a where a.reservation_id = r.id), '[]'::jsonb),
    'pickups', coalesce((select jsonb_agg(jsonb_build_object('quantity', p.quantity, 'amount', p.amount,
        'payment_method', p.payment_method, 'created_at', p.created_at, 'admin_email', u.email) order by p.created_at)
      from public.reservation_pickups p left join auth.users u on u.id = p.admin_id where p.reservation_id = r.id), '[]'::jsonb));
end;
$$;

revoke all on function private.redact_reservation_row(uuid), private.purge_event(uuid), private.purge_due_at(public.events),
  private.purge_expired_personal_data() from public, anon, authenticated;
revoke all on function public.purge_event_personal_data(uuid), public.redact_reservation(uuid) from public, anon, authenticated;
grant execute on function public.purge_event_personal_data(uuid), public.redact_reservation(uuid) to authenticated;
commit;
