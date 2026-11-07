-- Permisos de tabla explícitos. Aplicar después de 0005. Se puede repetir sin riesgo.
-- 0001 dependía de que Supabase concediera por defecto acceso a las tablas nuevas
-- de public a anon/authenticated. Los proyectos nuevos ya no lo hacen y la web
-- recibe 42501 (permiso denegado) incluso para leer eventos publicados.
-- Las filas visibles las siguen decidiendo las políticas RLS de 0002–0004.
begin;

-- Sin TRUNCATE ni REFERENCES: TRUNCATE no respeta RLS.
grant select, insert, update, delete
  on public.admins, public.ticket_templates, public.events, public.ticket_types, public.orders, public.tickets
  to anon, authenticated;

-- Mismas restricciones que 0002_security.sql: pedidos y entradas solo se crean
-- y modifican mediante funciones, salvo el estado de una entrada.
revoke insert, delete on public.orders, public.tickets from anon, authenticated;
revoke update on public.orders, public.tickets from anon, authenticated;
grant update(status) on public.tickets to authenticated;

commit;
