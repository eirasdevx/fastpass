-- Alta pública de organizadores. Aplicar después de 0004.
-- Cuando una cuenta creada desde /login/crear-cuenta confirma su correo, recibe
-- su propia organización (el "grupo que lo organiza") con rol organizer.
-- Las cuentas creadas desde el panel de Supabase no llevan organization_name en
-- sus metadatos y no reciben nada: se siguen autorizando con assign_staff.
begin;

create function private.handle_organizer_signup() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  org_name text := btrim(coalesce(new.raw_user_meta_data->>'organization_name', ''));
  org uuid;
begin
  -- Solo en el momento de la confirmación, nunca en cambios posteriores.
  if new.email_confirmed_at is null then return new; end if;
  if TG_OP = 'UPDATE' and old.email_confirmed_at is not null then return new; end if;
  -- Los metadatos los escribe el usuario: se validan aquí también y nunca se lanza
  -- una excepción, para no bloquear la confirmación del correo.
  if char_length(org_name) not between 1 and 120 then return new; end if;
  if exists(select 1 from public.organization_members where user_id = new.id)
    or exists(select 1 from public.admins where user_id = new.id) then return new; end if;
  insert into public.organizations(name) values (org_name) returning id into org;
  insert into public.organization_members values (new.id, org, 'organizer');
  return new;
end;
$$;

create trigger organizer_signup
  after insert or update of email_confirmed_at on auth.users
  for each row execute function private.handle_organizer_signup();

revoke all on function private.handle_organizer_signup() from public, anon, authenticated;
commit;
