import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CalendarDays, ChevronLeft, MapPin } from 'lucide-react'
import { EventCover } from '@/components/public/event-cover'
import { createClient } from '@/lib/supabase/server'
import { DEMO_MODE } from '@/lib/demo/mode'
import { formatDateTime } from '@/lib/format'
import { ReservationForm } from '@/components/public/reservation-form'
import { WaitingRoom } from '@/components/public/waiting-room'
import { itemName } from '@/lib/reservations'
import { ReadinessChecklist } from '@/components/admin/readiness-checklist'
import { formReadiness, publicClosedReason } from '@/lib/event-readiness'
import { getStaff } from '@/lib/auth'

export const metadata: Metadata = { title: 'Reservar' }
export const dynamic = 'force-dynamic'

export default async function ReservePage({ params }: { params: Promise<{ slug: string }> }) {
  if (DEMO_MODE) return <div className="mx-auto max-w-xl p-8">Las reservas requieren configurar Supabase.</div>
  const { slug } = await params, db = await createClient()
  const { data: event, error } = await db.from('events').select('*').eq('slug', slug).eq('published', true).maybeSingle()
  if (error) throw new Error('No se pudo cargar el evento.')
  if (!event || event.registration_mode !== 'pickup') notFound()
  const { data: types, error: typeError } = await db.from('ticket_types')
    .select('id,name,description,price,max_per_order').eq('event_id', event.id).eq('sales_open', true).order('price')
  if (typeError) throw new Error('No se pudieron cargar los tipos disponibles.')
  const item = itemName(event.pickup_item_name)

  const readiness = formReadiness(event, (types ?? []).length)
  const reason = publicClosedReason(readiness, event.reservations_open_at)
  // Solo la organización ve qué falta configurar.
  const staff = reason ? await getStaff() : null
  const organizer = staff && ['admin', 'organizer'].includes(staff.role)
  // La base de datos vuelve a comprobar todo al confirmar; esto solo orienta al usuario.
  const perPerson = event.max_per_person ?? 100
  const reservable = (types ?? []).map((t) => ({
    id: t.id, name: t.name, description: t.description, price: Number(t.price), maxQuantity: Math.min(t.max_per_order, perPerson),
  }))

  return (
    <div className={`mx-auto space-y-6 px-4 py-8 sm:px-6 sm:py-10 ${reason ? 'max-w-2xl' : 'max-w-5xl'}`}>
      <Link className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm" href={`/eventos/${slug}`}><ChevronLeft className="size-4" aria-hidden />Volver al evento</Link>
      <header className="flex items-center gap-4">
        <EventCover url={event.cover_url} title={event.title} className="hidden size-20 shrink-0 rounded-2xl sm:block" />
        <div className="min-w-0 space-y-1">
          <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">Reservar {item}</p>
          <h1 className="text-2xl font-bold tracking-tight text-balance sm:text-3xl">{event.title}</h1>
          <p className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <span className="inline-flex items-center gap-1.5"><CalendarDays className="size-4" aria-hidden />{formatDateTime(event.starts_at)}</span>
            {event.venue && <span className="inline-flex items-center gap-1.5"><MapPin className="size-4" aria-hidden />{event.venue}</span>}
          </p>
        </div>
      </header>
      {/* Cómo funciona, en tres pasos cortos. */}
      <ol className="grid gap-2 text-sm sm:grid-cols-3">
        {[['Reserva aquí', 'Sin pagar nada ahora.'], ['Recoge y paga', 'En persona, en el punto de recogida.'], [`Tus ${item} son tu entrada`, 'El justificante no da acceso.']].map(([title, text], i) => (
          <li key={title} className="bg-accent/10 flex items-start gap-3 rounded-xl border border-transparent p-3">
            <span className="bg-accent text-accent-foreground grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold">{i + 1}</span>
            <span><span className="block font-medium">{title}</span><span className="text-muted-foreground text-xs">{text}</span></span>
          </li>
        ))}
      </ol>
      {reason
        ? <div className="space-y-4">
            <p role="status" className="bg-card rounded-2xl border p-6">{reason}</p>
            {organizer && (
              <ReadinessChecklist open={false} items={readiness.items} pickup>
                <Link href={`/admin/eventos/${event.id}`} className="text-sm underline">Editar el evento</Link>
              </ReadinessChecklist>
            )}
          </div>
        : (() => {
            const form = {
              eventId: event.id, types: reservable, lastRequired: event.last_name_required ?? true, phoneRequired: event.phone_required ?? false, item,
              pickup: { address: event.pickup_address || null, deadline: event.pickup_deadline ?? null },
              rules: { attendee_details: event.attendee_details ?? false, require_document: event.require_document ?? false, require_birth_date: event.require_birth_date ?? false, min_age: event.min_age ?? null, last_name_required: event.last_name_required ?? true },
            }
            // Con sala de espera, el formulario solo aparece cuando llega el turno.
            return event.queue_enabled ? <WaitingRoom {...form} /> : <ReservationForm {...form} />
          })()}
    </div>
  )
}
