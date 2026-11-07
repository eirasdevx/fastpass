import 'server-only'
import { headers } from 'next/headers'

/**
 * Dirección pública de la web para los enlaces de los correos de Supabase.
 * En producción exige NEXT_PUBLIC_SITE_URL: las cabeceras de una petición no
 * son una fuente de confianza para enlaces de recuperación o confirmación.
 */
export async function siteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL
  const invalid = () => new Error('Configura NEXT_PUBLIC_SITE_URL con el origen HTTPS público de la aplicación.')
  if (configured) {
    let url: URL
    try { url = new URL(configured) } catch { throw invalid() }
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    const allowedHttp = process.env.NODE_ENV !== 'production' && local && url.protocol === 'http:'
    if ((url.protocol !== 'https:' && !allowedHttp) || url.username || url.password
      || url.pathname !== '/' || url.search || url.hash) throw invalid()
    return url.origin
  }
  if (process.env.NODE_ENV === 'production') throw invalid()
  const h = await headers()
  const host = h.get('host') ?? 'localhost:3000'
  if (!/^(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?$/.test(host)) throw invalid()
  try { return new URL(`http://${host}`).origin } catch { throw invalid() }
}
