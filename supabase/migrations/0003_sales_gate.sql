-- Behavior change explicitly approved by the user on 2026-10-19.
-- Run after 0002_security.sql. No payment provider exists in this application.
begin;
create function private.reject_unpaid_ticket() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists(select 1 from public.ticket_types where id = new.ticket_type_id and price > 0) then
    raise exception 'PAYMENTS_NOT_CONFIGURED';
  end if;
  return new;
end;
$$;
create trigger reject_unpaid_ticket before insert on public.tickets
  for each row execute function private.reject_unpaid_ticket();
revoke all on function private.reject_unpaid_ticket() from public, anon, authenticated;
commit;
