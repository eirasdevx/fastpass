-- Capacidad para picos de público (p. ej. 1.000 personas al abrir las reservas).
-- Aplicar después de 0016. Se puede ejecutar más de una vez.
--
-- 1) Límite anti-abuso por evento: era de 100 intentos por minuto para todo el evento; al abrir
--    las reservas de un evento grande, a partir de la persona 101 todos recibían «Demasiados
--    intentos». Se sube a 3.000 por minuto. El límite por correo (5 por hora) no cambia.
-- 2) Sala de espera virtual (opcional por evento, como la de Renfe): si hay más gente que
--    plazas en el formulario, cada persona espera su turno viendo cuántas tiene delante.
--    Quien entra tiene 15 minutos para completar la reserva. La base de datos exige el pase
--    de turno, así que no se puede saltar la cola llamando directamente a la API.
-- El aforo y los cupos se siguen comprobando de forma atómica: nada de esto permite vender de más.
begin;

-- --- 1) Límite por evento ----------------------------------------------------------------------

create or replace function private.registration_attempt(p_bucket text,p_limit integer,p_seconds integer) returns boolean
language plpgsql security definer set search_path='' as $$
declare n integer; v_limit integer := p_limit;
begin
  -- 'reserve:<evento>' (reservas) y 'event:<evento>' (inscripciones) son los cubos de todo el evento.
  if p_bucket like 'reserve:%' or p_bucket like 'event:%' then v_limit := greatest(p_limit, 3000); end if;
  insert into private.registration_limits values(p_bucket,clock_timestamp(),1)
  on conflict(bucket) do update set
    attempts=case when registration_limits.window_start < clock_timestamp()-make_interval(secs=>p_seconds) then 1 else registration_limits.attempts+1 end,
    window_start=case when registration_limits.window_start < clock_timestamp()-make_interval(secs=>p_seconds) then clock_timestamp() else registration_limits.window_start end
  returning attempts into n;
  return n<=v_limit;
end;
$$;

-- --- 2) Sala de espera ----------------------------------------------------------------------------

alter table public.events
  add column if not exists queue_enabled boolean not null default false,
  -- Cuántas personas pueden estar rellenando el formulario a la vez.
  add column if not exists queue_capacity integer not null default 100 check (queue_capacity between 1 and 10000);

-- Un puesto por visitante. Solo se guarda la huella del token, como en las reservas.
create table if not exists private.queue_entries (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  admitted_at timestamptz,
  done_at timestamptz
);
create index if not exists queue_waiting on private.queue_entries(event_id, id) where admitted_at is null;
create index if not exists queue_active on private.queue_entries(event_id, admitted_at) where admitted_at is not null and done_at is null;

-- Pide sitio o consulta el turno (la página lo llama cada pocos segundos).
-- Quien deja de consultar más de 45 s no cuenta como «delante de ti» ni recibe turno hasta que vuelve.
create or replace function public.queue_status(p_event uuid, p_token text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare ev public.events%rowtype; q private.queue_entries%rowtype; token text := p_token; v_hash text;
  active integer; ahead integer; served numeric;
begin
  select * into ev from public.events where id = p_event and published and registration_mode = 'pickup';
  if not found then return jsonb_build_object('error','EVENT_UNAVAILABLE'); end if;
  if not ev.queue_enabled then return jsonb_build_object('status','open'); end if;

  -- Turnos de un evento en orden estricto: una sola sesión reparte a la vez.
  perform pg_advisory_xact_lock(hashtextextended('queue:' || p_event::text, 0));
  if token ~ '^[a-f0-9]{64}$' then
    v_hash := encode(sha256(convert_to(token, 'UTF8')), 'hex');
    select * into q from private.queue_entries where token_hash = v_hash and event_id = p_event;
  end if;
  -- Sin puesto, o con uno usado o caducado: al final de la cola.
  if q.id is null or q.done_at is not null or (q.admitted_at is not null and q.admitted_at <= now() - interval '15 minutes') then
    if not private.registration_attempt('queue:' || p_event::text, 20000, 60) then return jsonb_build_object('error','RATE_LIMITED'); end if;
    token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
    insert into private.queue_entries(event_id, token_hash) values (p_event, encode(sha256(convert_to(token, 'UTF8')), 'hex')) returning * into q;
  else
    update private.queue_entries set last_seen_at = now() where id = q.id;
  end if;

  -- Dar turno a los siguientes mientras haya hueco en el formulario.
  select count(*) into active from private.queue_entries
    where event_id = p_event and admitted_at > now() - interval '15 minutes' and done_at is null;
  if active < ev.queue_capacity then
    update private.queue_entries set admitted_at = now() where id in (
      select id from private.queue_entries
      where event_id = p_event and admitted_at is null and (last_seen_at > now() - interval '45 seconds' or id = q.id)
      order by id limit ev.queue_capacity - active);
    select * into q from private.queue_entries where id = q.id;
  end if;

  if q.admitted_at is not null then
    return jsonb_build_object('status','admitted','token',token,'expires_at',q.admitted_at + interval '15 minutes');
  end if;
  select count(*) into ahead from private.queue_entries
    where event_id = p_event and admitted_at is null and id < q.id and last_seen_at > now() - interval '45 seconds';
  -- Ritmo real de los últimos 5 minutos (turnos que terminan o caducan); sin datos, una tanda cada 15 min.
  select count(*) / 5.0 into served from private.queue_entries
    where event_id = p_event and (done_at > now() - interval '5 minutes'
      or (done_at is null and admitted_at between now() - interval '20 minutes' and now() - interval '15 minutes'));
  return jsonb_build_object('status','waiting','token',token,'ahead',ahead,
    'eta_minutes', ceil((ahead + 1) / greatest(served, ev.queue_capacity / 15.0)));
end;
$$;

-- Las reservas públicas de un evento con sala de espera necesitan un pase vigente.
-- Lo aporta public.reserve_with_pass (más abajo) solo durante su propia transacción.
create or replace function private.require_queue_pass() returns trigger
language plpgsql security definer set search_path='' as $$
declare pass text := coalesce(current_setting('fastpass.queue_pass', true), '');
begin
  if new.source <> 'public' or not exists(select 1 from public.events where id = new.event_id and queue_enabled) then return new; end if;
  update private.queue_entries set done_at = now()
  where event_id = new.event_id and token_hash = encode(sha256(convert_to(pass, 'UTF8')), 'hex')
    and admitted_at > now() - interval '15 minutes' and done_at is null;
  if not found then raise exception 'QUEUE_REQUIRED'; end if;
  return new;
end;
$$;
drop trigger if exists require_queue_pass on public.reservations;
create trigger require_queue_pass before insert on public.reservations for each row execute function private.require_queue_pass();

create or replace function public.reserve_with_pass(p_pass text, p_event uuid, p_type uuid, p_quantity integer, p_first text, p_last text,
  p_email text, p_phone text default '', p_consent boolean default false, p_attendees jsonb default '[]'::jsonb)
returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  -- Local a esta transacción: no se puede fijar desde fuera de la API.
  perform set_config('fastpass.queue_pass', coalesce(p_pass, ''), true);
  return public.reserve_bonocopas(p_event, p_type, p_quantity, p_first, p_last, p_email, p_phone, p_consent, false, '', p_attendees);
end;
$$;

-- --- Permisos -------------------------------------------------------------------------------------
revoke all on function private.registration_attempt(text,integer,integer), private.require_queue_pass() from public,anon,authenticated;
revoke all on private.queue_entries from public,anon,authenticated;
revoke all on function public.queue_status(uuid,text),
  public.reserve_with_pass(text,uuid,uuid,integer,text,text,text,text,boolean,jsonb) from public,anon,authenticated;
grant execute on function public.queue_status(uuid,text),
  public.reserve_with_pass(text,uuid,uuid,integer,text,text,text,text,boolean,jsonb) to anon,authenticated;
commit;
