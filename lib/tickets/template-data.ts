import { formatDate, formatDateTime, formatPrice, formatTime } from '@/lib/format'
import { itemName, reservationStatusLabels, type ReservationSummary } from '@/lib/reservations'
import type { TemplateVariables } from '@/lib/tickets/blocks'

/** Variables de un justificante de reserva (ver VARIABLES.reservation). */
export function reservationVariables(r: ReservationSummary): TemplateVariables {
  return {
    evento: r.event_title, fecha: formatDate(r.event_starts_at), hora: formatTime(r.event_starts_at), lugar: r.event_venue,
    tipo: r.type_name, articulo: itemName(r.item_name), titular: r.holder, codigo: r.code, cantidad: String(r.quantity),
    precio: formatPrice(Number(r.unit_price)), total: formatPrice(Number(r.total)), pendiente: formatPrice(Number(r.amount_pending)),
    pagado: formatPrice(Number(r.amount_paid)), estado: reservationStatusLabels[r.status], recogida_lugar: r.pickup_address,
    recogida_plazo: r.expires_at ? formatDateTime(r.expires_at) : 'sin fecha límite', recogida_instrucciones: r.pickup_instructions,
    personas: (r.people ?? []).map((p, i) => `${i + 1}. ${p.name}${p.document ? ` · ${p.document}` : ''}`).join('\n'),
  }
}

/** Reserva ficticia para la vista previa del editor de plantillas. */
export const SAMPLE_RESERVATION: ReservationSummary = {
  code: 'B8X8', holder: 'Lucía Martín', type_name: 'Bonocopas 5 consumiciones', quantity: 2, delivered_quantity: 0, pending_quantity: 2,
  unit_price: 24, total: 48, amount_paid: 0, amount_pending: 48, status: 'pending_pickup', created_at: '2026-11-20T18:00:00.000Z',
  expires_at: '2026-12-30T20:00:00.000Z', event_title: 'Cotillón Nochevieja 2026', event_starts_at: '2027-01-01T00:00:00.000Z',
  event_venue: 'Carpa de la Plaza de Toros', event_status: 'published', pickup_address: 'Boulevard Café & Copas, Medina del Campo',
  pickup_instructions: 'De lunes a viernes de 18:00 a 21:00. Trae el justificante y tu DNI.', item_name: 'bonocopas',
  people: [{ name: 'Lucía Martín', document: '•••••678Z' }, { name: 'Hugo Pérez', document: '•••••567L' }],
}
