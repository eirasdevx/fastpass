# Reserva y pago en un punto de recogida

Modalidad para eventos en los que se reserva en la web, se paga en persona al
recoger algo físico (bonocopas, pulseras, entradas de papel…) y **eso físico es
la entrada**. El justificante digital no da acceso al evento. No hay pagos
online. En el Cotillón de Nochevieja lo que se recoge es el bonocopas, y en la
puerta se comprueba su sello ultravioleta (la app no interviene ahí).

El nombre de lo que se recoge se configura en cada evento («¿Qué se recoge?»,
por defecto *bonocopas*) y aparece en la web, el justificante y el panel.

Requiere las migraciones `supabase/migrations/0008_reservations.sql`,
`0009_reservation_admin.sql`, `0010_pickup_item_name.sql`,
`0011_reservation_attendees.sql`, `0012_personal_data_purge.sql`, `0013_reservation_people.sql`, `0014_attendees_with_ticket.sql` y `0015_last_pickup.sql` (después de la 0007). No funciona en la versión beta sin base de datos.

## Configurar un evento

1. **Panel → Eventos → Nuevo evento.** El formulario va por pasos numerados:
   1. **Datos del evento**: título, lugar y fechas.
   2. **¿Cómo se consiguen las plazas?**: elige *Reserva y pago en un punto
      de recogida* (viene marcada) y deja marcado **Reservas abiertas**. Cada
      opción explica cuándo elegirla y qué pasa en la puerta.
   3. **Aforo**: el máximo autorizado y las plazas para venta directa y otros
      canales.
   4. **Reservas y recogida**: qué se recoge (bonocopas, pulseras…),
      dirección del punto de recogida (obligatoria),
      instrucciones, fecha límite de recogida, apertura y cierre de reservas,
      máximo por persona y **datos de cada persona** (ver abajo).
   5. **Privacidad**: viene relleno con el nombre de tu grupo y tu correo.
   6. **Publicación**: déjalo en *Borrador* de momento.
2. Pulsa **Crear evento y seguir**. En la página del evento:
   - Arriba, una **lista de comprobación** dice si las reservas están
     ABIERTAS o CERRADAS y, si están cerradas, qué falta y dónde arreglarlo.
   - En **Tipos de bonocopas**, añade cada tipo: nombre, precio al recoger,
     cupo y máximo por reserva.
3. Cuando la lista esté en verde salvo «Evento publicado», cambia el estado a
   **Publicado** y guarda. Con **Probar como público** ves la página de reserva.
4. Para pausar las reservas sin despublicar, desmarca **Reservas abiertas**
   (o, para un solo tipo, desmarca «Se puede reservar»).

Si entras a la página pública de reserva con tu sesión de organizador y está
cerrada, también verás la lista de lo que falta. El público solo ve un
mensaje sencillo.

## Datos de cada persona

En «Reservas y recogida → Datos de cada persona» se puede pedir:

- **Nombre y apellidos de cada persona** cuando se reserva más de una.
- **DNI, NIE o pasaporte**: el DNI y el NIE se comprueban con su letra de
  control. Una misma persona no puede estar en dos reservas del evento.
- **Fecha de nacimiento** y, opcionalmente, **edad mínima el día del evento**
  (p. ej. 18): se rechaza la reserva si alguien no la cumple.

Si se pide DNI o fecha de nacimiento, se piden a **todas** las personas,
titular incluido (la persona 1 es el titular y usa su nombre). El justificante
y el punto de recogida muestran el documento enmascarado (•••••678Z) para
cotejarlo con el DNI físico. El detalle de la reserva en el panel y el CSV
muestran los datos completos; solo la organización del evento puede verlos.

## Plantillas del justificante

En **Plantillas → Nueva plantilla** elige *Justificante de reserva* (o en
blanco) y constrúyelo con bloques: títulos, textos con variables
(`{{titular}}`, `{{pendiente}}`, `{{personas}}`…), datos, QR, código, imágenes,
líneas, avisos y dos columnas. El aviso «no es una entrada» se añade siempre.
Después, en cada tipo del evento elige la **Plantilla del justificante**. Sin
plantilla se usa el justificante por defecto.

La vista previa es exactamente lo que se ve en pantalla y al imprimir o guardar
en PDF (con los colores exactos).

## Lo que ve el público

- Página del evento → **Reservar bonocopas** → formulario (tipo, cantidad,
  nombre, apellidos, correo, teléfono si hace falta y aceptación de privacidad).
- Al confirmar, el **justificante** (`/reserva/…`) muestra: código de 4
  caracteres, QR, cantidad, precio total a pagar, lugar y plazo de recogida,
  estado y el aviso *"ESTE DOCUMENTO ES UN JUSTIFICANTE DE RESERVA. NO ES UNA
  ENTRADA DE ACCESO AL EVENTO."*
- **Imprimir / guardar PDF** usa la impresión del navegador (en el móvil:
  *Compartir → Imprimir → Guardar como PDF*).
- El mismo enlace sirve para consultar el estado de la reserva. No se envía por
  correo: hay que guardar el enlace o el PDF.

## Cómo protege el aforo

- Ocupan aforo: entradas emitidas, inscripciones pendientes, bonocopas
  reservados pendientes, bonocopas entregados y plazas de otros canales. La
  suma nunca supera el aforo total ni el cupo de cada tipo, aunque lleguen
  muchas reservas a la vez.
- Al **cancelar** o **caducar** una reserva se libera solo lo no entregado.
- El código de 4 caracteres sirve para localizar la reserva; para entregar con
  él hay que comprobar la identidad del titular. El QR contiene un enlace largo
  e imposible de adivinar. Solo se guarda su huella (hash), no el enlace.
- El formulario limita los intentos por evento y por correo.

## Panel: Reservas (`/admin/reservas`)

Solo para organizadores. Requiere también la migración `0009_reservation_admin.sql`.

- Arriba, el **aforo**: autorizado, plazas disponibles, bonocopas pendientes de
  recoger, entregados e importe cobrado; debajo, completadas, canceladas y
  caducadas.
- **+ Reserva manual**: para reservas por teléfono o en persona. Respeta aforo y
  cupos, pero no el plazo de apertura ni el máximo por reserva. Al crearla se
  muestra **una sola vez** el enlace del justificante para enviárselo al titular.
- **Buscar** por nombre, correo o código y **filtrar** por estado y tipo.
- **Exportar CSV** con los filtros aplicados.
- **Detalle**: datos de contacto, entregas registradas (cantidad, importe, método
  de pago, quién y cuándo), **Cancelar reserva** y **Nuevo enlace del
  justificante** (si el titular lo pierde; el anterior deja de funcionar).

## Asistentes

En **Asistentes**, en un evento con reserva solo aparecen quienes **ya tienen
su entrada física**: reservas recogidas del todo o en parte. Las pendientes de
recoger están solo en **Reservas**. Hay una fila por persona si el evento pide
los datos de cada una, o el titular con las plazas entregadas si no. Muestra el
documento, el código de la reserva (enlace al detalle), cuántos se han entregado
y el estado. Se puede buscar por nombre, DNI, correo o código y exportar a CSV.

## Punto de recogida (menú «Accesos»)

Al entrar en **Accesos** primero se elige el evento (siempre, aunque solo haya
uno); arriba queda el evento elegido con **Cambiar evento**. Solo se pueden
elegir eventos publicados, también si ya no admiten entradas o reservas. No
aparecen borradores, eventos terminados ni cancelados.

Se escanea el QR (botón **Escanear QR**) o se escribe el código. El resultado
sale a pantalla grande:

- **CORRECTO** (verde): entrega registrada o acceso confirmado.
- **DENEGADO** (rojo): reserva cancelada o caducada, entrada anulada, o un
  justificante de reserva usado como entrada.
- **NO EXISTE** (rojo): no hay nada con ese código en este evento.
- **ALERTA · Ya se ha escaneado antes** (ámbar): ya se entregó todo o ya entró,
  con la fecha y hora. Si solo se recogió una parte, se avisa y deja entregar
  lo que falta.

Después, **Siguiente** vuelve a la cámara si se estaba usando.

Es la misma pantalla «Accesos» del menú: al elegir un evento de reserva con
recogida se convierte en el punto de recogida (en los demás eventos valida
entradas digitales en la puerta). Para organizadores y para el personal
asignado al evento. Pensado para el móvil:

1. **Escanear QR del justificante** (o escribir el código de 4 caracteres).
2. Aparecen titular, tipo, bonocopas pendientes y ya entregados.
3. Elegir **cuántos se entregan** (se admiten entregas parciales) y el **método
   de pago** (efectivo, tarjeta, Bizum u otro). El importe lo calcula el sistema.
4. Marcar **He cobrado…**. Si se buscó por código y no por QR, marcar también
   que se ha **comprobado el DNI**.
5. **ENTREGAR** → confirmación en verde. Entonces se entregan los bonocopas.

Si ya se entregó todo, avisa y no deja entregar más. Si dos personas intentan
entregar la misma reserva a la vez, solo una entrega queda registrada. Si se
corta la conexión al confirmar, **no entregar** hasta volver a buscar la reserva
y ver si quedó registrada.

## Borrado de datos personales (RGPD)

Cada evento tiene un plazo (*Conservar los datos tras el evento*, 90 días por
defecto). Al cumplirse se borran nombres, correos, teléfonos, observaciones,
DNI y fechas de nacimiento de sus reservas e inscripciones, y sus enlaces dejan
de funcionar. Se conservan las cantidades, los importes y las entregas, sin
nombres, para poder cuadrar las cuentas.

- En la página del evento, el recuadro **Datos personales** dice cuándo se
  borrarán. Cuando el evento ha terminado aparece **Borrar datos ahora**, por si
  no quieres esperar al plazo.
- Si alguien pide que se borren sus datos: comprueba su identidad, abre su
  reserva y pulsa **Suprimir datos personales**. Si la reserva seguía pendiente,
  se anula.

**Para que el borrado sea automático** (una sola vez, tras aplicar la 0012):

1. Supabase → *Integrations → Cron* → **Enable** (o *Database → Extensions* y
   activa `pg_cron`).
2. *SQL Editor → New query*, pega esto y pulsa *Run*:
   ```sql
   select cron.schedule('fastpass-borrado-rgpd', '30 4 * * *', 'select private.purge_expired_personal_data()');
   ```
   Se ejecuta cada día a las 4:30 (hora UTC). Para comprobarlo:
   `select * from cron.job;`. Para quitarlo:
   `select cron.unschedule('fastpass-borrado-rgpd');`.

Sin ese paso los datos no se borran solos; habría que pulsar *Borrar datos
ahora* en cada evento. La tarea diaria también limpia los contadores de intentos
antiguos.

## Pendiente

- Las copias de seguridad de Supabase guardan los datos borrados hasta que
  caducan (7 días en el plan gratuito). Indícalo en la política de privacidad.
