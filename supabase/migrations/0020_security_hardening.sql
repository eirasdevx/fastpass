-- Apply after 0019. Idempotent; no user data or Storage objects are deleted.
begin;

-- An authenticated session alone does not prove ownership of its email address.
create or replace function public.accept_invitation(p_token text) returns void
language plpgsql security definer set search_path='' as $$
declare verified_email text;
begin
  select email into verified_email from auth.users
    where id=auth.uid() and email_confirmed_at is not null;
  if verified_email is null then raise exception 'INVITATION_INVALID'; end if;
  if not private.accept_invitation(auth.uid(),verified_email,p_token) then
    raise exception 'INVITATION_INVALID';
  end if;
end;
$$;
revoke all on function public.accept_invitation(text) from public,anon,authenticated;
grant execute on function public.accept_invitation(text) to authenticated;

-- Query parameters and fragments do not change which object the browser displays.
create or replace function public.cover_in_use(p_name text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.events e
    where right(split_part(split_part(e.cover_url,'#',1),'?',1),char_length(p_name)+14)='/event-covers/'||p_name);
$$;

-- Only the owner, a manager of the owner's team or a platform admin may clean up
-- an unused cover. Always require MFA, including for the object's own uploader.
create or replace function public.can_delete_cover(p_name text) returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce(
    auth.uid() is not null and auth.jwt()->>'aal'='aal2'
    and (
      split_part(p_name,'/',1)=auth.uid()::text
      or public.is_admin()
      or exists(select 1 from public.organization_members m
        where m.user_id::text=split_part(p_name,'/',1) and public.can_manage_org(m.organization_id))
    ) and not public.cover_in_use(p_name), false);
$$;
revoke all on function public.can_delete_cover(text) from public,anon,authenticated;
grant execute on function public.can_delete_cover(text) to authenticated;

do $$
begin
  if to_regclass('storage.objects') is null then return; end if;
  drop policy if exists event_covers_delete on storage.objects;
  create policy event_covers_delete on storage.objects for delete to authenticated using (
    bucket_id='event-covers' and public.can_delete_cover(name));
  -- The public bucket still serves images. Authenticated listing should not
  -- expose the object names of unrelated teams (including unfinished uploads).
  drop policy if exists event_covers_select on storage.objects;
  create policy event_covers_select on storage.objects for select to authenticated using (
    bucket_id='event-covers' and (
      (storage.foldername(name))[1]=(select auth.uid())::text
      or public.can_delete_cover(name)));
end;
$$;

commit;
