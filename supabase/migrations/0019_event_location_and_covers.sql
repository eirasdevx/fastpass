-- Ubicación exacta del evento en el mapa y subida de imágenes de portada. Aplicar después de 0018.
-- Se puede ejecutar más de una vez.
--
-- 1) Coordenadas: el organizador marca el punto en el mapa; la página pública lo muestra
--    con un enlace «Cómo llegar». Las dos van juntas o ninguna.
-- 2) Portadas: el navegador reduce la imagen (WebP, máx. 1600 px) y la sube al bucket público
--    «event-covers», dentro de una carpeta con el id de quien la sube. Solo puede subir quien
--    administra eventos; cualquiera puede verlas (son las portadas públicas).
-- 3) Borrado de portadas: al cambiar o quitar la imagen, al borrar el evento o la cuenta que se
--    lo lleva, la aplicación borra la imagen antigua. La base de datos solo lo permite si
--    ningún evento la sigue usando. (Supabase no deja borrar archivos desde SQL: lo hace la API.)
begin;

alter table public.events add column if not exists latitude double precision;
alter table public.events add column if not exists longitude double precision;
alter table public.events drop constraint if exists events_location_check;
alter table public.events add constraint events_location_check check (
  (latitude is null and longitude is null)
  -- «is not null» explícito: con una sola coordenada vacía el resto daría NULL y el check pasaría.
  or (latitude is not null and longitude is not null
    and latitude between -90 and 90 and longitude between -180 and 180));

-- ¿Usa algún evento esta imagen? Mira todos los eventos (también borradores de otros grupos,
-- que quien borra no puede ver): si no, se podría borrar la portada de un evento ajeno.
create or replace function public.cover_in_use(p_name text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.events e where right(e.cover_url,char_length(p_name)+14)='/event-covers/'||p_name);
$$;
revoke all on function public.cover_in_use(text) from public,anon;
grant execute on function public.cover_in_use(text) to authenticated;

-- El esquema storage solo existe en Supabase (no en la base de pruebas).
do $$
begin
  if to_regclass('storage.buckets') is null then return; end if;
  insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
    values('event-covers','event-covers',true,2097152,array['image/webp','image/jpeg','image/png'])
    on conflict(id) do update set public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
  drop policy if exists event_covers_insert on storage.objects;
  drop policy if exists event_covers_select on storage.objects;
  drop policy if exists event_covers_delete on storage.objects;
  create policy event_covers_insert on storage.objects for insert to authenticated with check (
    bucket_id='event-covers' and (storage.foldername(name))[1]=(select auth.uid())::text
    and public.staff_role() in ('admin','organizer'));
  -- La API de borrado necesita también poder leer la fila (las imágenes ya son públicas).
  create policy event_covers_select on storage.objects for select to authenticated using (bucket_id='event-covers');
  -- Quien la subió (aunque acabe de borrar su cuenta) o cualquier administrador, y solo si
  -- ningún evento la usa: así nunca desaparece la portada de un evento.
  create policy event_covers_delete on storage.objects for delete to authenticated using (
    bucket_id='event-covers'
    and ((storage.foldername(name))[1]=(select auth.uid())::text or public.staff_role() in ('admin','organizer'))
    and not public.cover_in_use(name));
end;
$$;

-- --- Borrado de cuentas: devuelven también las portadas de los eventos borrados -------------
-- Igual que en 0018, más «covers», para que la aplicación borre esas imágenes.

create or replace function private.owned_covers(p_user uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(e.cover_url),'[]'::jsonb) from public.events e
  where e.id in (select private.owned_events(p_user)) and e.cover_url is not null;
$$;

create or replace function public.delete_account(p_user uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_org uuid; n integer; covers jsonb;
begin
  if p_user is null or p_user=auth.uid() then raise exception 'CANNOT_DELETE_SELF'; end if;
  select organization_id into v_org from public.organization_members where user_id=p_user;
  if v_org is null or not public.can_manage_org(v_org) then raise exception 'FORBIDDEN'; end if;
  if exists(select 1 from public.admins where user_id=p_user) then raise exception 'FORBIDDEN'; end if;
  covers := private.owned_covers(p_user);
  n := private.purge_account(p_user);
  perform private.audit('account','deleted');
  return jsonb_build_object('deleted_events',n,'covers',covers);
end;
$$;

create or replace function public.delete_own_account() returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid := auth.uid(); n integer; covers jsonb;
begin
  if me is null or coalesce(auth.jwt()->>'aal','')<>'aal2' then raise exception 'FORBIDDEN'; end if;
  if exists(select 1 from public.admins where user_id=me) and not exists(select 1 from public.admins where user_id<>me) then
    raise exception 'LAST_SUPERADMIN';
  end if;
  covers := private.owned_covers(me);
  n := private.purge_account(me);
  perform private.audit('account','deleted_self');
  return jsonb_build_object('deleted_events',n,'covers',covers);
end;
$$;

revoke all on function private.owned_covers(uuid) from public,anon,authenticated;

commit;
