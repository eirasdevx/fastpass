'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ShieldCheck } from 'lucide-react'
import { purgeEventPersonalData } from '@/app/admin/reservas/actions'
import { formatDate, formatDateTime } from '@/lib/format'
import { Button } from '@/components/ui/button'

/** Plazo de conservación de los datos personales del evento y borrado anticipado. */
export function PersonalDataPanel({ eventId, endsAt, retentionDays, purgedAt, finished }: {
  eventId: string; endsAt: string; retentionDays: number; purgedAt: string | null; finished: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition(), [error, setError] = useState('')
  const dueAt = new Date(new Date(endsAt).getTime() + retentionDays * 86400000).toISOString()

  return (
    <section className="bg-card flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 text-sm shadow-xs">
      <div className="flex items-start gap-3">
        <span className="bg-secondary text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-xl"><ShieldCheck className="size-5" aria-hidden /></span>
        <div>
          <p className="font-medium">Datos personales</p>
          <p className="text-muted-foreground">
            {purgedAt
              ? `Borrados el ${formatDateTime(purgedAt)}. Se conservan cantidades, importes y entregas, sin nombres.`
              : `Nombres, correos, teléfonos, DNI y fechas de nacimiento se borrarán automáticamente el ${formatDate(dueAt)} (${retentionDays} días después del evento).`}
          </p>
          {error && <p role="alert" className="text-destructive mt-1">{error}</p>}
        </div>
      </div>
      {!purgedAt && finished && (
        <Button variant="outline" size="sm" disabled={pending} onClick={() => {
          if (!confirm('¿Borrar ya los datos personales de este evento? Se borran nombres, correos, teléfonos, DNI y fechas de nacimiento de todas las reservas e inscripciones, y sus enlaces dejan de funcionar. No se puede deshacer.')) return
          start(async () => {
            const r = await purgeEventPersonalData(eventId)
            if (r.error) setError(r.error)
            else router.refresh()
          })
        }}>{pending ? 'Borrando…' : 'Borrar datos ahora'}</Button>
      )}
    </section>
  )
}
