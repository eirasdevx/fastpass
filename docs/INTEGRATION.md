# Integración de registro y control de accesos

## Auditoría inicial — 26 de octubre de 2026

Proyecto existente: Next 16.3.8, React 19, TypeScript, Tailwind 4, Zod,
React Hook Form, Supabase SSR/Auth/PostgreSQL, QR y Vitest. Se han leído
las guías locales de Server Actions y Route Handlers de esta versión.

Hay catálogo público, pedidos gratuitos sin cuenta, enlaces privados por
pedido, entradas QR, editor de plantillas, CRUD de eventos/tipos, MFA TOTP,
roles global/organizador/controlador, RLS por organización, control de
aforo y validación transaccional. Las entradas con precio están bloqueadas
por 0003 hasta incorporar pagos. Se conservan estas funciones y rutas.

Faltan solicitudes con aprobación, alta manual, token individual revocable,
código corto por evento, listado paginado, exportación, historial visible y
dashboard actualizado. El listado antiguo muestra como máximo 500 entradas.
Los tokens antiguos de pedido se guardan en claro; su compatibilidad se
mantiene. Los nuevos enlaces individuales se almacenarán mediante SHA-256.

`.env.local` contiene las claves esperadas, pero URL y anon key están vacías.
No se han leído ni publicado valores secretos. La demo existente es local,
con autenticación ficticia, y se rechaza en producción. Las nuevas funciones
no se simularán en esa demo. No hay metadatos Git en este directorio.

Comprobación inicial: 44 pruebas pasan; 21 de PostgreSQL no arrancan dentro
del sandbox de Windows (initdb/restricted token). Se solicita al ejecutor
la ejecución local autorizada, sin conexión a bases remotas.

## Plan de integración

1. Migración aditiva 0004 sobre las tres existentes: registros y asistentes,
   opciones de evento, códigos cortos, hashes de enlaces, funciones con
   permisos explícitos, auditoría y límites de peticiones en PostgreSQL.
2. Reutilizar Auth + MFA; añadir alias /admin/login sin rebajar permisos.
3. Ampliar formularios de evento; conservar ventas y plantillas existentes.
4. Añadir formulario público y alta manual; emisión únicamente al aprobar.
5. Página individual y regeneración de enlaces, preservando enlaces antiguos.
6. Búsqueda previa a confirmación y validación atómica en el evento elegido.
7. Dashboard, asistentes/entradas paginados, CSV e historial con sondeo.
8. Pruebas de integración de permisos, aforo, tokens y concurrencia; lint,
   TypeScript y build. Documentar configuración y limitaciones reales.

Las migraciones se verifican en PostgreSQL desechable. No se aplican a un
servicio externo sin credenciales. La invitación de personal mantiene el
procedimiento de operador de confianza, sin registro público de admins.

## Resultado por fase

| Fase | Archivos principales | Integración y verificación |
| --- | --- | --- |
| 1. Auditoría | Este informe, `docs/SETUP-REGISTRATION.md` | Estructura, dependencias, rutas, autenticación, SQL, variables y riesgos revisados. Las 65 pruebas iniciales pasan al ejecutar PostgreSQL fuera del sandbox de Windows. |
| 2. Base de datos | `supabase/migrations/0004_registration.sql`, `types/database.ts`, `tests/helpers/postgres.ts` | Migración aditiva con RLS, índices, reservas de aforo, códigos únicos, hashes, auditoría y permisos RPC. Probada también sobre una entrada histórica usada, preservando su código QR, validador y hora. |
| 3. Autenticación | `proxy.ts`, `app/admin/login/page.tsx`, controles en nuevas acciones | Se mantiene Auth + MFA + roles. Alias de login, acciones verificadas en servidor y SQL, no indexación de rutas privadas. Pruebas existentes de login/MFA y pruebas nuevas de acceso sin autorización. |
| 4. Eventos | `lib/validations/event.ts`, `components/admin/event-form.tsx`, `app/admin/eventos/*` | Estados, modos de inscripción, datos obligatorios y privacidad por evento; CRUD y plantillas conservados. Validación Zod/SQL y build. |
| 5. Registro público | `app/registro/actions.ts`, `app/(public)/eventos/[slug]/registro/page.tsx`, `components/registration-form.tsx` | Inscripciones pendientes o aprobadas, consentimiento, duplicados, aforo y límites SQL. Casos positivos, negativos y altas concurrentes probados. |
| 6. Gestión manual | `app/admin/asistentes/*`, `components/admin/attendee-controls.tsx` | Altas, aprobación, edición, anulación y supresión con permisos. SQL real verifica altas, ediciones y aislamiento. |
| 7. Entradas | `app/(public)/entrada/[token]/page.tsx`, `components/ticket/ticket-card.tsx` | Hash SHA-256, consulta mínima, revocación y rotación, código corto visible y QR compatible. Tokens falsos, IDs internos y enlaces revocados no recuperan entradas. |
| 8. Accesos | `app/admin/accesos/*`, `components/admin/access-control.tsx`, alias de `validar` | Búsqueda previa, confirmación en servidor y mensajes de desconexión. Dos conexiones independientes solo obtienen un primer acceso. Anuladas, eventos ajenos y cancelados se rechazan. |
| 9. Dashboard | `app/admin/page.tsx`, `app/admin/estadisticas/route.ts`, `app/admin/historial/page.tsx`, `lib/admin-data.ts`, `lib/csv.ts` | Contadores SQL con sondeo, consultas paginadas y CSV por bloques. Filtros, aislamiento, CSV y estadísticas contrastados en pruebas. |
| 10. Seguridad/operación | `app/admin/configuracion/*`, `components/admin/staff-form.tsx`, `scripts/check-database.mjs`, `next.config.ts`, `README.md` | Gestión de permisos de identidades ya verificadas, registros de desarrollo sin argumentos privados, guía de migración, privacidad y comprobación de esquema. Se mantienen bloqueo de pagos y rechazo de demo en producción. |

Para probar cada fase funcional, seguir el recorrido numerado de
`docs/SETUP-REGISTRATION.md` después de aplicar las migraciones y completar MFA.
Los nuevos módulos usan la base real; la demo heredada no los simula.

## Estado de la conexión externa y verificaciones pendientes

Durante el trabajo el usuario completó `.env.local` y desactivó la demo.
No se modificó ese archivo. La comprobación remota de solo lectura confirmó
conectividad y ausencia de 0002/0004 (columnas y funciones no encontradas).
Por tanto, la integración está verificada **localmente**, pero el servicio
conectado necesita las migraciones 0002–0004 y la configuración administrativa.
No se aplicaron cambios externos ni se crearon credenciales.

Resultado final: **91 pruebas pasan en 8 archivos**. ESLint, TypeScript y
build de producción completados sin errores. El escáner de
secretos no encontró coincidencias en los 109 archivos de código revisados.
Las pruebas usan PostgreSQL real desechable, incluyendo migración histórica,
doble confirmación, permisos, códigos, enlaces, aforo y auditoría. No se ha
medido carga de 10.000 asistentes en una infraestructura de producción.

La revisión visual quedó bloqueada por la ventana minimizada de Chrome que
la herramienta no pudo capturar. Las comprobaciones HTTP sin sesión
confirmaron redirecciones de administración y cabeceras de no indexación.
No sustituyen un recorrido de navegador con usuario real, MFA y esquema
actualizado. La política legal y la operación de conservación necesitan la
revisión del responsable; no se afirma certificación ni disponibilidad de
pagos, correo automático o importación Excel.
