import Link from 'next/link'
import { CalendarDays, ChevronRight, MapPin, PackageCheck, ScanLine } from 'lucide-react'
import { EmptyState, PageHeader } from '@/components/admin/page-kit'
import { Button } from '@/components/ui/button'
import { requireStaff } from '@/lib/auth'
import { DEMO_MODE } from '@/lib/demo/mode'
import { DatabaseRequired } from '@/components/admin/database-required'
import { AccessControl } from '@/components/admin/access-control'
import { PickupControl } from '@/components/admin/pickup-control'
import { ACCESS_STATUSES, staffEvents, type SearchParams } from '@/lib/admin-data'
import { formatDateTime } from '@/lib/format'
import { itemName } from '@/lib/reservations'

export const metadata = { title: 'Accesos' }

const STATUS_LABELS: Record<string, string> = { published: 'Publicado', closed: 'Entradas o reservas cerradas', live: 'En curso' }

// Una sola pantalla para el personal: primero se elige el evento y después se adapta a él.
// - Entradas digitales: validar el QR o el código en la puerta.
// - Reserva con recogida: punto de recogida (cobrar y entregar lo físico, que es la entrada).
export default async function AccessPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireStaff()
  if (DEMO_MODE) return <DatabaseRequired />
  // Solo eventos publicados, aunque ya no admitan entradas o reservas; no borradores, terminados ni cancelados.
  const params = await searchParams, events = (await staffEvents()).filter((e) => ACCESS_STATUSES.includes(e.status ?? ''))
  const event = events.find((e) => e.id === params.evento)

  if (!event) {
    return (
      <div className="mx-auto max-w-xl space-y-6">
        <PageHeader eyebrow="Día del evento" title="Accesos" description="¿Qué evento vas a controlar?" />
        {events.length === 0 ? (
          <EmptyState icon={ScanLine} title="No hay eventos disponibles" description="Solo aparecen los eventos publicados. Publica el evento (o pide que te asignen a uno) para controlar el acceso." />
        ) : (
          <ul className="space-y-3">{events.map((e) => {
            const pickup = e.registration_mode === 'pickup'
            return (
              <li key={e.id}>
                <Link href={`/admin/accesos?evento=${e.id}`} className="group bg-card hover:border-foreground/20 flex items-center gap-4 rounded-2xl border p-5 shadow-xs transition hover:shadow-md">
                  <span className={`flex size-12 shrink-0 items-center justify-center rounded-xl ${pickup ? 'bg-accent/20' : 'bg-primary/10 text-primary'}`}>
                    {pickup ? <PackageCheck className="size-6" aria-hidden /> : <ScanLine className="size-6" aria-hidden />}
                  </span>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-lg font-semibold">{e.title}</p>
                    <p className="text-muted-foreground flex items-center gap-1.5 text-sm"><CalendarDays className="size-4" />{formatDateTime(e.starts_at)}</p>
                    {e.venue && <p className="text-muted-foreground flex items-center gap-1.5 text-sm"><MapPin className="size-4" />{e.venue}</p>}
                    <p className="flex flex-wrap gap-2 pt-1 text-xs">
                      <span className="bg-primary/10 text-primary rounded-md px-2 py-0.5 font-medium">{pickup ? `Recogida de ${itemName(e.pickup_item_name)}` : 'Control de entradas'}</span>
                      <span className="bg-secondary rounded-md px-2 py-0.5">{STATUS_LABELS[e.status ?? ''] ?? e.status}</span>
                    </p>
                  </div>
                  <ChevronRight className="text-muted-foreground size-6 shrink-0 transition group-hover:translate-x-0.5" />
                </Link>
              </li>
            )
          })}</ul>
        )}
      </div>
    )
  }

  const pickup = event.registration_mode === 'pickup'
  const item = itemName(event.pickup_item_name)
  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div className="bg-card flex items-center gap-4 rounded-2xl border p-4 shadow-xs">
        <span className={`flex size-12 shrink-0 items-center justify-center rounded-xl ${pickup ? 'bg-accent/20' : 'bg-primary/10 text-primary'}`}>
          {pickup ? <PackageCheck className="size-6" aria-hidden /> : <ScanLine className="size-6" aria-hidden />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">{pickup ? `Recogida de ${item}` : 'Control de entradas'}</p>
          <h1 className="truncate text-xl font-bold sm:text-2xl">{event.title}</h1>
          <p className="text-muted-foreground truncate text-sm">{formatDateTime(event.starts_at)}{event.venue && ` · ${event.venue}`}</p>
        </div>
        <Button asChild variant="outline" size="sm" className="shrink-0"><Link href="/admin/accesos">Cambiar</Link></Button>
      </div>
      <p className="text-muted-foreground text-sm">
        {pickup
          ? `Escanea el QR del justificante o escribe su código. Cobra y entrega: los ${item} son la entrada al evento.`
          : 'Escanea el QR de la entrada o escribe su código y confirma el acceso.'}
      </p>
      {pickup ? <PickupControl key={event.id} event={event.id} /> : <AccessControl key={event.id} event={event.id} />}
    </div>
  )
}
