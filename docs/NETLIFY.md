# Publicar FastPass en Netlify

Guía paso a paso. Haz los pasos en orden y no pases al siguiente hasta terminar el anterior.

---

## 0. Antes de empezar: la base de datos (Supabase)

1. En **Supabase → SQL Editor**, ejecuta **en orden** las migraciones de `supabase/migrations/`
   que todavía no hayas aplicado. Las últimas son:
   `0011` … `0015`, **`0016_team_and_history.sql`**, **`0017_launch_capacity.sql`**, **`0018_delete_own_account.sql`**, **`0019_event_location_and_covers.sql`** y **`0020_security_hardening.sql`**.
   Cada archivo se pega entero y se pulsa **Run**.
2. Si aún no lo hiciste, programa el borrado automático de datos personales (pg_cron).
   Los pasos están en `docs/RESERVAS.md`.

---

## 1. Subir el código a GitHub

Netlify publica la web a partir de un repositorio de GitHub y la vuelve a publicar
sola cada vez que subes cambios.

1. Crea una cuenta gratuita en <https://github.com> si no la tienes.
2. Instala **GitHub Desktop** (<https://desktop.github.com>). Es la forma más sencilla, sin comandos.
3. En GitHub Desktop: **File → Add local repository** → elige la carpeta `fastpass`.
   Te dirá que no es un repositorio: pulsa **create a repository** y luego **Publish repository**.
   Deja marcado **Keep this code private** (repositorio privado).

> El archivo `.env.local` (con tus claves) **no se sube**: está excluido en `.gitignore`.
> Las claves se ponen en Netlify en el paso 3.

---

## 2. Crear el sitio en Netlify

1. Crea una cuenta en <https://app.netlify.com> (puedes entrar con tu cuenta de GitHub).
2. **Add new site → Import an existing project → GitHub** y elige el repositorio `fastpass`.
3. Netlify lee el archivo `netlify.toml` del proyecto y rellena solo la configuración:
   - Build command: `npm run build`
   - Publish directory: `.next`
4. **Todavía no pulses Deploy.** Antes, el paso 3.

---

## 3. Variables de entorno (las claves)

En la pantalla de creación (o después en **Site configuration → Environment variables**), añade:

| Nombre | Valor |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | La misma que en tu `.env.local` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | La misma que en tu `.env.local` (la clave **anon/pública**, nunca la `service_role`) |
| `NEXT_PUBLIC_SITE_URL` | La dirección de tu web en Netlify, p. ej. `https://fastpass-medina.netlify.app` (sin barra al final) |

Ahora sí: **Deploy**. Tarda 2–4 minutos.

> Si más adelante cambias alguna variable, hay que volver a publicar
> (**Deploys → Trigger deploy → Deploy site**): estas variables se incorporan al construir la web.

> ¿Aún no sabes la dirección? Publica una vez, copia la dirección que te da Netlify
> (la puedes cambiar en **Site configuration → Change site name**), pon `NEXT_PUBLIC_SITE_URL`
> y vuelve a publicar.

---

## 4. Avisar a Supabase de la nueva dirección

Sin esto, los enlaces de los correos (confirmar cuenta, recuperar contraseña) no funcionan.

En **Supabase → Authentication → URL Configuration**:

1. **Site URL**: tu dirección de Netlify, p. ej. `https://fastpass-medina.netlify.app`
2. **Redirect URLs** → **Add URL**: `https://fastpass-medina.netlify.app/auth/confirm`

---

## 5. Comprobar que todo funciona

Abre tu dirección de Netlify y prueba, en este orden:

1. La portada muestra los eventos publicados.
2. **/login** → entra con tu cuenta → te pide la verificación en dos pasos → llegas al panel.
3. El **Resumen** muestra las cifras del Cotillón.
4. Abre la página pública del evento y haz una **reserva de prueba**. Después cancélala desde el panel.
5. Desde el **móvil**, entra en **Accesos** y comprueba que la cámara escanea el QR del justificante
   (la cámara solo funciona con `https`, que Netlify pone solo).

Si algo falla, en Netlify ve a **Deploys → (el último) → Deploy log** o a **Logs → Functions**
y copia el mensaje de error.

---

## 6. El día de la apertura de reservas

- **Sala de espera:** en el evento → *Reservas y recogida* → marca **Sala de espera virtual**.
  Con 100 personas a la vez en el formulario suele ir bien.
- **Supabase:** para un pico de cientos de personas a la vez, conviene el plan **Pro** al menos ese mes
  (el gratuito tiene recursos justos y se pausa si no se usa en una semana).
- **Netlify:** el plan gratuito tiene un límite mensual de uso. La sala de espera consulta
  directamente a Supabase para no gastarlo, pero revisa **Usage & billing** después del primer pico.

---

## 7. Publicar cambios más adelante

Cada vez que cambies algo: en GitHub Desktop escribe un resumen del cambio → **Commit to main** → **Push origin**.
Netlify lo detecta y publica la nueva versión sola en unos minutos.

## (Opcional) Dominio propio

**Domain management → Add a domain** y sigue las instrucciones. Después cambia
`NEXT_PUBLIC_SITE_URL` y las dos direcciones del paso 4 por el dominio nuevo, y vuelve a publicar.
