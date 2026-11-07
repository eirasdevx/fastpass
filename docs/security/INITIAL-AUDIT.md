# Auditoría inicial — 19 de octubre de 2026

Estado anterior a las correcciones. Revisión estática del directorio entregado; no hay `.git`, historial, infraestructura ni conexión de producción verificada. No se han leído valores de credenciales ni enviado peticiones a Supabase. El entorno local declara modo demo. El usuario confirma que solo existen datos de demostración.

## Arquitectura encontrada

Next.js 16.3.6 App Router/Server Actions/Proxy, React 19.2.8, TypeScript, Tailwind 4; Supabase JS 2.117.2 y SSR 0.12.7, Auth y PostgreSQL con RLS, sin ORM. Versiones declaradas en package.json; inventario exacto en lockfile/SBOM. Zod valida entradas del servidor. QR: qrcode.react y @yudiel/react-qr-scanner. Dos backends: PostgreSQL y una imitación en memoria, sin aislamiento por proceso/instancia. No hay Stripe, Bizum, webhook, reservas, colas, almacenamiento de ficheros ni exportaciones. Imágenes por URL externa. Vercel aparece en README, no demuestra hosting real. No hay pipeline presente.

## Hallazgos confirmados

| ID / gravedad | Ubicación inicial | Evidencia y explotación | Impacto / corrección propuesta |
|---|---|---|---|
| S01 CRÍTICO para multi-tenant | 0001_init.sql: is_admin, políticas `*: admin`; lib/auth.ts:getAdmin | Basta figurar en admins: todas las filas de eventos, pedidos, entradas y plantillas son accesibles y modificables. No existe propietario ni membresía. | Lectura/borrado entre organizadores. Introducir pertenencia y permisos RLS y en RPC, probar dos organizaciones; no asignar propietarios de datos reales automáticamente. |
| S02 ALTO | 0001_init.sql:purchase_tickets; README:Pagos | Emite entradas valid aunque ticket_types.price > 0. No hay estado de pago ni proveedor. No es un bypass de Stripe, que no existe. | Entrada con precio obtenida sin pago. Bloquear emisión con precio en backend real hasta integrar checkout/webhook; conservar simulación demo explícita. |
| S03 ALTO | 0001_init.sql:purchase_tickets; lib/demo/client.ts:purchaseTickets | Cada elemento comprueba max_per_order por separado. Repetir ticket_type_id elude el límite; la demo cuenta solo tickets ya guardados y permite además sobreventa con duplicados. | Abuso de cupos y sobreventa demo. Rechazar duplicados, limitar líneas y suma, comprobar también RPC directa. |
| S04 ALTO | app/admin/eventos/actions.ts:setTicketStatus; 0001_init.sql:políticas entradas/tipos | Cancelar libera cupo; otra compra ocupa ese cupo; actualizar cancelled→valid no comprueba capacidad. También se puede bajar capacity por debajo de vendidos. | Sobreventa incluso con bloqueo correcto de purchase_tickets. Invariantes DB para todas las escrituras y pruebas de concurrencia. |
| S05 ALTO si se despliega demo | lib/demo/mode.ts; client.ts:currentUser/signInWithPassword | NEXT_PUBLIC_DEMO_MODE activa login arbitrario, cookie sin firma y almacén sin RLS; no hay barrera para producción. | No usar demo con datos reales. Bloqueo explícito en producción y comprobación automática. |
| S06 ALTO | lib/auth.ts; 0001_init.sql:is_admin | Solo contraseña y fila admins, sin AAL2. | Falta MFA obligatorio para privilegios. Preparar inscripción/desafío y RLS AAL2, con pruebas; requiere factores reales para validación extremo a extremo. |
| S07 ALTO | purchase_tickets/validate_ticket; acciones login/compra | No hay límites propios de frecuencia. RPC de compra se concede a anon, por lo que limitar solo Next no protege la BD. | Agotamiento de entradas/recursos. Límites persistentes en frontera real y controles de Auth/WAF; no confundir memoria local con protección distribuida. |
| S08 MEDIO | acciones admin/compra/validación; app/admin/error.tsx | Se devuelven error.message del proveedor y el error administrativo muestra error.message. | Exposición de información de diagnóstico. Mensajes controlados, logging de categorías sin payloads/secretos. |
| S09 MEDIO | next.config.ts vacío; /entradas/[token] | No se configuran CSP, Referrer-Policy, HSTS ni política explícita de caché privada. El enlace de pedido es una credencial bearer. | Defensa de navegador y riesgo de filtración por navegación/logs. Cabeceras, no-store y exclusión de logs de rutas/tokens. No se ha demostrado fuga concreta. |
| S10 MEDIO | 0001_init.sql:tickets.code; lib/demo/store.ts:newTicketCode | SQL reduce a 64 bits; demo trunca UUID incluyendo bits fijos. Tokens recuperables en claro. | Incrementar entropía para nuevas entradas sin invalidar antiguas. Hash exclusivo requiere resolver reimpresión de QR, no destruir existentes. |
| S11 MEDIO | purchaseSchema y purchase_tickets; acciones con IDs/status | Sin máximo total ni longitud email en RPC; casts y TS no sustituyen validación runtime, status solo tiene tipo TypeScript. | Validación acotada en ambas fronteras; sin asignación masiva del objeto original. |
| S12 BAJO | validate_ticket: rama wrong_event | Devuelve nombre del asistente y detalles incluso al rechazar evento equivocado. | Minimización: devolver únicamente resultado/código en rechazo. |

## Controles presentes / no vulnerabilidades demostradas

Server Actions privadas llaman getAdmin; getUser valida identidad con Supabase. RLS activada en seis tablas y acceso directo anónimo a pedidos/entradas denegado por políticas. Token UUID aleatorio para recuperar pedido; conocer order.id no sustituye access_token. Queries SDK parametrizadas, no concatenación SQL de datos. React escapa texto, sin dangerouslySetInnerHTML. No se encontraron rutas de subida, shell/exec de entrada del usuario, fetch de URL suministrada al servidor, CORS comodín ni service_role en lógica de aplicación. No inventar SQLi, SSRF, command injection, path traversal o XSS explotable.

purchase_tickets usa FOR UPDATE por tipo y transacción: compras ordinarias concurrentes están protegidas por tipo; no hay aforo total de evento. validate_ticket bloquea la fila antes de cambiar status: el primer escaneo está diseñado para ser atómico. Pendiente prueba real con conexiones independientes. Next valida Origin/Host de Server Actions: mantener control y tamaño acotado. La redirección login empieza por /admin y no se ha demostrado redirección externa.

## Riesgos potenciales y controles no verificables

Dependencias: primera consulta npm audit falló por conectividad; no equivale a cero vulnerabilidades. Sin Git no se puede auditar historia ni secretos previamente publicados. .env está ignorado; no demuestra rotación o separación de entornos. No se verificaron TLS, cifrado de disco/backups, restauraciones, RLS desplegada, factores MFA, caducidad/revocación real de sesiones, configuración Auth/CAPTCHA, contratos de tratamiento, retención o cookies del despliegue.

No existen pagos, Connect, reembolsos, webhooks ni conciliación: no aplican pruebas de idempotencia de pagos a este código. Bloqueantes para ventas monetarias. Falta organization_id/roles de acceso: bloqueante para varios organizadores. No hay mediciones de capacidad para 10.000 usuarios o entradas. RGPD/LOPDGDD necesitan revisión organizativa y jurídica además del código.

## Método y referencias

Revisión orientada a OWASP Top 10/API Top 10 y controles ASVS, sin pretender certificación. Guías Next instaladas: data-security, CSP y headers. Referencias oficiales consultadas: [RLS Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security), [MFA](https://supabase.com/docs/guides/auth/auth-mfa), [límites Auth](https://supabase.com/docs/guides/auth/rate-limits), [producción Supabase](https://supabase.com/docs/guides/deployment/going-into-prod), [brechas AEPD](https://www.aepd.es/preguntas-frecuentes/2-tus-obligaciones-como-responsable-del-tratamiento/11-brechas-de-datos-personales/FAQ-0233-a-quien-hay-que-notificar-las-brechas-de-datos-personales).
