// Versión beta sin base de datos: `NEXT_PUBLIC_DEMO_MODE=true` en .env.local.
// Todo se sirve desde datos de ejemplo en memoria (lib/demo/store.ts) y los
// cambios se pierden al reiniciar el servidor.
// Este archivo no importa nada de servidor: lo usan también proxy.ts y los layouts.

export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'

/** Cookie que simula la sesión del organizador en modo demo. */
export const DEMO_SESSION_COOKIE = 'fastpass-demo-session'

export const DEMO_ADMIN_ID = '00000000-0000-4000-8000-00000000a001'

/** Pedido de ejemplo para ver cómo queda la página de entradas del cliente. */
export const DEMO_ORDER_TOKEN = '00000000-0000-4000-8f00-000000000001'
