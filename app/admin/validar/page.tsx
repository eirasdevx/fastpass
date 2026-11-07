import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { isoHoursAgo } from '@/lib/format'
import { TicketValidator } from '@/components/admin/ticket-validator'
import { DEMO_MODE } from '@/lib/demo/mode'
import { requireStaff } from '@/lib/auth'
import { redirect } from 'next/navigation'

export const metadata: Metadata = { title: 'Validar entradas' }

export default async function ValidatePage(props: PageProps<'/admin/validar'>) {
  await requireStaff()
  const { evento } = await props.searchParams
  if (!DEMO_MODE) redirect(`/admin/accesos${typeof evento==='string'?`?evento=${encodeURIComponent(evento)}`:''}`)
  const supabase = await createClient()

  // Eventos de los últimos 2 días en adelante: los que tiene sentido validar
  const since = isoHoursAgo(48)
  const query = DEMO_MODE ? supabase.from('events').select('id, title, starts_at') : supabase.rpc('staff_events').select('id, title, starts_at')
  const { data: events, error } = await query
    .gte('starts_at', since)
    .order('starts_at')
  if (error) throw new Error('No se pudo cargar la información.')

  const initialEventId =
    typeof evento === 'string' && events.some((e) => e.id === evento) ? evento : null

  return (
    <div className="space-y-6">
      <div className="mx-auto max-w-xl">
        <h1 className="text-2xl font-bold tracking-tight">Validar entradas</h1>
        <p className="text-muted-foreground text-sm">
          Apunta al QR de la entrada. Cada entrada solo se puede validar una vez.
        </p>
      </div>
      <TicketValidator events={events} initialEventId={initialEventId} />
    </div>
  )
}
