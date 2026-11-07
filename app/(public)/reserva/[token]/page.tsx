import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { privateTokenSchema } from '@/lib/validations/registration'
import { itemName, reservationStatusLabels, type ReservationSummary } from '@/lib/reservations'
import { parseBlockDesign, reservationPreset } from '@/lib/tickets/blocks'
import { reservationVariables } from '@/lib/tickets/template-data'
import { siteUrl } from '@/lib/site-url'
import { BlockCard } from '@/components/ticket/block-card'
import { OrderActions } from '@/components/ticket/order-actions'
import { Badge } from '@/components/ui/badge'

const badgeVariant = { pending_pickup: 'warning', partially_picked_up: 'warning', completed: 'success', cancelled: 'destructive', expired: 'destructive' } as const
const stamps = { completed: 'Recogida', cancelled: 'Cancelada', expired: 'Caducada' } as const

export const metadata: Metadata = { title: 'Justificante de reserva', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function ReservationReceiptPage({ params, searchParams }: {
  params: Promise<{ token: string }>; searchParams: Promise<{ nueva?: string }>
}) {
  const { token } = await params
  if (!privateTokenSchema.safeParse(token).success) notFound()
  const db = await createClient()
  const { data, error } = await db.rpc('get_reservation', { p_token: token })
  if (error) throw new Error('No se pudo consultar la reserva. Inténtalo de nuevo.')
  if (!data) notFound()
  const r = data as unknown as ReservationSummary
  const { nueva } = await searchParams
  const active = r.status === 'pending_pickup' || r.status === 'partially_picked_up'
  // La plantilla del tipo o, si no tiene, la de por defecto. Siempre como justificante: lleva el aviso obligatorio.
  const design = { ...(parseBlockDesign(r.design) ?? reservationPreset()), kind: 'reservation' as const }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      {nueva && (
        <div role="status" className="no-print bg-success/10 rounded-xl border p-4 text-sm">
          <strong>Reserva confirmada.</strong> Guarda este enlace o el PDF: es la forma de consultar tu reserva y lo
          necesitarás para recoger tus {itemName(r.item_name)}. No se envía por correo.
        </div>
      )}
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <OrderActions />
        <Badge variant={badgeVariant[r.status]}>{reservationStatusLabels[r.status]}</Badge>
      </div>
      <BlockCard design={design} vars={reservationVariables(r)} shortCode={r.code}
        qrValue={active ? `${await siteUrl()}/reserva/${token}` : null}
        stamp={r.status in stamps ? stamps[r.status as keyof typeof stamps] : null} />
    </div>
  )
}
