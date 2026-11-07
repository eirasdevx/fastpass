import Link from 'next/link'
import { notFound } from 'next/navigation'
import { z } from 'zod'
import { ChevronLeft, Clock, PackageCheck, Wallet } from 'lucide-react'
import { requireAdmin } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { DEMO_MODE } from '@/lib/demo/mode'
import { DatabaseRequired } from '@/components/admin/database-required'
import { ReservationActions } from '@/components/admin/reservation-controls'
import { StatCard, StatGrid, table } from '@/components/admin/page-kit'
import { Badge } from '@/components/ui/badge'
import { capitalize, itemName, paymentMethodLabels, reservationStatusLabels, reservationStatusVariant, type ReservationDetail } from '@/lib/reservations'
import { formatDateTime, formatPrice } from '@/lib/format'

export const metadata = { title: 'Detalle de reserva' }

const euros = (v: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(Number(v) || 0)

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="space-y-3"><h2 className="font-semibold">{title}</h2>{children}</section>
}

export default async function ReservationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin()
  if (DEMO_MODE) return <DatabaseRequired />
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  const db = await createClient()
  const { data, error } = await db.rpc('reservation_detail', { p_reservation: id })
  // FORBIDDEN también cuando no existe: no se distingue una reserva ajena de una inexistente.
  if (error) notFound()
  const r = data as unknown as ReservationDetail
  const active = r.status === 'pending_pickup' || r.status === 'partially_picked_up'
  const item = capitalize(itemName(r.item_name))
  const details: [string, React.ReactNode][] = [
    ['Correo', r.email], ['Teléfono', r.phone || '—'],
    [item, `${r.quantity} × ${r.type_name} (${formatPrice(Number(r.unit_price))} c/u)`],
    ['Alta', `${formatDateTime(r.created_at)} · ${r.source === 'manual' ? 'manual' : 'web'}`],
    ['Fecha límite de recogida', r.expires_at ? formatDateTime(r.expires_at) : 'Sin fecha límite'],
    ...(r.privacy_accepted_at ? [['Privacidad aceptada', formatDateTime(r.privacy_accepted_at)] as [string, string]] : []),
    ...(r.cancelled_at ? [['Cancelada', formatDateTime(r.cancelled_at)] as [string, string]] : []),
    ...(r.personal_data_removed_at ? [['Datos personales', `Suprimidos el ${formatDateTime(r.personal_data_removed_at)}`] as [string, string]] : []),
  ]

  return (
    <div className="max-w-4xl space-y-8">
      <Link className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm" href={`/admin/reservas?evento=${r.event_id}`}><ChevronLeft className="size-4" aria-hidden />Reservas</Link>

      <header className="bg-card flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-6 shadow-xs">
        <div className="min-w-0 space-y-1.5">
          <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">{r.event_title}</p>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{r.holder}</h1>
          <Badge variant={reservationStatusVariant[r.status]}>{reservationStatusLabels[r.status]}</Badge>
        </div>
        <div className="text-center">
          <p className="text-muted-foreground text-xs">Código</p>
          <p className="bg-secondary rounded-xl px-4 py-2 font-mono text-3xl font-bold tracking-[0.2em]">{r.code}</p>
        </div>
      </header>

      <StatGrid className="lg:grid-cols-3">
        <StatCard icon={PackageCheck} tone="success" label={`${item} entregados`} value={`${r.delivered_quantity} de ${r.quantity}`} />
        <StatCard icon={Wallet} tone="accent" label="Cobrado" value={euros(Number(r.amount_paid))} hint={`de ${euros(Number(r.total))}`} />
        <StatCard icon={Clock} tone="warning" label="Pendiente de cobro" value={euros(Number(r.amount_pending))} />
      </StatGrid>

      <Section title="Datos de la reserva">
        <dl className="bg-card grid gap-x-6 gap-y-4 rounded-2xl border p-5 text-sm shadow-xs sm:grid-cols-2">
          {details.map(([label, value]) => <div key={label}><dt className="text-muted-foreground text-xs">{label}</dt><dd className="mt-0.5 font-medium">{value}</dd></div>)}
          {r.notes && <div className="sm:col-span-2"><dt className="text-muted-foreground text-xs">Observaciones</dt><dd className="mt-0.5 whitespace-pre-wrap">{r.notes}</dd></div>}
        </dl>
      </Section>

      {r.attendees && r.attendees.length > 0 && (
        <Section title="Personas">
          <div className={table.wrap}>
            <table className={table.table}>
              <thead className={table.head}><tr>{['#', 'Nombre', 'Documento', 'Nacimiento'].map((h) => <th key={h} className={table.th}>{h}</th>)}</tr></thead>
              <tbody>{r.attendees.map((a) => (
                <tr key={a.position} className={table.row}>
                  <td className={table.td}>{a.position}{a.position === 1 && <span className="text-muted-foreground"> · titular</span>}</td>
                  <td className={`${table.td} font-medium`}>{a.first_name} {a.last_name}</td>
                  <td className={`${table.td} font-mono`}>{a.document_id ?? '—'}</td>
                  <td className={table.td}>{a.birth_date ? a.birth_date.split('-').reverse().join('/') : '—'}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </Section>
      )}

      <Section title="Entregas registradas">
        {r.pickups.length === 0 ? <p className="text-muted-foreground bg-card/50 rounded-2xl border border-dashed p-5 text-sm">Todavía no se ha entregado nada.</p> : (
          <div className={table.wrap}>
            <table className={table.table}>
              <thead className={table.head}><tr>{['Fecha', 'Cantidad', 'Importe', 'Pago', 'Registrado por'].map((h) => <th key={h} className={table.th}>{h}</th>)}</tr></thead>
              <tbody>{r.pickups.map((p, i) => (
                <tr key={i} className={table.row}>
                  <td className={`${table.td} whitespace-nowrap`}>{formatDateTime(p.created_at)}</td><td className={table.td}>{p.quantity}</td>
                  <td className={`${table.td} tabular-nums`}>{euros(Number(p.amount))}</td><td className={table.td}>{paymentMethodLabels[p.payment_method]}</td>
                  <td className={`${table.td} text-muted-foreground`}>{p.admin_email ?? '—'}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Acciones">
        <div className="bg-card rounded-2xl border p-5 shadow-xs">
          <ReservationActions id={r.id} canCancel={!r.personal_data_removed_at && (active || r.status === 'expired')} redacted={Boolean(r.personal_data_removed_at)} />
        </div>
      </Section>
    </div>
  )
}
