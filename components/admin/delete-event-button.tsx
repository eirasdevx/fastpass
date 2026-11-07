'use client'

import { useTransition } from 'react'
import { Trash2 } from 'lucide-react'
import { deleteEvent } from '@/app/admin/eventos/actions'
import { Button } from '@/components/ui/button'

export function DeleteEventButton({ eventId, ticketCount }: { eventId: string; ticketCount: number }) {
  const [pending, startTransition] = useTransition()

  const onClick = () => {
    const warning =
      ticketCount > 0
        ? `Este evento tiene ${ticketCount} entradas emitidas que también se borrarán. ¿Seguro?`
        : '¿Borrar este evento?'
    if (!confirm(warning)) return
    startTransition(async () => {
      const result = await deleteEvent(eventId)
      if (result?.error) alert(result.error)
    })
  }

  return (
    <Button type="button" variant="outline" size="sm" className="text-destructive" onClick={onClick} disabled={pending}>
      <Trash2 /> {pending ? 'Borrando…' : 'Borrar evento'}
    </Button>
  )
}
