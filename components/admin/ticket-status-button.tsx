'use client'

import { useTransition } from 'react'
import { setTicketStatus } from '@/app/admin/eventos/actions'
import { Button } from '@/components/ui/button'
import type { TicketStatus } from '@/types/database'

const NEXT_ACTIONS: Record<TicketStatus, { status: TicketStatus; label: string; confirm?: string }[]> = {
  valid: [{ status: 'cancelled', label: 'Anular', confirm: '¿Anular esta entrada? Dejará de ser válida.' }],
  used: [{ status: 'valid', label: 'Deshacer entrada', confirm: '¿Marcar como no usada?' }],
  cancelled: [{ status: 'valid', label: 'Reactivar' }],
}

export function TicketStatusButton({ eventId, ticketId, status }: { eventId: string; ticketId: string; status: TicketStatus }) {
  const [pending, startTransition] = useTransition()

  return (
    <>
      {NEXT_ACTIONS[status].map((action) => (
        <Button
          key={action.status}
          type="button"
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => {
            if (action.confirm && !confirm(action.confirm)) return
            startTransition(async () => {
              const result = await setTicketStatus(eventId, ticketId, action.status)
              if (result.error) alert(result.error)
            })
          }}
        >
          {action.label}
        </Button>
      ))}
    </>
  )
}
