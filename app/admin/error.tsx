'use client'

import Link from 'next/link'
import { TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // En producción Next.js oculta el mensaje real; en desarrollo ayuda a saber qué falta (p. ej. una migración).
  const detail = process.env.NODE_ENV === 'development' ? error.message : null
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
      <span className="bg-destructive/10 text-destructive flex size-14 items-center justify-center rounded-full"><TriangleAlert className="size-7" aria-hidden /></span>
      <div className="space-y-1">
        <h1 className="text-xl font-bold">No se pudo cargar esta sección</h1>
        <p className="text-muted-foreground text-sm">{detail || 'Comprueba la conexión e inténtalo de nuevo en unos segundos.'}</p>
        {error.digest && <p className="text-muted-foreground text-xs">Referencia: {error.digest}</p>}
      </div>
      <div className="flex gap-2">
        <Button onClick={reset}>Reintentar</Button>
        <Button asChild variant="outline"><Link href="/admin">Ir al resumen</Link></Button>
      </div>
    </div>
  )
}
