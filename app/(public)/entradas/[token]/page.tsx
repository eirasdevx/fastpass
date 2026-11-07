import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { TemplatedTicket } from '@/components/ticket/ticket-card'
import { OrderActions } from '@/components/ticket/order-actions'
import type { TicketStatus } from '@/types/database'
import { Check, ShieldCheck } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Tus entradas',
  robots: { index: false, follow: false }, // el enlace es privado
}

type OrderView = {
  buyer_name: string
  buyer_email: string
  event: { title: string; slug: string; venue: string; starts_at: string }
  tickets: {
    code: string
    short_code?: string
    status: TicketStatus
    attendee_name: string
    type_name: string
    type_description: string
    price: number
    design: unknown
    description_template: string | null
  }[]
}

export default async function OrderPage(props: PageProps<'/entradas/[token]'>) {
  const { token } = await props.params
  const { nuevo } = await props.searchParams
  if (!z.uuid().safeParse(token).success) notFound()

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_order', { p_token: token })
  if (error) throw new Error('No se pudo cargar la información.')
  if (!data) notFound()

  const order = data as unknown as OrderView

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-12">
      <div className="no-print space-y-6">
        {nuevo && (
          <div role="status" className="border-success/40 bg-success/10 rounded-lg border p-4 text-sm">
            <p className="font-semibold">¡Listo, {order.buyer_name}! Tus entradas están emitidas.</p>
            <p className="mt-1">
              Guarda o copia el enlace de esta página: es la única forma de volver a ver tus entradas.
            </p>
          </div>
        )}
        <div className="text-center">
          <span className="mx-auto mb-5 grid size-16 place-items-center rounded-full border border-success/30 bg-success/10 text-success"><Check className="size-8" aria-hidden /></span>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">¡Ya tienes tus entradas!</h1>
          <p className="mt-3 text-muted-foreground">
            {order.tickets.length} {order.tickets.length === 1 ? 'entrada' : 'entradas'} para {order.event.title}
          </p>
          <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-card px-4 py-2 text-xs text-success"><ShieldCheck className="size-4" aria-hidden />Presenta tu código QR en el acceso</p>
        </div>
        <OrderActions />
      </div>

      <ul className="space-y-6">
        {order.tickets.map((ticket) => (
          <li key={ticket.code} className="print-ticket">
            <TemplatedTicket
              design={ticket.design}
              descriptionTemplate={ticket.description_template ?? ''}
              data={{
                eventTitle: order.event.title,
                startsAt: order.event.starts_at,
                venue: order.event.venue,
                typeName: ticket.type_name,
                typeDescription: ticket.type_description,
                price: Number(ticket.price),
                attendeeName: ticket.attendee_name,
                code: ticket.code,
                shortCode: ticket.short_code,
                status: ticket.status,
              }}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}
