import 'server-only'
import { DEMO_MODE } from '@/lib/demo/mode'
import type { createClient } from '@/lib/supabase/server'

export const COVER_BUCKET = 'event-covers'

type Client = Awaited<ReturnType<typeof createClient>>

/** Ruta dentro del bucket si la URL es una portada subida a esta web; si no (URL externa), null. */
export function coverPath(url: unknown) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, '')
  if (!base || typeof url !== 'string') return null
  const prefix = `${base}/storage/v1/object/public/${COVER_BUCKET}/`
  if (!url.startsWith(prefix)) return null
  const path = url.slice(prefix.length)
  return /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(webp|jpg)$/.test(path) ? path : null
}

/**
 * Borra portadas que ya no se usan. La base de datos se niega si algún evento todavía la usa,
 * así que nunca desaparece una portada en uso. Si falla no se avisa: solo queda un archivo de más.
 */
export async function removeCovers(db: Client, urls: unknown[]) {
  const paths = [...new Set(urls.map(coverPath).filter((p): p is string => !!p))]
  if (DEMO_MODE || !paths.length) return
  try { await db.storage.from(COVER_BUCKET).remove(paths) } catch { /* sin efecto para quien usa la web */ }
}
