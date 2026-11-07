import type { Metadata } from 'next'
import { cache } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { notFound } from 'next/navigation'
import { CalendarDays, MapPin } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { formatDate, formatPrice, formatTime, isPast } from '@/lib/format'
import { EventMap } from '@/components/map/event-map'
import { EventCover } from '@/components/public/event-cover'
import { PurchaseForm, type PurchasableType } from '@/components/purchase/purchase-form'
import { itemName } from '@/lib/reservations'

// cache: el título de la pestaña y la página comparten una sola consulta por visita.
const getEvent = cache(async (slug: string) => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('events')
    .select(
      '*, ticket_types(id, name, description, price, capacity, max_per_order, sales_open)'
    )
    .eq('slug', slug)
    .eq('published', true)
    .maybeSingle()
  if (error) throw new Error('No se pudo cargar la información.')
  return data
})

export async function generateMetadata(props: PageProps<'/eventos/[slug]'>): Promise<Metadata> {
  const { slug } = await props.params
  const event = await getEvent(slug)
  if (!event) return { title: 'Evento no encontrado' }
  return { title: event.title, description: event.description.slice(0, 160) }
}

export default async function EventPage(props: PageProps<'/eventos/[slug]'>) {
  const { slug } = await props.params
  const event = await getEvent(slug)
  if (!event) notFound()

  const supabase = await createClient()
  const { data: stats, error } = await supabase.rpc('event_ticket_stats', { p_event_id: event.id })
  if (error) throw new Error('No se pudo cargar la información.')

  const soldById = new Map(stats.map((s) => [s.ticket_type_id, s.sold]))
  const finished = isPast(event.ends_at ?? event.starts_at)

  const types: PurchasableType[] = [...event.ticket_types]
    .sort((a, b) => a.price - b.price)
    .map((t) => {
      const remaining = t.capacity === null ? Infinity : t.capacity - (soldById.get(t.id) ?? 0)
      return {
        id: t.id,
        name: t.name,
        description: t.description,
        price: Number(t.price),
        salesOpen: t.sales_open && !finished,
        maxQuantity: Math.max(0, Math.min(t.max_per_order, remaining)),
      }
    })

  return (
    <article>
      <div className="relative">
        <EventCover url={event.cover_url} title={event.title} className="h-72 sm:h-[460px]" />
        <div aria-hidden className="from-background absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t to-transparent" />
      </div>
      <div className="mx-auto -mt-28 grid max-w-[1280px] gap-10 px-4 pb-12 sm:px-6 lg:grid-cols-[1fr_420px]">
        <div className="relative space-y-5">
          <h1 className="text-3xl font-bold tracking-tight text-balance sm:text-5xl uppercase">{event.title}</h1>
          <div className="text-muted-foreground flex flex-wrap gap-x-6 gap-y-2">
            <p className="flex items-center gap-2 first-letter:uppercase">
              <CalendarDays className="size-4 shrink-0" />
              <span className="first-letter:uppercase">
                {formatDate(event.starts_at)} · {formatTime(event.starts_at)}
                {event.ends_at && ` – ${formatTime(event.ends_at)}`}
              </span>
            </p>
            {event.venue && (
              <p className="flex items-center gap-2">
                <MapPin className="size-4 shrink-0" /> {event.venue}
              </p>
            )}
          </div>
          {event.description && <p className="max-w-prose text-base leading-relaxed whitespace-pre-line sm:text-lg">{event.description}</p>}
          {event.latitude != null && event.longitude != null && (
            <section aria-labelledby="ubicacion" className="space-y-3 pt-2">
              <h2 id="ubicacion" className="text-lg font-semibold">Ubicación</h2>
              <EventMap latitude={event.latitude} longitude={event.longitude} label={event.venue || event.title} />
            </section>
          )}
        </div>

        <section aria-labelledby="comprar" className="bg-card relative h-fit rounded-2xl border border-primary/15 p-6 shadow-2xl lg:sticky lg:top-24">
          <h2 id="comprar" className="mb-4 text-lg font-semibold">
            {finished ? 'Este evento ya ha terminado' : 'Consigue tus entradas'}
          </h2>
          {event.registration_mode === 'pickup' ? (
            event.registration_enabled && !finished ? (
              <div className="space-y-4 text-sm">
                <p className="text-muted-foreground">Reserva online y paga en persona al recoger tus {itemName(event.pickup_item_name)}, que serán tu entrada al evento.</p>
                {types.length > 0 && (
                  <ul className="divide-y rounded-xl border">
                    {types.map((t) => (
                      <li key={t.id} className="flex items-center justify-between gap-3 p-3"><span className="font-medium">{t.name}</span><strong className="text-base tabular-nums">{formatPrice(t.price)}</strong></li>
                    ))}
                  </ul>
                )}
                {event.pickup_address && <p className="flex gap-2"><MapPin className="mt-0.5 size-4 shrink-0" /> Recogida en {event.pickup_address}</p>}
                <Button asChild size="lg" className="w-full"><Link href={`/eventos/${slug}/reservar`}>Reservar {itemName(event.pickup_item_name)}</Link></Button>
              </div>
            ) : <p>Las reservas no están disponibles.</p>
          ) : event.registration_enabled ? <div className="space-y-4"><p className="text-sm text-muted-foreground">Completa la inscripción individual para solicitar tu entrada.</p><Button asChild><Link href={`/eventos/${slug}/registro`}>Inscribirme al evento</Link></Button></div> : ['closed','finished','cancelled'].includes(event.status??'') ? <p>Las inscripciones están cerradas.</p> : types.length === 0 ? (
            <p className="text-muted-foreground text-sm">Todavía no hay entradas a la venta.</p>
          ) : (
            <PurchaseForm eventId={event.id} types={types} />
          )}
        </section>
      </div>
    </article>
  )
}
