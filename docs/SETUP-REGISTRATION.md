# Puesta en marcha del registro individual

## Estado comprobado el 26 de octubre de 2026

La URL y la clave pública se añadieron a `.env.local` durante el desarrollo,
sin modificaciones por el agente. La conexión con Supabase responde, pero
la comprobación de solo lectura devuelve `42703` para `organization_id` /
`capacity` y `PGRST202` para `staff_role` y `get_entry`. La base conectada no
tiene la migración de seguridad 0002 ni la integración 0004. No se han
escrito datos, aplicado migraciones ni creado identidades en ese servicio.

**No utilizar esa base con datos reales hasta aplicar las migraciones y
verificar los permisos.** La clave pública no permite ejecutar DDL. No hace
falta añadir una clave de servicio a la aplicación.

## Actualizar una base existente

1. Identificar el proyecto correcto y conservar una copia de seguridad.
   Probar la actualización en una copia de staging si contiene datos.
2. En Supabase → SQL Editor, ejecutar completos y en este orden los archivos
   que falten: `supabase/migrations/0002_security.sql`,
   `0003_sales_gate.sql`, `0004_registration.sql`, `0005_organizer_signup.sql`,
   `0006_table_grants.sql`, `0007_event_owner_read.sql`, `0008_reservations.sql`, `0009_reservation_admin.sql`,
   `0010_pickup_item_name.sql`, `0011_reservation_attendees.sql`, `0012_personal_data_purge.sql`, `0013_reservation_people.sql`, `0014_attendees_with_ticket.sql`, `0015_last_pickup.sql`, `0016_team_and_history.sql`, `0017_launch_capacity.sql`, `0018_delete_own_account.sql`, `0019_event_location_and_covers.sql`.
   No volver a ejecutar 0001 sobre tablas existentes. En una base vacía,
   ejecutar 0001 primero. Estas migraciones no son idempotentes.
3. 0002 deja eventos/plantillas sin organización en cuarentena. Un operador
   de confianza debe revisar y asignar su organización real. No se adivina
   el propietario ni se cambia automáticamente. Las relaciones de plantilla,
   tipos y evento deben pertenecer a la misma organización.
4. Los organizadores crean su propia cuenta y su grupo desde
   `/login/crear-cuenta`: configurar Supabase Auth según
   `docs/ORGANIZADORES.md` (altas activadas con confirmación de correo).
   El personal de puerta se sigue creando/invitando por el panel. Para administrar permisos desde `/admin/configuracion`, el
   operador puede dar de alta un superadministrador de confianza en `admins`.
   Una cuenta global que crea eventos también necesita una organización de
   trabajo en `organization_members` para que se asigne la propiedad.
5. Iniciar sesión en `/login` o `/admin/login` y completar MFA TOTP. Una sesión
   sin AAL2 no tiene acceso al negocio, aunque invoque la API directamente.
6. Ejecutar `npm run check:database`. Solo comprueba presencia de esquema y
   RPC públicas, sin leer asistentes. Verificar en el SQL Editor que 0003
   está aplicada: el trigger `reject_unpaid_ticket` debe existir en `tickets`.
7. Mantener `NEXT_PUBLIC_DEMO_MODE=false`. Reiniciar `npm run dev` tras cambiar
   variables. HTTPS es obligatorio en producción y para la cámara fuera de
   localhost. La clave de servicio nunca se pone en `NEXT_PUBLIC_*`.

## Recorrido funcional

1. Crear un evento en `/admin/eventos/nuevo`: aforo, fecha de inicio/fin,
   estado publicado, formulario individual activo, responsable y contacto de
   privacidad. El ejemplo de Nochevieja puede configurarse con fecha
   31/12/2026 y ubicación Medina del Campo; no está fijado en código.
2. Crear un tipo gratuito y, opcionalmente, asignar una plantilla existente.
   Los tipos con precio siguen bloqueados para emisión. El modo pago solo
   admite solicitudes pendientes; no afirma que se haya realizado un cobro.
3. Abrir `/eventos/{slug}/registro`. Nombre/correo son siempre obligatorios;
   apellidos y teléfono dependen del evento. La política está enlazada desde
   el formulario. Se valida de nuevo en SQL.
4. Modo manual: guardar la URL privada mostrada, que indicará pendiente.
   Aprobar desde `/admin/asistentes`. El mismo enlace pasa a mostrar la
   entrada. Modo automático: el registro gratuito la emite en la transacción.
   Cada solicitud pendiente reserva una plaza; anularla libera el cupo.
5. Probar el alta manual con `+ Añadir asistente`, estado pendiente o aprobado,
   y notas privadas. Editar datos desde los detalles de la fila.
6. Abrir `/admin/accesos` en dos dispositivos, seleccionar el mismo evento,
   buscar el código corto y pulsar **CONFIRMAR ENTRADA** a la vez. Solo una
   operación registra acceso. La otra informa de que ya está utilizada y
   muestra la hora original. No hay validación offline.
7. Verificar estadísticas en `/admin` (sondeo cada 10 s) e historial en
   `/admin/historial` (cada 15 s, paginado). El personal de puerta no puede
   consultar el listado general, correos, notas o historial administrativo.
8. Buscar por nombre/código, filtrar por estado/tipo y paginar en servidor.
   Exportar CSV descarga los resultados en bloques de 500 filas, sin cargar
   el listado completo en el navegador. Las fórmulas CSV se neutralizan.
9. Regenerar un enlace individual y comprobar que el anterior devuelve
   entrada no encontrada. Guardar el nuevo enlace al generarlo: solo se
   conserva SHA-256, por lo que no se puede recuperar el original del hash.

## Compatibilidad y límites concretos

- Se mantienen pedidos y enlaces `/entradas/{token}`, QR antiguos de 16/32
  caracteres, plantillas y sus variables. Se asigna código corto también a
  las entradas históricas. La migración conserva su validador y fecha de uso.
- Los códigos usan un alfabeto de 32 símbolos y 20 bits aleatorios:
  1.048.576 combinaciones por evento, 128 intentos y restricción UNIQUE.
  No se reciclan códigos anulados. Cerca del agotamiento puede ser necesario
  reintentar; el sistema falla de forma segura, sin emitir duplicados.
- El QR conserva su identificador largo. El código corto solo se utiliza
  dentro de un evento y por personal con sesión y permiso. Se comprueba el
  nombre antes de confirmar; no es una contraseña del asistente.
- Los organizadores existentes mantienen alcance de **organización**. Los
  controladores tienen asignaciones por evento. La gestión de personal exige
  un superadministrador con MFA; la creación de identidades Auth se hace por
  el operador. La administración global continúa reservada a `admins`.
- El RPC antiguo `validate_ticket` ahora exige un evento explícito para
  consumir una entrada. `/admin/validar` redirige al nuevo control en modo
  real. En demo conserva el escáner anterior. El restablecimiento excepcional
  de entradas desde el editor antiguo se conserva y queda auditado.
- Regenerar un enlace individual no revoca un enlace **de pedido** histórico
  que incluya otras entradas. Son credenciales diferentes. Anular la entrada
  impide el acceso desde cualquier enlace. Los nuevos registros no comparten
  el token interno del pedido con el público.
- No hay envío automático de correo ni pasarela de pago; el enlace se
  muestra al finalizar el alta. La recuperación ante pérdida del enlace se
  hace con verificación de identidad y regeneración por un administrador.
- Los límites SQL son 100 solicitudes públicas/minuto/evento, 5/hora/correo
  y 120 búsquedas-confirmaciones/minuto/operador. El honeypot añade una
  barrera en el formulario. Esto no es CAPTCHA ni protección DDoS: ajustar
  límites/WAF en el despliegue según demanda y riesgo.
- La exportación recorre páginas, no mantiene un snapshot transaccional
  durante toda la descarga. Hacer exportaciones finales con la actividad
  detenida para evitar cambios de filas durante el recorrido.
- Preparado con consultas paginadas e índices; no se ha certificado carga
  de 10.000 asistentes ni latencia bajo picos reales. Ejecutar pruebas de
  carga en staging antes de un evento de esa escala.
- La demo no simula las nuevas funciones ni reemplaza la persistencia real.

## Conservación, derechos y operación

La configuración guarda un plazo en días después del fin/inicio del evento.
Con la migración 0012 y la tarea diaria de pg_cron (pasos en
`docs/RESERVAS.md`, *Borrado de datos personales*) los datos se borran solos al
cumplirse el plazo; sin la tarea, el organizador tiene que pulsar *Borrar datos
ahora* en cada evento. Una consulta de identificación (sin borrar nada) es:

```sql
select id, title, coalesce(ends_at, starts_at) + make_interval(days => retention_days) as review_at
from public.events
where coalesce(ends_at, starts_at) + make_interval(days => retention_days) < now();
```

Para solicitudes individuales, verificar la identidad por canal seguro,
acotar la exportación al titular y entregar únicamente sus datos. No enviar
un CSV completo del evento a un asistente. Desde los detalles de una
inscripción, **Suprimir datos** anula la entrada, revoca enlaces, elimina
nombre/correo/teléfono/notas de esa inscripción y de su pedido interno, y
conserva auditoría sin contenido identificativo del asistente. Los datos de
otras inscripciones del mismo titular requieren revisión separada.

Para pedidos históricos, un operador debe localizar el pedido por su ID
interno después de verificar al solicitante. En una transacción, revocar
`orders.access_token`, eliminar sus `private.entry_links`, anonimizar
`orders.buyer_name`/`buyer_email` y `tickets.attendee_name`, y anular las
entradas si corresponde. Revisar obligaciones de conservación antes de
ejecutar esa operación. No se ejecutó ninguna supresión sobre la base remota.

Depurar periódicamente `private.registration_limits` con ventanas vencidas
(más de un día) mediante tarea de operador; los buckets solo contienen
identificadores de evento y hashes de correo. Definir conservación de
auditoría, copias de seguridad y exportaciones, y restringir el acceso a
esas copias. No incluir URLs de `/entrada/*` o `/entradas/*`, argumentos de
acciones ni datos de formularios en logs, analítica, errores o proxies.
El registro de argumentos y peticiones de desarrollo de Next está desactivado.

El texto informativo incluido describe el funcionamiento técnico. El
responsable debe completar su identificación y revisar base jurídica,
proveedores, transferencias, contratos, derechos y plazos aplicables antes
del uso real. Esta integración no constituye una certificación jurídica.

## Verificación

`npm test` utiliza PostgreSQL desechable con usuarios y datos sintéticos.
No acepta URLs de bases externas. En Windows puede requerir permiso para
iniciar `initdb` fuera del sandbox. `npm run lint`, `npm run typecheck` y
`npm run build` completan la comprobación del código.

La revisión visual no pudo completarse: la herramienta de escritorio no
pudo capturar la ventana minimizada de Chrome. La autenticación real y los
recorridos completos con Supabase quedan pendientes de migrar el proyecto
y disponer de una cuenta administrativa con MFA. Las comprobaciones HTTP
sin sesión verificaron la redirección de rutas privadas y las cabeceras de
no indexación; no equivalen a una prueba de navegador autenticada.
