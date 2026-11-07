# Cuentas de organizadores

## Cómo funciona

- En la web pública **no hay ningún botón** para organizadores. Se entra
  escribiendo `/admin` al final de la dirección (por ejemplo
  `https://tudominio.es/admin`). Si no has iniciado sesión, te lleva al login.
- Desde el login se puede:
  - **Iniciar sesión** con correo y contraseña.
  - **Crear cuenta** (`/login/crear-cuenta`): correo electrónico, nombre,
    apellidos, nombre del grupo que lo organiza y la contraseña dos veces
    (mínimo 8 caracteres).
  - **¿Olvidaste tu contraseña?** (`/login/recuperar`): llega un correo con un
    enlace para elegir una nueva (`/login/nueva-contrasena`). Al guardarla se
    cierran todas las sesiones abiertas.
- Al crear la cuenta llega un correo de confirmación. Al pulsar el enlace:
  1. La base de datos crea el **grupo** (organización) con el nombre indicado
     y da a la persona permisos de organizador (migración
     `0005_organizer_signup.sql`).
  2. Se abre la verificación de seguridad (código de una app de
     autenticación, igual que para el resto del personal).
- Cada grupo solo ve sus propios eventos, plantillas y asistentes.
- Nombre y apellidos se guardan en la ficha de la cuenta en Supabase
  (Authentication → Users → la cuenta → *User metadata*).

En la **versión beta** (`NEXT_PUBLIC_DEMO_MODE=true`) no se envían correos:
crear cuenta entra directamente al panel y la recuperación de contraseña no
está disponible (vale cualquier contraseña).

## Configurar Supabase (una sola vez, cuando se use la base de datos real)

1. **Migración.** Supabase → *SQL Editor* → pegar el contenido completo de
   `supabase/migrations/0005_organizer_signup.sql` → *Run*. Va después de la
   0004.
2. **Permitir altas.** *Authentication → Sign In / Providers → Email*:
   - *Allow new users to sign up*: **activado**.
   - *Confirm email*: **activado** (así nadie puede crear cuentas con correos
     que no son suyos).
3. **Direcciones.** *Authentication → URL Configuration*:
   - *Site URL*: la dirección de la web (`http://localhost:3000` en pruebas).
   - *Redirect URLs*: añadir `http://localhost:3000/auth/confirm` y, cuando
     esté publicada, `https://tudominio.es/auth/confirm`.
   - En producción, poner la misma dirección en la variable
     `NEXT_PUBLIC_SITE_URL`.
4. **Plantillas de correo** (recomendado: así el enlace funciona aunque se abra
   en otro móvil u ordenador). *Authentication → Emails → Templates*:
   - *Confirm signup*: sustituir el enlace por
     ```html
     <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/login/mfa">Confirmar mi cuenta</a>
     ```
   - *Reset password*: sustituir el enlace por
     ```html
     <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery">Elegir una contraseña nueva</a>
     ```
   - *Change email address* (desde «Mi cuenta» se puede cambiar el correo): sustituir el enlace por
     ```html
     <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email_change&next=/login/mfa">Confirmar el cambio de correo</a>
     ```
   Con las plantillas por defecto también funciona, pero solo si el enlace se
   abre en el mismo navegador en el que se pidió.
5. **Correo propio (antes de producción).** El servidor de correo incluido en
   Supabase solo envía unos pocos correos por hora y está pensado para
   pruebas. Para uso real hay que configurar un SMTP propio en
   *Authentication → Emails → SMTP Settings*.

## Seguridad

- Cualquiera puede crear una cuenta de organizador, pero solo obtiene **su
  propio grupo vacío**: no ve ni toca datos de otros grupos.
- Las cuentas creadas a mano desde el panel de Supabase (sin nombre de grupo)
  no reciben nada automáticamente; se siguen autorizando desde
  `/admin/configuracion`.
- La web no revela si un correo ya tiene cuenta: crear cuenta o pedir el
  enlace de recuperación muestran el mismo mensaje en ambos casos.
- Supabase limita los intentos de alta y de envío de correos. Para frenar
  bots, se puede activar el CAPTCHA en *Authentication → Attack Protection*.
