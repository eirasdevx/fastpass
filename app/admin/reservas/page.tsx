import Link from 'next/link'
import { ChevronRight, ClipboardList, Clock, Download, PackageCheck, Search, Users, Wallet } from 'lucide-react'
import { requireAdmin } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { DEMO_MODE } from '@/lib/demo/mode'
import { DatabaseRequired } from '@/components/admin/database-required'
import { EventSelector } from '@/components/admin/event-selector'
import { ManualReservation } from '@/components/admin/reservation-controls'
import { EmptyState, PageHeader, Pagination, StatCard, StatGrid, table } from '@/components/admin/page-kit'
import { reservationFilters, reservationPage, staffEvents, type SearchParams } from '@/lib/admin-data'
import { capitalize, itemName, reservationStatusLabels, reservationStatusVariant, type ReservationStats } from '@/lib/reservations'
import { formatDateTime, formatPrice } from '@/lib/format'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export const metadata = { title: 'Reservas' }

const euros = (v: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(Number(v) || 0)

export default async function ReservationsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdmin()
  if (DEMO_MODE) return <DatabaseRequired />
  const params = await searchParams
  const events = (await staffEvents()).filter((e) => e.registration_mode === 'pickup')
  const event = events.find((e) => e.id === params.evento) ?? events[0]
  if (!event) return (
    <div className="space-y-6">
      <PageHeader title="Reservas" />
      <EmptyState icon={ClipboardList} title="Ningún evento usa reservas"
        description="Para recibir reservas con recogida y pago presencial, elige esa modalidad en la configuración del evento."
        action={<Button asChild variant="outline"><Link href="/admin/eventos">Ir a eventos</Link></Button>} />
    </div>
  )

  const filters = reservationFilters(params), db = await createClient()
  const item = itemName(event.pickup_item_name)
  const [page, { data: types, error }, { data: statsData, error: statsError }] = await Promise.all([
    reservationPage(event.id, params),
    db.from('ticket_types').select('id,name').eq('event_id', event.id),
    db.rpc('reservation_stats', { p_event: event.id }),
  ])
  if (error || statsError) throw new Error('No se pudo cargar la información del evento.')
  const stats = statsData as unknown as ReservationStats
  const available = stats.capacity === null ? 'Sin límite' : Math.max(0, stats.capacity - stats.committed)
  const query = new URLSearchParams({ evento: event.id, q: filters.p_query, estado: filters.p_status, tipo: filters.p_type ?? '', orden: filters.p_ascending ? 'asc' : 'desc' })
  const href = (n: number) => `/admin/reservas?${query}&pagina=${n}`
  const filtered = !!(filters.p_query || filters.p_status || filters.p_type)

  return (
    <div className="space-y-6">
      <PageHeader title={`Reservas de ${item}`}
        description="Reservas con recogida y pago presencial. Las entregas se registran en Accesos, en el punto de recogida."
        actions={<Button asChild variant="outline"><a href={`/admin/reservas/exportar?${query}`}><Download /> Exportar CSV</a></Button>} />
      <EventSelector events={events} selected={event.id} />

      <StatGrid>
        <StatCard icon={Clock} tone="warning" label={`${capitalize(item)} por recoger`} value={stats.reserved_pending} hint={`${stats.reservations_active} reservas activas`} />
        <StatCard icon={PackageCheck} tone="success" label={`${capitalize(item)} entregados`} value={stats.delivered}
          hint={`${stats.reservations_completed} completas · ${stats.reservations_cancelled} canceladas · ${stats.reservations_expired} caducadas`} />
        <StatCard icon={Wallet} tone="accent" label="Cobrado" value={euros(stats.amount_collected)} hint="En las recogidas" />
        <StatCard icon={Users} tone="primary" label="Plazas disponibles" value={available}
          hint={stats.capacity === null ? undefined : `De ${stats.capacity}${stats.other_channels ? ` · ${stats.other_channels} para otros canales` : ''}`} />
      </StatGrid>

      <ManualReservation event={event.id} types={types ?? []} lastRequired={event.last_name_required ?? true} phoneRequired={event.phone_required ?? false}
        rules={{ attendee_details: event.attendee_details ?? false, require_document: event.require_document ?? false, require_birth_date: event.require_birth_date ?? false, min_age: event.min_age ?? null, last_name_required: event.last_name_required ?? true }} />

      <form className="bg-card grid items-end gap-3 rounded-2xl border p-4 shadow-xs sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto]">
        <input type="hidden" name="evento" value={event.id} />
        <label className="grid gap-1.5 text-xs font-medium">Buscar
          <span className="relative"><Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" aria-hidden />
            <Input name="q" defaultValue={filters.p_query} maxLength={120} placeholder="Nombre, correo, código o DNI" className="pl-9" /></span>
        </label>
        <label className="grid gap-1.5 text-xs font-medium">Estado<NativeSelect name="estado" defaultValue={filters.p_status}><option value="">Todos</option>{Object.entries(reservationStatusLabels).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</NativeSelect></label>
        <label className="grid gap-1.5 text-xs font-medium">Tipo<NativeSelect name="tipo" defaultValue={filters.p_type ?? ''}><option value="">Todos</option>{types?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</NativeSelect></label>
        <label className="grid gap-1.5 text-xs font-medium">Orden<NativeSelect name="orden" defaultValue={filters.p_ascending ? 'asc' : 'desc'}><option value="desc">Más recientes</option><option value="asc">Más antiguas</option></NativeSelect></label>
        <div className="flex gap-2">
          <Button type="submit"><Search /> Buscar</Button>
          {filtered && <Button asChild variant="ghost"><Link href={`/admin/reservas?evento=${event.id}`}>Limpiar</Link></Button>}
        </div>
      </form>

      {page.rows.length === 0 ? (
        <EmptyState icon={ClipboardList} title={filtered ? 'No hay reservas con estos filtros' : 'Todavía no hay reservas'}
          description={filtered ? 'Prueba con otra búsqueda o limpia los filtros.' : 'Cuando alguien reserve desde la web o añadas una reserva manual, aparecerá aquí.'} />
      ) : (
        <div className={table.wrap}>
          <table className={table.table}>
            <thead className={table.head}><tr>{['Titular', 'Código', capitalize(item), 'Pagado', 'Estado', ''].map((h) => <th key={h} className={table.th}>{h}</th>)}</tr></thead>
            <tbody>
              {page.rows.map((row) => (
                <tr key={row.id} className={table.row}>
                  <td className={table.td}>
                    <Link href={`/admin/reservas/${row.id}`} className="font-medium hover:underline">{row.name}</Link>
                    <p className="text-muted-foreground text-xs">{row.email} · {formatDateTime(row.created_at)}{row.source === 'manual' && ' · manual'}</p>
                  </td>
                  <td className={table.td}><span className="bg-secondary rounded-md px-2 py-1 font-mono text-sm font-semibold tracking-wider">{row.code}</span></td>
                  <td className={`${table.td} whitespace-nowrap`}><span className="font-medium tabular-nums">{row.delivered_quantity}/{row.quantity}</span> <span className="text-muted-foreground">· {row.type_name}</span></td>
                  <td className={`${table.td} whitespace-nowrap tabular-nums`}>{euros(Number(row.amount_paid))} <span className="text-muted-foreground">de {formatPrice(Number(row.total))}</span></td>
                  <td className={table.td}><Badge variant={reservationStatusVariant[row.status]}>{reservationStatusLabels[row.status]}</Badge></td>
                  <td className={`${table.td} text-right`}><Link href={`/admin/reservas/${row.id}`} aria-label={`Ver la reserva de ${row.name}`} className="text-muted-foreground hover:text-foreground inline-flex items-center"><ChevronRight className="size-5" /></Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={filters.p_page} total={page.total} size={25} href={href} label="reservas" />
    </div>
  )
}
