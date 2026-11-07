import { DEMO_MODE } from '@/lib/demo/mode'
import { requireAdmin } from '@/lib/auth'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CalendarDays, ChevronDown, ChevronLeft, ClipboardList, Clock, DoorOpen, ExternalLink, MapPin, PackageCheck, ScanLine, Settings2, Tags, Ticket, Users, Wallet, type LucideIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { formatDate, formatDateTime, formatPrice, formatTime, isPast, isoToLocalInput } from '@/lib/format'
import { eventStatusLabels } from '@/lib/registrations'
import { formatTicketCode } from '@/lib/utils'
import { EventForm } from '@/components/admin/event-form'
import { TicketTypeForm } from '@/components/admin/ticket-type-form'
import { TicketStatusButton } from '@/components/admin/ticket-status-button'
import { DeleteEventButton } from '@/components/admin/delete-event-button'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { TicketStatus } from '@/types/database'
import { formReadiness } from '@/lib/event-readiness'
import { ReadinessChecklist } from '@/components/admin/readiness-checklist'
import { PersonalDataPanel } from '@/components/admin/personal-data-panel'
import { itemName, type ReservationStats } from '@/lib/reservations'
import { parseBlockDesign } from '@/lib/tickets/blocks'

export const metadata: Metadata = { title: 'Editar evento' }

const TONES = {
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/20 text-foreground',
  accent: 'bg-accent/20 text-foreground',
}

const STATUS_BADGE:Record<TicketStatus, { label: string; variant: 'success' | 'secondary' | 'destructive' }> = {
  valid: { label: 'Válida', variant: 'success' },
  used: { label: 'Usada', variant: 'secondary' },
  cancelled: { label: 'Anulada', variant: 'destructive' },
}

export default async function EditEventPage(props: PageProps<'/admin/eventos/[id]'>) {
  await requireAdmin()
  const { id } = await props.params
  const supabase = await createClient()
  if (!DEMO_MODE) {
    const { data: allowed } = await supabase.rpc('can_manage_event', { p_event: id })
    if (!allowed) notFound()
  }

  const [eventRes, typesRes, templatesRes, statsRes, ticketsRes] = await Promise.all([
    supabase
      .from('events')
      .select('*')
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('ticket_types')
      .select('id, name, description, price, capacity, max_per_order, template_id, sales_open')
      .eq('event_id', id)
      .order('created_at'),
    supabase.from('ticket_templates').select('id, name, design').order('name'),
    supabase.rpc('event_ticket_stats', { p_event_id: id }),
    supabase
      .from('tickets')
      .select('id, code, attendee_name, status, used_at, created_at, ticket_types(name), orders(buyer_email)')
      .eq('event_id', id)
      .order('created_at', { ascending: false })
      .limit(500),
  ])

  for (const res of [eventRes, typesRes, templatesRes, statsRes, ticketsRes]) {
    if (res.error) throw new Error('No se pudo cargar la información.')
  }
  const event = eventRes.data
  if (!event) notFound()

  const types = typesRes.data ?? []
  const allTemplates = templatesRes.data ?? []
  const tickets = ticketsRes.data ?? []
  const stats = new Map((statsRes.data ?? []).map((s) => [s.ticket_type_id, s]))

  const totalSold = (statsRes.data ?? []).reduce((n, s) => n + s.sold, 0)
  const totalUsed = (statsRes.data ?? []).reduce((n, s) => n + s.used, 0)

  // Reserva con recogida: cupo reservado por tipo y cifras de reservas en lugar de entradas.
  const pickup = event.registration_mode === 'pickup' && !DEMO_MODE
  const item = itemName(event.pickup_item_name)
  const reservedByType = new Map<string, number>()
  let reservationStats: ReservationStats | null = null
  if (pickup) {
    const [rowsRes, statsRpc] = await Promise.all([
      supabase.from('reservations').select('ticket_type_id, quantity, delivered_quantity, status').eq('event_id', id),
      supabase.rpc('reservation_stats', { p_event: id }),
    ])
    if (rowsRes.error || statsRpc.error) throw new Error('No se pudo cargar la información de reservas.')
    const expired = !!event.pickup_deadline && isPast(event.pickup_deadline)
    for (const r of rowsRes.data ?? []) {
      const active = ['pending_pickup', 'partially_picked_up'].includes(r.status) && !expired
      reservedByType.set(r.ticket_type_id, (reservedByType.get(r.ticket_type_id) ?? 0) + (active ? r.quantity : r.delivered_quantity))
    }
    reservationStats = statsRpc.data as unknown as ReservationStats
  }
  // Cada clase de evento solo ofrece sus plantillas: justificantes para reservas, entradas para el resto.
  const templates = allTemplates
    .filter((t) => (parseBlockDesign(t.design)?.kind === 'reservation') === pickup)
    .map(({ id, name }) => ({ id, name }))
  const readiness = (pickup || event.registration_enabled) ? formReadiness(event, types.filter((t) => t.sales_open).length) : null

  const Item = item[0].toUpperCase() + item.slice(1)
  const capacity = reservationStats ? reservationStats.capacity : event.capacity
  const committed = reservationStats ? reservationStats.committed : totalSold
  const percent = capacity ? Math.min(100, Math.round(committed / capacity * 100)) : 0
  const free = capacity === null ? 'Sin límite' : Math.max(0, capacity - committed)
  const figures: { label: string; value: string | number; hint?: string; icon: LucideIcon; tone: keyof typeof TONES }[] = reservationStats ? [
    { label: `${Item} por recoger`, value: reservationStats.reserved_pending, hint: `${reservationStats.reservations_active} reservas activas`, icon: Clock, tone: 'warning' },
    { label: `${Item} entregados`, value: reservationStats.delivered, hint: `${reservationStats.reservations_completed} reservas completas`, icon: PackageCheck, tone: 'success' },
    { label: 'Cobrado', value: formatPrice(Number(reservationStats.amount_collected)).replace('Gratis', '0,00 €'), hint: 'En las recogidas', icon: Wallet, tone: 'accent' },
    { label: 'Plazas libres', value: free, hint: capacity ? `De un aforo de ${capacity}` : undefined, icon: Users, tone: 'primary' },
  ] : [
    { label: 'Entradas emitidas', value: totalSold, icon: Ticket, tone: 'primary' },
    { label: 'Han entrado', value: totalUsed, icon: DoorOpen, tone: 'success' },
    { label: 'Pendientes de entrar', value: totalSold - totalUsed, icon: Clock, tone: 'warning' },
    { label: 'Plazas libres', value: free, hint: capacity ? `De un aforo de ${capacity}` : undefined, icon: Users, tone: 'accent' },
  ]

  return (
    <div className="space-y-8">
      <nav aria-label="Ruta" className="text-muted-foreground -mb-4 flex items-center gap-1 text-sm">
        <Link href="/admin/eventos" className="hover:text-foreground inline-flex items-center gap-1"><ChevronLeft className="size-4" aria-hidden />Eventos</Link>
      </nav>

      <header className="bg-card relative overflow-hidden rounded-2xl border shadow-sm">
        {/* Portada difuminada de fondo o, sin portada, un degradado con los colores de la marca. */}
        <div aria-hidden className="absolute inset-0">
          {event.cover_url
            ? <div className="absolute inset-0 bg-cover bg-center opacity-25 blur-sm" style={{ backgroundImage: `url(${JSON.stringify(event.cover_url)})` }} />
            : <div className="from-accent/25 via-primary/5 absolute inset-0 bg-gradient-to-br to-transparent" />}
          <div className="from-card via-card/85 absolute inset-0 bg-gradient-to-r to-transparent" />
        </div>
        <div className="relative flex flex-wrap items-end justify-between gap-6 p-6 sm:p-8">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={event.status === 'published' || event.status === 'live' ? 'success' : event.status === 'cancelled' ? 'destructive' : 'secondary'}>
                {eventStatusLabels[event.status as keyof typeof eventStatusLabels] ?? event.status}
              </Badge>
              <Badge variant="outline" className="bg-card/70">{pickup ? `Reserva de ${item} con recogida` : 'Entradas'}</Badge>
            </div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{event.title}</h1>
            <div className="text-muted-foreground flex flex-wrap gap-x-5 gap-y-1 text-sm">
              <span className="inline-flex items-center gap-1.5"><CalendarDays className="size-4" aria-hidden />{formatDate(event.starts_at)} · {formatTime(event.starts_at)}</span>
              {event.venue && <span className="inline-flex items-center gap-1.5"><MapPin className="size-4" aria-hidden />{event.venue}</span>}
            </div>
          </div>
        <div className="flex flex-wrap gap-2">
          {event.published && (
            <Button asChild variant="outline" size="sm" className="bg-card/80">
              <Link href={`/eventos/${event.slug}`} target="_blank">
                <ExternalLink /> Ver página pública
              </Link>
            </Button>
          )}
          {pickup ? (
            <>
              <Button asChild variant="outline" size="sm" className="bg-card/80">
                <Link href={`/admin/reservas?evento=${event.id}`}><ClipboardList /> Reservas</Link>
              </Button>
              <Button asChild variant="accent" size="sm">
                <Link href={`/admin/accesos?evento=${event.id}`}><PackageCheck /> Punto de recogida</Link>
              </Button>
            </>
          ) : (
            <Button asChild variant="accent" size="sm">
              <Link href={`/admin/validar?evento=${event.id}`}>
                <ScanLine /> Validar entradas
              </Link>
            </Button>
          )}
        </div>
        </div>
      </header>

      {readiness && (
        <ReadinessChecklist open={readiness.open} items={readiness.items} pickup={pickup}>
          {event.published && (
            <Link href={pickup ? `/eventos/${event.slug}/reservar` : `/eventos/${event.slug}`} target="_blank" className="text-sm underline">
              Probar como público
            </Link>
          )}
        </ReadinessChecklist>
      )}

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {figures.map(({ label, value, hint, icon: Icon, tone }) => (
          <div key={label} className="bg-card flex items-start gap-3 rounded-2xl border p-4 shadow-xs">
            <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${TONES[tone]}`}><Icon className="size-5" aria-hidden /></span>
            <div className="min-w-0">
              <dt className="text-muted-foreground text-xs font-medium">{label}</dt>
              <dd className="text-2xl font-semibold tabular-nums">{value}</dd>
              {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
            </div>
          </div>
        ))}
      </dl>

      {capacity !== null && (
        <section aria-label="Aforo" className="bg-card space-y-2 rounded-2xl border p-4 shadow-xs">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span className="font-medium">Aforo ocupado</span>
            <span className="text-muted-foreground tabular-nums"><strong className="text-foreground">{committed}</strong> de {capacity} · {percent}%</span>
          </div>
          <div className="bg-secondary h-2.5 overflow-hidden rounded-full" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
            <div className={`h-full rounded-full transition-all ${percent >= 90 ? 'bg-destructive' : percent >= 70 ? 'bg-warning' : 'bg-success'}`} style={{ width: `${percent}%` }} />
          </div>
        </section>
      )}

      {!DEMO_MODE && (
        <PersonalDataPanel eventId={event.id} endsAt={event.ends_at ?? event.starts_at} retentionDays={event.retention_days ?? 90}
          purgedAt={event.personal_data_purged_at ?? null} finished={isPast(event.ends_at ?? event.starts_at)} />
      )}

      {/* items-start: cada tarjeta mide lo que su contenido; los tipos acompañan al bajar por el formulario. */}
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] xl:grid-cols-[minmax(0,1fr)_minmax(0,28rem)]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Settings2 className="text-muted-foreground size-5" aria-hidden />Datos del evento</CardTitle>
            <CardDescription>Fechas, lugar, aforo, reservas y privacidad.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <EventForm
              eventId={event.id}
              defaultValues={{
                title: event.title,
                description: event.description,
                venue: event.venue,
                starts_at: isoToLocalInput(event.starts_at),
                ends_at: event.ends_at ? isoToLocalInput(event.ends_at) : '',
                cover_url: event.cover_url ?? '',
                latitude: event.latitude ?? null,
                longitude: event.longitude ?? null,
                published: event.published,
                capacity: event.capacity,
                status: event.status,
                registration_enabled: event.registration_enabled,
                registration_mode: event.registration_mode,
                phone_required: event.phone_required,
                last_name_required: event.last_name_required,
                prevent_duplicates: event.prevent_duplicates,
                privacy_controller: event.privacy_controller,
                privacy_contact: event.privacy_contact,
                retention_days: event.retention_days,
                reservations_open_at: event.reservations_open_at ? isoToLocalInput(event.reservations_open_at) : '',
                reservations_close_at: event.reservations_close_at ? isoToLocalInput(event.reservations_close_at) : '',
                pickup_deadline: event.pickup_deadline ? isoToLocalInput(event.pickup_deadline) : '',
                pickup_address: event.pickup_address,
                pickup_instructions: event.pickup_instructions,
                max_per_person: event.max_per_person,
                reserved_other_channels: event.reserved_other_channels,
                // Sin la migración 0017 la columna no existe y el ajuste no se muestra.
                ...(event.queue_enabled !== undefined && { queue_enabled: event.queue_enabled, queue_capacity: event.queue_capacity ?? 100 }),
                pickup_item_name: event.pickup_item_name ?? 'bonocopas',
                attendee_details: event.attendee_details ?? false,
                require_document: event.require_document ?? false,
                require_birth_date: event.require_birth_date ?? false,
                min_age: event.min_age ?? null,
              }}
            />
            <div className="border-t pt-4">
              <DeleteEventButton eventId={event.id} ticketCount={totalSold} />
            </div>
          </CardContent>
        </Card>

        <Card className="lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Tags className="text-muted-foreground size-5" aria-hidden />{pickup ? `Tipos de ${item}` : 'Tipos de entrada'}</CardTitle>
            <CardDescription>
              {pickup ? (
                `Crea al menos un tipo de ${item}: nombre, precio que se pagará al recoger, cupo y máximo por reserva.`
              ) : (
                <>
                  Cada tipo usa una{' '}
                  <Link href="/admin/plantillas" className="underline">
                    plantilla
                  </Link>{' '}
                  que define cómo se ve la entrada.
                </>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {types.map((type) => {
              const s = stats.get(type.id)
              const sold = (s?.sold ?? 0) + (reservedByType.get(type.id) ?? 0)
              const share = type.capacity ? Math.min(100, Math.round(sold / type.capacity * 100)) : null
              return (
                <details key={type.id} className="group hover:border-foreground/20 rounded-xl border transition-colors open:shadow-sm">
                  <summary className="cursor-pointer list-none space-y-2.5 p-4 [&::-webkit-details-marker]:hidden">
                    <div className="flex items-center justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{type.name}</span>
                        <span className="text-muted-foreground text-sm">{formatPrice(Number(type.price))}{pickup ? ' al recoger' : ''}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <Badge variant={type.sales_open ? 'success' : 'warning'}>{type.sales_open ? 'A la venta' : 'Cerrada'}</Badge>
                        <ChevronDown className="text-muted-foreground size-4 transition-transform group-open:rotate-180" aria-hidden />
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <div className="bg-secondary h-1.5 flex-1 overflow-hidden rounded-full">
                        <div className="bg-primary h-full rounded-full" style={{ width: `${share ?? (sold ? 100 : 0)}%`, opacity: share === null ? 0.35 : 1 }} />
                      </div>
                      <span className="text-muted-foreground tabular-nums">{sold} {pickup ? 'reservados' : 'vendidas'} · {type.capacity ? `cupo ${type.capacity}` : 'sin cupo'}</span>
                    </div>
                  </summary>
                  <div className="border-t p-3">
                    <TicketTypeForm
                      eventId={event.id}
                      ticketTypeId={type.id}
                      templates={templates}
                      canDelete={sold === 0 && !reservedByType.has(type.id)}
                      item={pickup ? item : undefined}
                      defaultValues={{
                        name: type.name,
                        description: type.description,
                        price: Number(type.price),
                        capacity: type.capacity,
                        max_per_order: type.max_per_order,
                        template_id: type.template_id,
                        sales_open: type.sales_open,
                      }}
                    />
                  </div>
                </details>
              )
            })}

            <div className="bg-secondary/40 rounded-xl border border-dashed p-4">
              <p className="mb-3 text-sm font-semibold">{pickup ? `Nuevo tipo de ${item}` : 'Nuevo tipo de entrada'}</p>
              <TicketTypeForm eventId={event.id} templates={templates} item={pickup ? item : undefined} />
            </div>
          </CardContent>
        </Card>
      </div>

      {!pickup && <Card>
        <CardHeader>
          <CardTitle>Asistentes</CardTitle>
          <CardDescription>
            <Link href={`/admin/asistentes?evento=${event.id}`} className="mr-3 underline">Buscar, añadir y exportar asistentes</Link>
            {tickets.length === 500 ? 'Mostrando las 500 entradas más recientes.' : `${tickets.length} entradas emitidas.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {tickets.length === 0 ? (
            <p className="text-muted-foreground text-sm">Aún no se ha emitido ninguna entrada.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-muted-foreground border-b text-left text-xs uppercase">
                  <tr>
                    <th className="py-2 pr-4 font-medium">Código</th>
                    <th className="py-2 pr-4 font-medium">Asistente</th>
                    <th className="py-2 pr-4 font-medium">Tipo</th>
                    <th className="py-2 pr-4 font-medium">Estado</th>
                    <th className="py-2 font-medium">
                      <span className="sr-only">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((ticket) => {
                    const badge = STATUS_BADGE[ticket.status]
                    return (
                      <tr key={ticket.id} className="border-b last:border-0">
                        <td className="py-2 pr-4 font-mono text-xs whitespace-nowrap">{formatTicketCode(ticket.code)}</td>
                        <td className="py-2 pr-4">
                          {ticket.attendee_name}
                          <p className="text-muted-foreground text-xs">{ticket.orders?.buyer_email}</p>
                        </td>
                        <td className="py-2 pr-4">{ticket.ticket_types?.name}</td>
                        <td className="py-2 pr-4">
                          <Badge variant={badge.variant}>{badge.label}</Badge>
                          {ticket.used_at && (
                            <p className="text-muted-foreground mt-0.5 text-xs">{formatDateTime(ticket.used_at)}</p>
                          )}
                        </td>
                        <td className="py-2 text-right">
                          <TicketStatusButton eventId={event.id} ticketId={ticket.id} status={ticket.status} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>}
    </div>
  )
}
