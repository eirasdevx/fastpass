-- Additive integration. Apply after 0003; legacy orders and QR remain valid.
begin;

alter table public.events
  add column status text not null default 'draft' check (status in ('draft','published','closed','live','finished','cancelled')),
  add column registration_enabled boolean not null default false,
  add column registration_mode text not null default 'manual' check (registration_mode in ('manual','automatic','payment')),
  add column phone_required boolean not null default false,
  add column last_name_required boolean not null default true,
  add column prevent_duplicates boolean not null default true,
  add column privacy_controller text not null default '' check (length(privacy_controller) <= 300),
  add column privacy_contact text not null default '' check (length(privacy_contact) <= 254),
  add column retention_days integer not null default 90 check (retention_days between 1 and 3650);
update public.events set status = case when published then 'published' else 'draft' end;

create function private.sync_event_status() returns trigger
language plpgsql set search_path='' as $$
begin
  if TG_OP='INSERT' then
    if new.status='draft' and new.published then new.status:='published'; end if;
  elsif new.status is not distinct from old.status and new.published is distinct from old.published then
    new.status:=case when new.published then 'published' else 'draft' end;
  end if;
  new.published:=new.status<>'draft';
  return new;
end;
$$;
create trigger aa_event_status before insert or update on public.events for each row execute function private.sync_event_status();

create table public.attendees (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  first_name text not null check (length(first_name) between 1 and 60),
  last_name text not null check (length(last_name) <= 60),
  email text not null check (length(email) <= 254 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone text not null default '' check (length(phone) <= 30),
  created_at timestamptz not null default now(),
  unique(id,event_id)
);
create index attendees_event_email on public.attendees(event_id,email);
create table public.registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  attendee_id uuid not null,
  ticket_type_id uuid not null references public.ticket_types(id),
  status text not null default 'pending' check (status in ('pending','approved','cancelled')),
  source text not null check (source in ('public','manual')),
  notes text not null default '' check (length(notes) <= 2000),
  privacy_accepted_at timestamptz,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  foreign key(attendee_id,event_id) references public.attendees(id,event_id) on delete cascade,
  unique(attendee_id,event_id)
);
create index registrations_event_created on public.registrations(event_id,created_at desc,id);
create index registrations_event_pending on public.registrations(event_id,ticket_type_id) where status='pending';
alter table public.tickets add column short_code text check (short_code ~ '^[A-Z0-9]{4}$'),
  add column registration_id uuid unique references public.registrations(id) on delete cascade;
create unique index tickets_event_short_code on public.tickets(event_id,short_code);
create index tickets_event_status_created on public.tickets(event_id,status,created_at desc,id);

create table private.entry_links (
  token_hash text primary key,
  registration_id uuid unique references public.registrations(id) on delete cascade,
  ticket_id uuid unique references public.tickets(id) on delete cascade,
  check (registration_id is not null or ticket_id is not null)
);
create table public.access_logs (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events(id) on delete cascade,
  ticket_id uuid references public.tickets(id) on delete set null,
  admin_id uuid references auth.users(id) on delete set null,
  attempted_code text check (attempted_code ~ '^[A-Z0-9]{4}$'),
  result text not null,
  created_at timestamptz not null default now()
);
create index access_logs_event_created on public.access_logs(event_id,created_at desc,id);
alter table public.attendees enable row level security;
alter table public.registrations enable row level security;
alter table public.access_logs enable row level security;
create policy attendee_read on public.attendees for select using (public.can_manage_event(event_id));
create policy registration_read on public.registrations for select using (public.can_manage_event(event_id));
create policy access_log_read on public.access_logs for select using (public.can_manage_event(event_id));
revoke all on public.attendees,public.registrations,public.access_logs from anon,authenticated;
grant select on public.attendees,public.registrations,public.access_logs to authenticated;

create function private.assign_short_code() returns trigger
language plpgsql security definer set search_path='' as $$
declare candidate text; n integer; alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
begin
  -- 32 symbols, 20 random bits; UUID prefix excludes version/variant bits.
  if TG_OP='UPDATE' and new.short_code is distinct from old.short_code then raise exception 'IMMUTABLE_TICKET'; end if;
  if new.short_code is not null then return new; end if;
  perform 1 from public.events where id=new.event_id for update;
  if (select count(*) from public.tickets where event_id=new.event_id) >= 1048576 then raise exception 'CODE_SPACE_EXHAUSTED'; end if;
  for attempt in 1..128 loop
    n := ('x'||substr(replace(gen_random_uuid()::text,'-',''),1,5))::bit(20)::integer;
    candidate := '';
    for pos in 1..4 loop
      candidate := candidate || substr(alphabet,(n % 32)+1,1); n := n / 32;
    end loop;
    if not exists(select 1 from public.tickets where event_id=new.event_id and short_code=candidate) then
      new.short_code := candidate; return new;
    end if;
  end loop;
  raise exception 'CODE_RETRY_EXHAUSTED';
end;
$$;
create trigger aa_short_code before insert or update on public.tickets for each row execute function private.assign_short_code();
-- Do not alter historical validator/timestamps during backfill.
alter table public.tickets disable trigger guard_ticket;
update public.tickets set short_code=null;
alter table public.tickets enable trigger guard_ticket;
alter table public.tickets alter column short_code set not null;

-- Pending applications reserve capacity. All issuing paths share the event lock.
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
      + (select count(*) from public.registrations where event_id=new.event_id and status='pending') into n;
    if ev.capacity is not null and n>=ev.capacity then raise exception 'SOLD_OUT'; end if;
    select (select count(*) from public.tickets where ticket_type_id=new.ticket_type_id and status<>'cancelled' and id<>new.id)
      + (select count(*) from public.registrations where ticket_type_id=new.ticket_type_id and status='pending') into n;
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
    (select count(*) from public.registrations where event_id=new.id and status='pending') then raise exception 'CAPACITY_BELOW_SOLD'; end if;
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
    (select count(*) from public.registrations where ticket_type_id=new.id and status='pending') then raise exception 'CAPACITY_BELOW_SOLD'; end if;
  return new;
end;
$$;

create function private.registration_link(p_registration uuid, p_ticket uuid default null) returns text
language plpgsql security definer set search_path='' as $$
declare token text := replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
begin
  delete from private.entry_links where (p_registration is not null and registration_id=p_registration) or (p_ticket is not null and ticket_id=p_ticket);
  insert into private.entry_links values(encode(sha256(convert_to(token,'UTF8')),'hex'),p_registration,p_ticket);
  return token;
end;
$$;
create function private.issue_registration(p_registration uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare r public.registrations%rowtype; a public.attendees%rowtype; o uuid; t uuid;
begin
  select * into r from public.registrations where id=p_registration;
  perform 1 from public.events where id=r.event_id for update;
  select * into r from public.registrations where id=p_registration for update;
  if r.status<>'pending' then raise exception 'INVALID_TRANSITION'; end if;
  if exists(select 1 from public.events where id=r.event_id and (status in ('cancelled','finished') or registration_mode='payment')) then raise exception 'EVENT_UNAVAILABLE'; end if;
  select * into a from public.attendees where id=r.attendee_id;
  update public.registrations set status='approved',approved_at=now() where id=r.id;
  insert into public.orders(event_id,buyer_name,buyer_email) values(r.event_id,trim(a.first_name||' '||a.last_name),a.email) returning id into o;
  insert into public.tickets(event_id,order_id,ticket_type_id,attendee_name,registration_id)
    values(r.event_id,o,r.ticket_type_id,trim(a.first_name||' '||a.last_name),r.id) returning id into t;
  update private.entry_links set ticket_id=t where registration_id=r.id;
  return t;
end;
$$;

create table private.registration_limits (
  bucket text primary key, window_start timestamptz not null, attempts integer not null
);
create function private.registration_attempt(p_bucket text,p_limit integer,p_seconds integer) returns boolean
language plpgsql security definer set search_path='' as $$
declare n integer;
begin
  insert into private.registration_limits values(p_bucket,clock_timestamp(),1)
  on conflict(bucket) do update set
    attempts=case when registration_limits.window_start < clock_timestamp()-make_interval(secs=>p_seconds) then 1 else registration_limits.attempts+1 end,
    window_start=case when registration_limits.window_start < clock_timestamp()-make_interval(secs=>p_seconds) then clock_timestamp() else registration_limits.window_start end
  returning attempts into n;
  return n<=p_limit;
end;
$$;

create function public.register_attendee(p_event uuid,p_type uuid,p_first text,p_last text,p_email text,
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
        or trim(ev.privacy_controller)='' or trim(ev.privacy_contact)='')) then raise exception 'EVENT_UNAVAILABLE'; end if;
    if (ev.last_name_required and trim(p_last)='') or (ev.phone_required and trim(p_phone)='') then raise exception 'INVALID_INPUT'; end if;
    select * into tt from public.ticket_types where id=p_type and event_id=p_event;
    if not found or (not p_manual and not tt.sales_open) then raise exception 'SALES_CLOSED'; end if;
    if ev.prevent_duplicates and exists(select 1 from public.registrations r join public.attendees a on a.id=r.attendee_id
      where r.event_id=p_event and r.status<>'cancelled' and a.email=lower(trim(p_email))) then raise exception 'DUPLICATE_REGISTRATION'; end if;
    select (select count(*) from public.tickets where event_id=p_event and status<>'cancelled')+
      (select count(*) from public.registrations where event_id=p_event and status='pending') into n;
    if ev.capacity is not null and n>=ev.capacity then raise exception 'SOLD_OUT'; end if;
    select (select count(*) from public.tickets where ticket_type_id=p_type and status<>'cancelled')+
      (select count(*) from public.registrations where ticket_type_id=p_type and status='pending') into n;
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

create function public.manage_registration(p_registration uuid,p_operation text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.registrations%rowtype; token text;
begin
  select * into r from public.registrations where id=p_registration;
  if not found or not public.can_manage_event(r.event_id) then raise exception 'FORBIDDEN'; end if;
  perform 1 from public.events where id=r.event_id for update;
  select * into r from public.registrations where id=p_registration for update;
  case p_operation
    when 'approve' then perform private.issue_registration(r.id);
    when 'cancel' then
      update public.registrations set status='cancelled' where id=r.id;
      update public.tickets set status='cancelled' where registration_id=r.id;
    when 'rotate' then token:=private.registration_link(r.id,(select id from public.tickets where registration_id=r.id));
    when 'revoke' then delete from private.entry_links where registration_id=r.id;
    else raise exception 'INVALID_INPUT';
  end case;
  perform private.audit('registration',p_operation,r.event_id);
  return jsonb_build_object('success',true,'token',token);
end;
$$;

create function public.edit_attendee(p_registration uuid,p_first text,p_last text,p_email text,p_phone text,p_notes text) returns void
language plpgsql security definer set search_path='' as $$
declare r public.registrations%rowtype;
begin
  select * into r from public.registrations where id=p_registration;
  if not found or not public.can_manage_event(r.event_id) then raise exception 'FORBIDDEN'; end if;
  perform 1 from public.events where id=r.event_id for update;
  if p_first is null or length(trim(p_first)) not between 1 and 60 or p_last is null or length(trim(p_last))>60
    or p_email is null or length(p_email)>254 or p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    or p_phone is null or length(p_phone)>30 or p_notes is null or length(p_notes)>2000 then raise exception 'INVALID_INPUT'; end if;
  if exists(select 1 from public.events where id=r.event_id and
      ((last_name_required and trim(p_last)='') or (phone_required and trim(p_phone)=''))) then raise exception 'INVALID_INPUT'; end if;
  if exists(select 1 from public.events where id=r.event_id and prevent_duplicates) and exists(
    select 1 from public.registrations x join public.attendees a on a.id=x.attendee_id
    where x.event_id=r.event_id and x.id<>r.id and x.status<>'cancelled' and a.email=lower(trim(p_email))) then raise exception 'DUPLICATE_REGISTRATION'; end if;
  update public.attendees set first_name=trim(p_first),last_name=trim(p_last),email=lower(trim(p_email)),phone=trim(p_phone) where id=r.attendee_id;
  update public.registrations set notes=p_notes where id=r.id;
  update public.tickets set attendee_name=trim(p_first||' '||p_last) where registration_id=r.id;
  update public.orders set buyer_name=trim(p_first||' '||p_last),buyer_email=lower(trim(p_email)) where id in(select order_id from public.tickets where registration_id=r.id);
  perform private.audit('attendee','edited',r.event_id);
end;
$$;

create function public.ticket_link(p_ticket uuid,p_revoke boolean default false) returns text
language plpgsql security definer set search_path='' as $$
declare t public.tickets%rowtype;
begin
  select * into t from public.tickets where id=p_ticket;
  if not found or not public.can_manage_event(t.event_id) then raise exception 'FORBIDDEN'; end if;
  perform 1 from public.events where id=t.event_id for update;
  if p_revoke then delete from private.entry_links where ticket_id=t.id; return null; end if;
  perform private.audit('ticket_link','rotated',t.event_id);
  return private.registration_link(t.registration_id,t.id);
end;
$$;

create function public.get_entry(p_token text) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('attendee_name',coalesce(t.attendee_name,trim(a.first_name||' '||a.last_name)),
    'status',case when e.status='cancelled' then 'cancelled' when t.id is not null then t.status::text when r.status='cancelled' then 'cancelled' else 'pending' end,
    'code',t.code,'short_code',t.short_code,'used_at',t.used_at,'event_title',e.title,'venue',e.venue,'starts_at',e.starts_at,
    'type_name',tt.name,'price',tt.price,'design',tpl.design,'description_template',tpl.description_template)
  from private.entry_links l
  left join public.registrations r on r.id=l.registration_id
  left join public.attendees a on a.id=r.attendee_id
  left join public.tickets t on t.id=l.ticket_id
  join public.events e on e.id=coalesce(t.event_id,r.event_id)
  join public.ticket_types tt on tt.id=coalesce(t.ticket_type_id,r.ticket_type_id)
  left join public.ticket_templates tpl on tpl.id=tt.template_id
  where p_token ~ '^[a-f0-9]{64}$' and l.token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
$$;

create function public.lookup_entry(p_event uuid,p_code text,p_confirm boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare t public.tickets%rowtype; v_code text; outcome text; info jsonb;
begin
  if not public.can_scan_event(p_event) then perform private.audit('scan','denied'); return jsonb_build_object('result','forbidden'); end if;
  if not private.allow_scan() then
    insert into public.access_logs(event_id,admin_id,result) values(p_event,auth.uid(),'rate_limited');
    return jsonb_build_object('result','rate_limited');
  end if;
  v_code:=upper(regexp_replace(coalesce(p_code,''),'[ -]','','g'));
  if length(p_code)>64 or (v_code !~ '^[A-Z0-9]{4}$' and v_code !~ '^([A-F0-9]{16}|[A-F0-9]{32})$') then v_code:=''; end if;
  -- Same lock ordering as all other issuing/cancellation paths.
  if p_confirm then perform 1 from public.events where id=p_event for update; end if;
  select * into t from public.tickets where event_id=p_event and (short_code=v_code or tickets.code=v_code);
  if not found then outcome:='not_found';
  elsif exists(select 1 from public.events where id=p_event and status in ('cancelled','finished','draft')) then outcome:='event_closed';
  elsif t.status='cancelled' then outcome:='cancelled';
  elsif t.status='used' then outcome:='already_used';
  elsif p_confirm then
    update public.tickets set status='used' where id=t.id and status='valid' returning * into t;
    outcome:='valid';
  else outcome:='ready'; end if;
  insert into public.access_logs(event_id,ticket_id,admin_id,attempted_code,result)
    values(p_event,t.id,auth.uid(),case when length(v_code)=4 then v_code else t.short_code end,outcome);
  info:=jsonb_build_object('result',outcome);
  if t.id is not null then info:=info||jsonb_build_object('code',t.short_code,'attendee_name',t.attendee_name,'used_at',t.used_at,
    'type_name',(select name from public.ticket_types where id=t.ticket_type_id)); end if;
  return info;
end;
$$;

create function public.event_dashboard(p_event uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('issued',count(t.id),'used',count(t.id) filter(where t.status='used'),
    'valid',count(t.id) filter(where t.status='valid'),'cancelled',count(t.id) filter(where t.status='cancelled'),
    'pending',(select count(*) from public.registrations where event_id=p_event and status='pending'), 'capacity',e.capacity)
  from public.events e left join public.tickets t on t.event_id=e.id
  where e.id=p_event and public.can_manage_event(p_event) group by e.id;
$$;

create function public.list_attendees(p_event uuid,p_query text default '',p_status text default '',p_type uuid default null,
  p_page integer default 1,p_size integer default 25,p_ascending boolean default false) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if not public.can_manage_event(p_event) then raise exception 'FORBIDDEN'; end if;
  if p_page is null or p_page<1 or p_page>100000 or p_size is null or p_size not between 1 and 500 or length(p_query)>120 then raise exception 'INVALID_INPUT'; end if;
  with rows as (
    select r.id as registration_id,t.id as ticket_id,a.first_name,a.last_name,a.email,a.phone,r.notes,
      coalesce(t.attendee_name,trim(a.first_name||' '||a.last_name)) as name,t.short_code as code,tt.name as type_name,tt.id as type_id,
      case when t.id is not null then t.status::text when r.status='cancelled' then 'cancelled' else 'pending' end as status,r.created_at,t.used_at
    from public.registrations r join public.attendees a on a.id=r.attendee_id
    join public.ticket_types tt on tt.id=r.ticket_type_id left join public.tickets t on t.registration_id=r.id where r.event_id=p_event
    union all
    select null,t.id,t.attendee_name,'',o.buyer_email,'','',t.attendee_name,t.short_code,tt.name,tt.id,t.status::text,t.created_at,t.used_at
    from public.tickets t join public.orders o on o.id=t.order_id join public.ticket_types tt on tt.id=t.ticket_type_id
    where t.event_id=p_event and t.registration_id is null
  ), filtered as (
    select * from rows where (p_status='' or status=p_status) and (p_type is null or type_id=p_type)
      and (p_query='' or position(lower(p_query) in lower(name))>0 or code=upper(p_query))
  ), page as (
    select * from filtered order by case when p_ascending then created_at end asc,case when not p_ascending then created_at end desc,
      coalesce(registration_id,ticket_id) limit p_size offset (p_page-1)*p_size
  ) select jsonb_build_object('total',(select count(*) from filtered),'rows',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'::jsonb)) into result;
  return result;
end;
$$;

create function public.global_dashboard() returns jsonb
language sql stable security definer set search_path='' as $$
  select case when public.is_admin() then jsonb_build_object(
    'issued',(select count(*) from public.tickets),
    'used',(select count(*) from public.tickets where status='used'),
    'valid',(select count(*) from public.tickets where status='valid'),
    'cancelled',(select count(*) from public.tickets where status='cancelled'),
    'pending',(select count(*) from public.registrations where status='pending'),
    'capacity',(select case when count(*)=count(capacity) then sum(capacity) end from public.events)) end;
$$;
revoke all on function public.global_dashboard() from public,anon,authenticated;
grant execute on function public.global_dashboard() to authenticated;

-- Preserve legacy checkout behind a guarded public wrapper.
alter function public.purchase_tickets(uuid,text,text,jsonb,uuid) set schema private;
create function public.purchase_tickets(p_event_id uuid,p_buyer_name text,p_buyer_email text,p_items jsonb,p_request_id uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare ev public.events%rowtype;
begin
  select * into ev from public.events where id=p_event_id for update;
  if ev.registration_enabled then raise exception 'REGISTRATION_REQUIRED'; end if;
  if ev.status in ('closed','finished','cancelled') then raise exception 'SALES_CLOSED'; end if;
  return private.purchase_tickets(p_event_id,p_buyer_name,p_buyer_email,p_items,p_request_id);
end;
$$;
revoke all on function public.purchase_tickets(uuid,text,text,jsonb,uuid) from public;
grant execute on function public.purchase_tickets(uuid,text,text,jsonb,uuid) to anon,authenticated;

-- Add short identifiers to existing private order pages without invalidating tokens.
create or replace function public.get_order(p_token uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('buyer_name',o.buyer_name,'created_at',o.created_at,
    'event',jsonb_build_object('title',e.title,'slug',e.slug,'venue',e.venue,'starts_at',e.starts_at,'ends_at',e.ends_at),
    'tickets',coalesce((select jsonb_agg(jsonb_build_object(
      'code',t.code,'short_code',t.short_code,'status',case when e.status='cancelled' then 'cancelled' else t.status::text end,
      'used_at',t.used_at,'attendee_name',t.attendee_name,'type_name',tt.name,'type_description',tt.description,
      'price',tt.price,'design',tpl.design,'description_template',tpl.description_template) order by tt.name,t.created_at)
      from public.tickets t join public.ticket_types tt on tt.id=t.ticket_type_id
      left join public.ticket_templates tpl on tpl.id=tt.template_id where t.order_id=o.id),'[]'::jsonb))
  from public.orders o join public.events e on e.id=o.event_id where o.access_token=p_token;
$$;

-- Privacy requests: remove identifying content while preserving aggregate/audit counts.
-- Legacy RPC keeps its response format; an explicit event is now mandatory.
alter function public.validate_ticket(text,uuid) set schema private;
create function public.validate_ticket(p_code text,p_event_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; t public.tickets%rowtype;
begin
  if public.staff_role() is null then perform private.audit('scan','denied'); return jsonb_build_object('result','forbidden'); end if;
  if p_event_id is null then
    if not private.allow_scan() then perform private.audit('scan','rate_limited'); return jsonb_build_object('result','rate_limited'); end if;
    return jsonb_build_object('result','not_found','code','');
  end if;
  if exists(select 1 from public.events where id=p_event_id and status in ('draft','cancelled','finished')) then
    return public.lookup_entry(p_event_id,p_code,false);
  end if;
  if upper(coalesce(p_code,'')) ~ '^[A-Z0-9]{4}$' then return public.lookup_entry(p_event_id,p_code,true); end if;
  result:=private.validate_ticket(p_code,p_event_id);
  if public.can_scan_event(p_event_id) then
    select * into t from public.tickets where event_id=p_event_id and code=upper(regexp_replace(p_code,'[ -]','','g'));
    insert into public.access_logs(event_id,ticket_id,admin_id,attempted_code,result) values(p_event_id,t.id,auth.uid(),t.short_code,result->>'result');
  end if;
  return result;
end;
$$;
revoke all on function public.validate_ticket(text,uuid) from public;
grant execute on function public.validate_ticket(text,uuid) to anon,authenticated;

create function public.redact_registration(p_registration uuid) returns void
language plpgsql security definer set search_path='' as $$
declare r public.registrations%rowtype;
begin
  select * into r from public.registrations where id=p_registration;
  if not found or not public.can_manage_event(r.event_id) then raise exception 'FORBIDDEN'; end if;
  perform 1 from public.events where id=r.event_id for update;
  delete from private.entry_links where registration_id=r.id;
  update public.registrations set status='cancelled',notes='' where id=r.id;
  update public.attendees set first_name='Datos suprimidos',last_name='',email=id::text||'@deleted.invalid',phone='' where id=r.attendee_id;
  update public.orders set buyer_name='Datos suprimidos',buyer_email=id::text||'@deleted.invalid',access_token=gen_random_uuid()
    where id in(select order_id from public.tickets where registration_id=r.id);
  update public.tickets set attendee_name='Datos suprimidos',status='cancelled' where registration_id=r.id;
  perform private.audit('privacy','redacted',r.event_id);
end;
$$;

-- Superadministrators authorize existing Auth identities, never public signups.
create function public.assign_staff(p_user uuid,p_org uuid,p_role text,p_event uuid default null,p_remove boolean default false) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if p_user=auth.uid() or p_role not in ('organizer','controller') or p_role is null then raise exception 'INVALID_INPUT'; end if;
  if p_role='organizer' and p_event is not null then raise exception 'INVALID_INPUT'; end if;
  if not exists(select 1 from auth.users where id=p_user) or not exists(select 1 from public.organizations where id=p_org) then raise exception 'INVALID_INPUT'; end if;
  if p_event is not null and not exists(select 1 from public.events where id=p_event and organization_id=p_org) then raise exception 'INVALID_INPUT'; end if;
  if exists(select 1 from public.organization_members where user_id=p_user and organization_id<>p_org) then raise exception 'IMMUTABLE_ORGANIZATION'; end if;
  if p_remove then
    if p_event is not null then delete from public.event_staff where user_id=p_user and event_id=p_event;
    else delete from public.organization_members where user_id=p_user and organization_id=p_org; end if;
  else
    insert into public.organization_members values(p_user,p_org,p_role) on conflict(user_id) do update set role=excluded.role;
    if p_role='controller' and p_event is not null then insert into public.event_staff values(p_event,p_user) on conflict do nothing; end if;
  end if;
  perform private.audit('staff',case when p_remove then 'removed' else 'assigned' end,p_event);
end;
$$;

revoke all on function public.redact_registration(uuid),public.assign_staff(uuid,uuid,text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.redact_registration(uuid),public.assign_staff(uuid,uuid,text,uuid,boolean) to authenticated;
revoke all on all functions in schema private from public,anon,authenticated;
revoke all on function public.register_attendee(uuid,uuid,text,text,text,text,boolean,boolean,boolean,text),
  public.manage_registration(uuid,text),public.edit_attendee(uuid,text,text,text,text,text),public.ticket_link(uuid,boolean),
  public.get_entry(text),public.lookup_entry(uuid,text,boolean),public.event_dashboard(uuid),public.list_attendees(uuid,text,text,uuid,integer,integer,boolean) from public,anon,authenticated;
grant execute on function public.register_attendee(uuid,uuid,text,text,text,text,boolean,boolean,boolean,text),public.get_entry(text) to anon,authenticated;
grant execute on function public.manage_registration(uuid,text),public.edit_attendee(uuid,text,text,text,text,text),public.ticket_link(uuid,boolean),
  public.lookup_entry(uuid,text,boolean),public.event_dashboard(uuid),public.list_attendees(uuid,text,text,uuid,integer,integer,boolean) to authenticated;
commit;
