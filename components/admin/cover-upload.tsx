'use client'

import { useRef, useState } from 'react'
import { ImagePlus, Trash2 } from 'lucide-react'
import { createCoverUpload, discardCover } from '@/app/admin/eventos/media-actions'
import { createClient } from '@/lib/supabase/client'
import { DEMO_MODE } from '@/lib/demo/mode'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

const MAX_SIDE = 1600 // px del lado mayor: nítida en pantallas grandes y ligera en el móvil
const MAX_INPUT = 25 * 1024 * 1024

/** Reduce la imagen en el navegador y la convierte a WebP (o JPEG si el navegador no sabe). */
async function shrink(file: File): Promise<{ blob: Blob; format: 'webp' | 'jpeg' }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const encode = (type: string, quality: number) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality))
  const webp = await encode('image/webp', 0.82)
  if (webp?.type === 'image/webp') return { blob: webp, format: 'webp' }
  const jpeg = await encode('image/jpeg', 0.85)
  if (!jpeg) throw new Error('encode')
  return { blob: jpeg, format: 'jpeg' }
}

/** Portada del evento: arrastrar y soltar (o elegir) una imagen, o pegar una dirección. */
export function CoverUpload({ value, onChange, error }: { value: string; onChange: (url: string) => void; error?: string }) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const [status, setStatus] = useState<{ busy?: boolean; error?: string; info?: string }>({})
  // Imágenes subidas ahora y aún sin guardar: si se cambian o se quitan, no sirven para nada.
  const unsaved = useRef(new Set<string>())
  const replace = (url: string) => {
    if (value && unsaved.current.delete(value)) void discardCover(value).catch(() => {})
    onChange(url)
  }

  const upload = async (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) { setStatus({ error: 'Ese archivo no es una imagen.' }); return }
    if (file.size > MAX_INPUT) { setStatus({ error: 'La imagen es demasiado grande (máximo 25 MB).' }); return }
    setStatus({ busy: true })
    try {
      const { blob, format } = await shrink(file).catch(() => { throw new Error('Este navegador no puede abrir ese formato. Prueba con JPG, PNG o WebP.') })
      const ticket = await createCoverUpload(format)
      if (ticket.error || !ticket.path || !ticket.token || !ticket.url) throw new Error(ticket.error ?? 'No se pudo subir la imagen.')
      const { error: uploadError } = await createClient().storage.from('event-covers')
        .uploadToSignedUrl(ticket.path, ticket.token, blob, { contentType: blob.type, cacheControl: '31536000' })
      if (uploadError) throw new Error('No se pudo subir la imagen. Inténtalo de nuevo.')
      unsaved.current.add(ticket.url)
      replace(ticket.url)
      setStatus({ info: `Imagen reducida a ${Math.round(blob.size / 1024)} KB (antes ${Math.round(file.size / 1024)} KB).` })
    } catch (e) {
      setStatus({ error: e instanceof Error && e.message ? e.message : 'No se pudo subir la imagen.' })
    }
  }

  return (
    <div className="grid gap-2">
      {!DEMO_MODE && (
        <div
          onDragOver={(e) => { e.preventDefault(); setOver(true) }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); void upload(e.dataTransfer.files[0]) }}
          className={cn('relative grid min-h-44 place-items-center overflow-hidden rounded-xl border-2 border-dashed p-4 text-center transition',
            over ? 'border-primary bg-primary/10' : 'hover:border-primary/60', error && 'border-destructive')}
        >
          {value && <div aria-hidden className="absolute inset-0 bg-cover bg-center opacity-40" style={{ backgroundImage: `url(${JSON.stringify(value)})` }} />}
          <div className="relative grid justify-items-center gap-2">
            <ImagePlus className="text-primary size-8" aria-hidden />
            <p className="text-sm font-medium">{status.busy ? 'Reduciendo y subiendo la imagen…' : over ? 'Suelta la imagen aquí' : 'Arrastra aquí la imagen de portada'}</p>
            <p className="text-muted-foreground text-xs">Se reduce sola (máx. {MAX_SIDE} px). Formato horizontal, mejor 16:9.</p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button type="button" variant="outline" size="sm" disabled={status.busy} onClick={() => input.current?.click()}>{value ? 'Cambiar imagen' : 'Elegir imagen'}</Button>
              {value && <Button type="button" variant="ghost" size="sm" disabled={status.busy} onClick={() => { replace(''); setStatus({}) }}><Trash2 className="size-4" aria-hidden />Quitar</Button>}
            </div>
          </div>
          <input ref={input} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden
            onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = '' }} />
        </div>
      )}
      {status.error && <p role="alert" className="text-destructive text-sm">{status.error}</p>}
      {status.info && <p role="status" className="text-success text-sm">{status.info}</p>}
      <details className="text-sm" open={DEMO_MODE || undefined}>
        <summary className="text-muted-foreground cursor-pointer">O pega la dirección (URL) de una imagen</summary>
        <Input id="cover_url" type="url" className="mt-2" placeholder="https://…" value={value} aria-invalid={!!error} onChange={(e) => onChange(e.target.value)} />
      </details>
    </div>
  )
}
