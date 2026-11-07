import Link from 'next/link'
import { Info, Search, Users } from 'lucide-react'
import { reservationFilters, reservationPeoplePage, type SearchParams } from '@/lib/admin-data'
import { capitalize, itemName, reservationStatusLabels, reservationStatusVariant } from '@/lib/reservations'
import { formatDateTime } from '@/lib/format'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState, Pagination, table } from '@/components/admin/page-kit'

/** Asistentes de un evento con reserva y recogida: quienes ya han recogido lo físico (su entrada). */
export async function ReservationPeople({ event, itemName: rawItem, types, params }: {
  event: string; itemName: string | null | undefined; types: { id: string; name: string }[]; params: SearchParams
}) {
  const filters = reservationFilters(params), page = await reservationPeoplePage(event, params), item = itemName(rawItem)
  const query = new URLSearchParams({ evento: event, q: filters.p_query, estado: filters.p_status, tipo: filters.p_type ?? '', orden: filters.p_ascending ? 'asc' : 'desc' })
  const href = (n: number) => `/admin/asistentes?${query}&pagina=${n}`
  const filtered = !!(filters.p_query || filters.p_status || filters.p_type)

  return (
    <>
      <p className="bg-primary/5 flex gap-3 rounded-2xl border p-4 text-sm">
        <Info className="text-primary mt-0.5 size-4 shrink-0" aria-hidden />
        <span>En este evento la entrada son los {item} físicos. Aquí solo aparecen quienes ya los han recogido; las reservas pendientes
          están en <Link className="font-medium underline" href={`/admin/reservas?evento=${event}`}>Reservas</Link>.</span>
      </p>
      <form className="bg-card grid items-end gap-3 rounded-2xl border p-4 shadow-xs sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto]">
        <input type="hidden" name="evento" value={event} />
        <label className="grid gap-1.5 text-xs font-medium">Buscar
          <span className="relative"><Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" aria-hidden />
            <Input name="q" defaultValue={filters.p_query} maxLength={120} placeholder="Nombre, DNI o código" className="pl-9" /></span>
        </label>
        <label className="grid gap-1.5 text-xs font-medium">Estado
          <NativeSelect name="estado" defaultValue={filters.p_status}><option value="">Todos</option>
            {(['completed', 'partially_picked_up'] as const).map((v) => <option key={v} value={v}>{reservationStatusLabels[v]}</option>)}</NativeSelect>
        </label>
        <label className="grid gap-1.5 text-xs font-medium">Tipo
          <NativeSelect name="tipo" defaultValue={filters.p_type ?? ''}><option value="">Todos</option>{types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</NativeSelect>
        </label>
        <label className="grid gap-1.5 text-xs font-medium">Orden
          <NativeSelect name="orden" defaultValue={filters.p_ascending ? 'asc' : 'desc'}><option value="desc">Más recientes</option><option value="asc">Más antiguas</option></NativeSelect>
        </label>
        <div className="flex gap-2">
          <Button type="submit"><Search /> Buscar</Button>
          {filtered && <Button asChild variant="ghost"><Link href={`/admin/asistentes?evento=${event}`}>Limpiar</Link></Button>}
        </div>
      </form>
      {page.rows.length === 0 ? (
        <EmptyState icon={Users} title={filtered ? 'Nadie coincide con estos filtros' : `Todavía nadie ha recogido sus ${item}`}
          description={filtered ? 'Prueba con otra búsqueda o limpia los filtros.' : 'Las personas aparecerán aquí en cuanto se registre su entrega en el punto de recogida.'} />
      ) : (
        <div className={table.wrap}>
          <table className={table.table}>
            <thead className={table.head}><tr>{['Nombre', 'Documento', 'Reserva', 'Tipo', capitalize(item), 'Estado'].map((h) => <th key={h} className={table.th}>{h}</th>)}</tr></thead>
            <tbody>{page.rows.map((r) => (
              <tr key={`${r.reservation_id}-${r.position}`} className={table.row}>
                <td className={table.td}>
                  <p className="font-medium">{r.name}{r.places > 1 && <span className="text-muted-foreground font-normal"> · {r.places} plazas</span>}</p>
                  <p className="text-muted-foreground text-xs">{r.position === 1 ? `Titular · ${r.email}` : `Persona ${r.position}`}</p>
                </td>
                <td className={`${table.td} font-mono`}>{r.document_id ?? '—'}</td>
                <td className={table.td}><Link className="bg-secondary hover:bg-secondary/70 rounded-md px-2 py-1 font-mono text-sm font-semibold tracking-wider" href={`/admin/reservas/${r.reservation_id}`}>{r.code}</Link>
                  <p className="text-muted-foreground mt-1 text-xs">{formatDateTime(r.created_at)}</p></td>
                <td className={table.td}>{r.type_name}</td>
                <td className={`${table.td} whitespace-nowrap tabular-nums`}>{r.delivered_quantity} de {r.quantity}</td>
                <td className={table.td}><Badge variant={reservationStatusVariant[r.status]}>{reservationStatusLabels[r.status]}</Badge></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <Pagination page={filters.p_page} total={page.total} size={25} href={href} label={page.places === 1 ? 'persona' : 'personas'} />
    </>
  )
}
