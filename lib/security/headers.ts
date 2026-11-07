export function securityHeaders(production: boolean) {
  // Inline scripts are emitted by Next; strict nonce policy is set by Proxy.
  return [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'no-referrer' },
    { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
    ...(production ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000' }] : []),
  ]
}

/** Origen de Supabase para connect-src: la sala de espera lo consulta directamente desde el navegador. */
function supabaseOrigin(url?: string) {
  try { return url ? new URL(url).origin : '' } catch { return '' }
}

export function contentSecurityPolicy(nonce: string, development: boolean, supabaseUrl?: string) {
  const supabase = supabaseOrigin(supabaseUrl)
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${development ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'", // Ticket templates intentionally use inline styles.
    "img-src 'self' data: blob: https: http:",
    "font-src 'self'", `connect-src 'self'${supabase ? ` ${supabase}` : ''}`, "worker-src 'self' blob:",
    "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
    ...(development ? [] : ['upgrade-insecure-requests']),
  ].join('; ')
}
