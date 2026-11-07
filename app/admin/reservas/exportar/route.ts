import { getAdmin, canManageEvent } from '@/lib/auth'
import { reservationPage } from '@/lib/admin-data'
import { reservationStatusLabels } from '@/lib/reservations'
import { csvCell } from '@/lib/csv'
import { z } from 'zod'

export async function GET(request: Request) {
  if (!(await getAdmin())) return new Response('No autorizado', { status: 401 })
  const params = Object.fromEntries(new URL(request.url).searchParams), event = params.evento
  if (!z.uuid().safeParse(event).success) return new Response('Evento no válido', { status: 400 })
  if (!(await canManageEvent(event))) return new Response('No autorizado', { status: 403 })
  // Se pide la primera página antes de enviar las cabeceras de descarga para que los fallos se vean.
  const first = await reservationPage(event, { ...params, pagina: '1' }, 500)
  const encoder = new TextEncoder()
  let index = 1, cancelled = false
  const stream = new ReadableStream({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode('\uFEFFCódigo,Nombre,Correo,Teléfono,Tipo,Cantidad,Entregados,Precio unitario,Total,Cobrado,Estado,Origen,Alta,Personas\r\n'))
        let page = first
        while (!cancelled) {
          for (const r of page.rows) controller.enqueue(encoder.encode([
            r.code, r.name, r.email, r.phone, r.type_name, r.quantity, r.delivered_quantity, r.unit_price, r.total, r.amount_paid,
            reservationStatusLabels[r.status], r.source === 'manual' ? 'Manual' : 'Web', r.created_at, r.people ?? '',
          ].map(csvCell).join(',') + '\r\n'))
          if (index * 500 >= page.total) break
          page = await reservationPage(event, { ...params, pagina: String(++index) }, 500)
        }
        if (!cancelled) controller.close()
      } catch (error) { if (!cancelled) controller.error(error) }
    },
    cancel() { cancelled = true },
  })
  return new Response(stream, { headers: {
    'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="reservas.csv"',
    'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
  } })
}
