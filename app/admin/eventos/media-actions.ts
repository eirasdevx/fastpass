'use server'

import { getAdmin } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { DEMO_MODE } from '@/lib/demo/mode'
import { siteUrl } from '@/lib/site-url'
import { COVER_BUCKET, removeCovers } from '@/lib/covers'
import { z } from 'zod'

/**
 * Permiso de un solo uso para subir una portada desde el navegador, que no tiene acceso a la
 * sesión (sus cookies son httpOnly). La imagen ya llega reducida y no pasa por este servidor.
 */
export async function createCoverUpload(format: 'webp' | 'jpeg'): Promise<{ error?: string; path?: string; token?: string; url?: string }> {
  const admin = await getAdmin()
  if (!admin) return { error: 'No autorizado' }
  if (DEMO_MODE) return { error: 'En la versión de demostración no se pueden subir imágenes: pega una dirección (URL).' }
  if (format !== 'webp' && format !== 'jpeg') return { error: 'Formato no válido' }
  const path = `${admin.id}/${crypto.randomUUID()}.${format === 'webp' ? 'webp' : 'jpg'}`
  const storage = (await createClient()).storage.from(COVER_BUCKET)
  const { data, error } = await storage.createSignedUploadUrl(path)
  if (error || !data) return { error: 'No se pudo preparar la subida. Si acabas de actualizar la aplicación, aplica la migración 0019.' }
  return { path, token: data.token, url: storage.getPublicUrl(path).data.publicUrl }
}

/** Borra una portada subida en el formulario y descartada antes de guardar (si ningún evento la usa). */
export async function discardCover(url: string) {
  if (!(await getAdmin())) return
  await removeCovers(await createClient(), [url])
}

export type Place = { label: string; latitude: number; longitude: number }

const placesSchema = z.array(z.object({ display_name: z.string(), lat: z.coerce.number(), lon: z.coerce.number() }))

/**
 * Busca una dirección en OpenStreetMap (Nominatim). Se hace desde el servidor para identificar
 * la aplicación como pide su política de uso y no abrir la web a otro dominio.
 */
export async function searchPlace(query: string): Promise<{ error?: string; places?: Place[] }> {
  if (!(await getAdmin())) return { error: 'No autorizado' }
  const q = typeof query === 'string' ? query.trim() : ''
  if (q.length < 3 || q.length > 200) return { error: 'Escribe al menos 3 letras.' }
  const url = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({ q, format: 'jsonv2', limit: '5', 'accept-language': 'es' })}`
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': `FastPass/1.0 (${await siteUrl()})` },
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 86400 },
    })
    if (!response.ok) return { error: 'El buscador de direcciones no responde. Marca el punto en el mapa a mano.' }
    const parsed = placesSchema.safeParse(await response.json())
    if (!parsed.success) return { error: 'No se pudo leer la respuesta del buscador.' }
    return { places: parsed.data.map((p) => ({ label: p.display_name.slice(0, 300), latitude: p.lat, longitude: p.lon })) }
  } catch {
    return { error: 'El buscador de direcciones no responde. Marca el punto en el mapa a mano.' }
  }
}
