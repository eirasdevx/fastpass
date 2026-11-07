-- Crear eventos en borrador. Aplicar después de 0006. Se puede repetir sin riesgo.
-- can_scan_event(id) busca el evento en la tabla y, dentro de un INSERT ... RETURNING,
-- todavía no ve la fila nueva: un borrador recién creado no superaba la política de
-- lectura y Supabase respondía 42501. can_manage_org(organization_id) usa la propia
-- fila. Quién puede ver cada evento no cambia: can_scan_event ya incluía a quien
-- gestiona la organización.
begin;

drop policy if exists "event public or staff" on public.events;
create policy "event public or staff" on public.events for select
  using (published or public.can_manage_org(organization_id) or public.can_scan_event(id));

commit;
