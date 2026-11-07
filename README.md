# FastPass

Venta y validación de entradas para eventos. Next.js 16 (App Router) + TypeScript + Tailwind v4 + Supabase.

**Registro individual y control de accesos:** se ha integrado inscripción
con aprobación manual o gratuita automática, alta manual, códigos de cuatro
caracteres por evento, enlaces individuales revocables con hash, dashboard,
listados paginados, CSV, historial y control de accesos en dos pasos.
Consulta [puesta en marcha, compatibilidad y límites](docs/SETUP-REGISTRATION.md)
y [auditoría e integración](docs/INTEGRATION.md). Requiere las migraciones
0001–0020. No basta con tener configuradas la URL y la clave pública.
Consulta las [correcciones de seguridad y su despliegue](docs/security/SECURITY-2026-10-28.md).

- **Clientes**: ven los eventos publicados y consiguen entradas **sin registrarse** (nombre + email). Reciben un enlace privado (`/entradas/<token>`) con sus entradas, cada una con su QR, listas para imprimir o guardar en PDF.
- **Administradores**: inician sesión en `/login` y gestionan eventos, tipos de entrada (precio, aforo, máximo por pedido), asistentes y **plantillas** de entrada.
- **Plantillas**: editor visual con vista previa en vivo (diseño horizontal / vertical / minimalista, colores, tipografía, imagen de fondo, logo, qué datos mostrar) y descripción con variables: `{{evento}}`, `{{fecha}}`, `{{hora}}`, `{{lugar}}`, `{{tipo}}`, `{{descripcion_tipo}}`, `{{precio}}`, `{{asistente}}`, `{{codigo}}`.
- **Validación** (`/admin/validar`): escáner QR con la cámara del móvil o código a mano. Responde *válida*, *ya utilizada* (con la hora a la que entró), *no existe*, *anulada* o *de otro evento*.
- **Pagos**: todavía no hay proveedor, cobro, reservas ni webhook. No utilizar para ventas monetarias. Consulta los bloqueantes y controles preparados en [el informe de seguridad](docs/security/SECURITY-REPORT.md).

## Versión beta (sin base de datos)

Para ver cómo queda la app sin crear nada en Supabase:

```bash
# .env.local
NEXT_PUBLIC_DEMO_MODE=true
```

```bash
npm install
npm run dev
```

- Carga eventos, plantillas, pedidos y asistentes de ejemplo (`lib/demo/store.ts`).
- Todo funciona: comprar entradas, editar eventos y plantillas, validar QR… pero los datos viven **en memoria** y se reinician al parar el servidor.
- `/login` acepta cualquier email y contraseña.
- Una franja «Beta» arriba enlaza a unas entradas de ejemplo y al panel.
- `lib/demo/client.ts` imita al cliente de Supabase, así que las páginas no saben que están en modo demo. Para pasar a la versión real, pon `NEXT_PUBLIC_DEMO_MODE=false` y sigue los pasos de abajo.

> Demo exclusivamente local y con datos ficticios. El login no autentica identidades reales y cada proceso tiene su propia copia. El arranque y build de producción rechazan `NEXT_PUBLIC_DEMO_MODE=true`: [cambios autorizados](docs/security/COMPATIBILITY.md).

## Puesta en marcha

1. Crea un proyecto en [Supabase](https://supabase.com).
2. En una base nueva de **staging**, ejecuta en orden `supabase/migrations/0001_init.sql`, `0002_security.sql`, `0003_sales_gate.sql`, `0004_registration.sql`, `0005_organizer_signup.sql`, `0006_table_grants.sql`, `0007_event_owner_read.sql`, `0008_reservations.sql`, `0009_reservation_admin.sql`, `0010_pickup_item_name.sql`, `0011_reservation_attendees.sql`, `0012_personal_data_purge.sql`, `0013_reservation_people.sql`, `0014_attendees_with_ticket.sql` y `0015_last_pickup.sql` (reservas de bonocopas y borrado de datos, ver `docs/RESERVAS.md`). No publicar una base que solo tenga 0001. La tercera migración bloquea emitir entradas con precio mientras no exista pasarela. No se ha aplicado ninguna migración a servicios remotos durante este trabajo.
3. En **Authentication → Sign In / Providers**, deja activado *Allow new users to sign up* con *Confirm email*: los organizadores se dan de alta en `/login/crear-cuenta` (los compradores no tienen cuenta). Pasos completos en `docs/ORGANIZADORES.md`.
4. Crea una cuenta mediante el panel de Auth y verifica su dirección por un canal seguro. Como operador de confianza, crea su organización y membresía. Sustituye los UUID de ejemplo por los IDs reales; no compartas claves de servicio:
     ```sql
     with org as (
       insert into public.organizations(name) values ('Mi organización') returning id
     )
     insert into public.organization_members(user_id, organization_id, role)
     select 'UUID_DEL_USUARIO'::uuid, id, 'organizer' from org;
     ```
   - Una cuenta pertenece a una organización. Para personal de puerta usa `role='controller'` y registra sus pares `(event_id, user_id)` en `event_staff` mediante operador. No dispone de permiso para compradores, precios ni restablecimiento de entradas.
   - Reserva `public.admins` para administradores **globales** de confianza: permite acceso a todas las organizaciones. No añadas organizadores normales a esa tabla.
   - El login real exige un autenticador TOTP en `/login/mfa`. La BD exige AAL2, incluso en llamadas directas a la API. Configura factores y recuperación en Supabase; valida el flujo en staging.
   - Las filas antiguas sin organización quedan en cuarentena. No se asignan automáticamente ni se borran. La plantilla inicial de 0001 es una de ellas; crea una plantilla propia desde el panel.
5. Variables de entorno:
   ```bash
   cp .env.example .env.local   # rellena URL y anon key (Project Settings → API)
   ```
6. Arranca:
   ```bash
   npm install
   npm run dev
   ```
7. (Recomendado) Sustituye los tipos escritos a mano por los generados:
   ```bash
   npx supabase gen types typescript --project-id <id> > types/database.ts
   ```

> La cámara del validador solo funciona en **HTTPS** o en `localhost`. Para probar con el móvil en local usa `npx next dev --experimental-https` o despliega en Vercel.

## Seguridad

- **RLS en las tablas de negocio.** El público lee eventos publicados; organizadores acceden a datos privados de su organización y el personal de puerta solo valida sus eventos asignados. La tabla privada de auditoría no es accesible por la API.
- Las compras y reactivaciones bloquean el evento y comprueban el aforo en PostgreSQL, con límite por tipo y total del evento si se configura. El formulario reutiliza una clave de idempotencia al reintentar la misma selección. Define siempre el aforo autorizado; vacío significa que solo se aplica el límite por tipo.
- El cliente consulta sus entradas con `get_order(token)`; el token es un UUID aleatorio, solo quien tiene el enlace ve el pedido.
- `validate_ticket` comprueba MFA, pertenencia/asignación y limita a 120 solicitudes/minuto por usuario. Dos escáneres no registran el mismo primer acceso. El restablecimiento manual por organizador se conserva como excepción auditada.
- Nuevos QR usan UUID aleatorio completo (122 bits aleatorios); se siguen aceptando códigos antiguos. El decodificador WASM se prepara con `predev`/`prebuild`, se verifica su SHA-256 y se sirve localmente.
- Cookies de autenticación HttpOnly/SameSite=Lax y Secure en producción; CSP con nonce, HSTS en producción y Referrer-Policy sin referente. No cachear enlaces privados ni registrar URLs de pedidos. El proyecto utiliza autenticación de servidor; el cliente browser existente no se usa para sesiones.
- No se usa la `service_role` key en ningún sitio.
- La demo no implementa RLS multi-tenant: es una herramienta de presentación local. Las pruebas de aislamiento ejecutan SQL real, no la demo.

## Estructura

```
app/
├── (public)/                 # web pública
│   ├── page.tsx              # listado de eventos
│   ├── eventos/[slug]/       # ficha + compra (Server Action)
│   ├── entradas/[token]/     # entradas del cliente con QR
│   └── login/                # acceso de administradores
└── admin/                    # protegido (proxy.ts + requireAdmin)
    ├── page.tsx              # eventos
    ├── eventos/              # crear/editar, tipos de entrada, asistentes
    ├── plantillas/           # editor visual de entradas
    └── validar/              # escáner QR
components/
├── ui/                       # primitivas estilo shadcn
├── ticket/                   # TicketCard (render de la entrada) + QR
├── admin/                    # formularios, editor y validador
└── purchase/                 # formulario de compra
lib/
├── supabase/                 # clientes browser/server
├── demo/                     # versión beta: datos de ejemplo + cliente falso
├── tickets/design.ts         # esquema del diseño y variables
├── validations/              # esquemas Zod (cliente y servidor)
└── format.ts                 # fechas en Europe/Madrid, precios
supabase/migrations/          # esquema, RLS y funciones
tests/                        # Vitest (lógica pura)
proxy.ts                      # Next 16: sustituye a middleware.ts
```

## Comprobaciones

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

`npm test` arranca PostgreSQL desechable en loopback, con credenciales aleatorias y datos sintéticos, sin aceptar URLs de base de datos externas. Requiere poder iniciar procesos locales. El script de carga de `tests/load/staging.js` se ejecuta aparte, nunca como parte de esta batería. Consulta [operación y staging](docs/security/OPERATIONS.md).

## Siguientes pasos naturales

- Pasarela de pago (Stripe/Redsys): pedido `pending` y emisión de entradas en el webhook.
- Enviar el enlace de las entradas y el justificante de las reservas por email (p. ej. Resend).
- Subida de imágenes a Supabase Storage en lugar de URLs.
- Importación de asistentes CSV/Excel.
- CAPTCHA y reglas WAF adaptadas al despliegue; las nuevas inscripciones ya incluyen límites persistentes en SQL y honeypot.
- Inicio de sesión con Google para organizadores (ver abajo).

## A futuro: iniciar sesión con Google

Ahora mismo los organizadores entran solo con correo y contraseña. Se puede
añadir un botón **"Continuar con Google"** cuando se quiera. Se probó y se
retiró a la espera de decidirlo. Pasos:

### 1. En Google (crear las "llaves")

1. En Supabase → *Authentication → Sign In / Providers → Google*, copia la
   **Callback URL** (`https://<tu-proyecto>.supabase.co/auth/v1/callback`).
2. En https://console.cloud.google.com, crea un proyecto `FastPass` y
   selecciónalo.
3. Menú ☰ → **Google Auth Platform** → *Comenzar*: nombre `FastPass`, tu
   correo de asistencia, público **Externo**, tu correo de contacto → *Crear*.
4. **Clientes → Crear cliente** → tipo **Aplicación web**:
   - *Orígenes de JavaScript autorizados*: `http://localhost:3000` y el
     dominio real (`https://tudominio.es`).
   - *URIs de redireccionamiento autorizados*: la Callback URL del paso 1.
   - *Crear* y copiar el **ID de cliente** y el **Secreto del cliente**
     (`GOCSPX-…`). El secreto es privado: nunca en el código ni en `.env.local`.
5. **Google Auth Platform → Público → Publicar aplicación**. Mientras esté
   "En pruebas", solo entran las cuentas añadidas como usuarios de prueba.

### 2. En Supabase

6. En la pantalla de Google del paso 1: activar *Enable Sign in with Google*,
   pegar el ID en *Client IDs* y el secreto en *Client Secret (for OAuth)*;
   dejar apagados *Skip nonce checks* y *Allow users without an email* →
   *Save*.
7. *Authentication → URL Configuration → Redirect URLs* debe incluir
   `…/auth/confirm` (ya hace falta para los correos de alta).

### 3. En el código

8. **Botón**: un enlace `<a href="/auth/google">` (no un formulario: la CSP
   `form-action 'self'` impide redirigir un formulario a Google) en
   `/login` y `/login/crear-cuenta`.
9. **Ruta `app/auth/google/route.ts`** (GET), que redirige a `data.url`;
   `/auth/confirm` ya canjea el `?code=` de vuelta:
   ```ts
   const { data } = await supabase.auth.signInWithOAuth({
     provider: 'google',
     options: { redirectTo: `${await siteUrl()}/auth/confirm?next=/login/mfa`, skipBrowserRedirect: true },
   })
   ```
   Si llega `?error=` (la persona canceló), volver a `/login` con un aviso.
10. **Completar cuenta**: Google no sabe el nombre del grupo, así que quien
    entra por primera vez no tiene organización. Hace falta:
    - Una migración con una función `create_own_organization(p_name)`
      (`security definer`): exige sesión y correo verificado, rechaza si ya es
      miembro o admin, y crea la organización y la membresía `organizer`, igual
      que hace el trigger de `0005_organizer_signup.sql`.
    - Una página `/login/completar` que pida nombre, apellidos (rellenos con
      `given_name` / `family_name` de Google) y nombre del grupo, llame a esa
      función y continúe a `/login/mfa`.
    - En `/login/mfa`, si hay sesión pero no es personal, redirigir a
      `/login/completar` en lugar de a `/login`.
11. Pruebas: función SQL (crea una sola vez; rechaza anónimos, correos sin
    verificar, nombres vacíos y personal ya asignado) y la acción del
    formulario.

Si alguien ya tenía cuenta con correo y contraseña y entra con Google con el
mismo correo, Supabase une ambas: misma cuenta y mismo grupo.
