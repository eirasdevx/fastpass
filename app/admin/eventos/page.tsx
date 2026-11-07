import { requireAdmin } from '@/lib/auth'
import type { Metadata } from 'next'
import Link from 'next/link'
import { CalendarDays, CalendarPlus, ChevronRight, MapPin, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { formatDateTime, isPast } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState, PageHeader } from '@/components/admin/page-kit'
import { EventCover } from '@/components/public/event-cover'
import { eventStatusLabels } from '@/lib/registrations'
import { itemName } from '@/lib/reservations'
import { DEMO_MODE } from '@/lib/demo/mode'

export const metadata: Metadata = { title: 'Eventos' }

type Status = keyof typeof eventStatusLabels
const VARIANT: Record<Status, 'success' | 'secondary' | 'warning' | 'destructive'> = {
  draft: 'warning', published: 'success', live: 'success', closed: 'secondary', finished: 'secondary', cancelled: 'destructive',
}

export default async function AdminEventsPage() {
  const admin = await requireAdmin()
  const supabase = await createClient()
  const query = supabase
    .from('events')
    .select('*, tickets(count)')
    .order('starts_at', { ascending: false })
  if (admin.role !== 'admin') {
    const { data: org } = await supabase.rpc('current_organization_id')
    query.eq('organization_id', org ?? '00000000-0000-4000-8000-000000000000')
  }
  const { data: events, error } = await query

  if (error) throw new Error('No se pudo cargar la información.')
  // Reservas por evento (la versión demo no tiene reservas). RLS ya limita a los eventos que gestiona.
  const reservationCount = new Map<string, number>()
  if (!DEMO_MODE && events.some((e) => e.registration_mode === 'pickup')) {
    const { data } = await supabase.from('reservations').select('event_id').in('event_id', events.filter((e) => e.registration_mode === 'pickup').map((e) => e.id))
    for (const r of data ?? []) reservationCount.set(r.event_id, (reservationCount.get(r.event_id) ?? 0) + 1)
  }
  // Próximos primero (del más cercano al más lejano) y después los pasados.
  const upcoming = events.filter((e) => !isPast(e.ends_at ?? e.starts_at)).reverse()
  const past = events.filter((e) => isPast(e.ends_at ?? e.starts_at))

  const card = (event: (typeof events)[number]) => {
    const status = (event.status ?? (event.published ? 'published' : 'draft')) as Status
    const pickup = event.registration_mode === 'pickup'
    const count = pickup ? reservationCount.get(event.id) ?? 0 : event.tickets[0]?.count ?? 0
    return (
      <li key={event.id}>
        <Link href={`/admin/eventos/${event.id}`}
          className="group bg-card hover:border-foreground/20 flex items-center gap-4 rounded-2xl border p-3 shadow-xs transition hover:shadow-md sm:p-4">
          <EventCover url={event.cover_url} title={event.title} className="size-16 shrink-0 rounded-xl sm:size-20" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={VARIANT[status] ?? 'secondary'}>{eventStatusLabels[status] ?? status}</Badge>
              <Badge variant="outline">{pickup ? `Reservas de ${itemName(event.pickup_item_name)}` : 'Entradas'}</Badge>
            </div>
            <p className="truncate font-semibold group-hover:underline">{event.title}</p>
            <p className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-0.5 text-xs sm:text-sm">
              <span className="inline-flex items-center gap-1.5"><CalendarDays className="size-3.5" aria-hidden />{formatDateTime(event.starts_at)}</span>
              {event.venue && <span className="inline-flex items-center gap-1.5"><MapPin className="size-3.5" aria-hidden />{event.venue}</span>}
            </p>
          </div>
          <div className="hidden text-right sm:block">
            <p className="text-xl font-semibold tabular-nums">{count}</p>
            <p className="text-muted-foreground text-xs">{pickup ? 'reservas' : 'entradas'}</p>
          </div>
          <ChevronRight className="text-muted-foreground size-5 shrink-0 transition group-hover:translate-x-0.5" aria-hidden />
        </Link>
      </li>
    )
  }

  return (
    <div className="space-y-8">
      <PageHeader title="Eventos" description="Crea eventos, define sus entradas o reservas y consulta quién asiste."
        actions={<Button asChild><Link href="/admin/eventos/nuevo"><Plus /> Nuevo evento</Link></Button>} />

      {events.length === 0 ? (
        <EmptyState icon={CalendarPlus} title="Todavía no hay eventos" description="Crea el primero para empezar a recibir reservas o vender entradas."
          action={<Button asChild><Link href="/admin/eventos/nuevo"><Plus /> Crear evento</Link></Button>} />
      ) : (
        <>
          {upcoming.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-muted-foreground text-sm font-semibold">Próximos · {upcoming.length}</h2>
              <ul className="space-y-3">{upcoming.map(card)}</ul>
            </section>
          )}
          {past.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-muted-foreground text-sm font-semibold">Pasados · {past.length}</h2>
              <ul className="space-y-3 opacity-80">{past.map(card)}</ul>
            </section>
          )}
        </>
      )}
    </div>
  )
}
