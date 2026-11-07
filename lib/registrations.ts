export type RegistrationRow = {
  registration_id: string | null
  ticket_id: string | null
  first_name: string
  last_name: string
  email: string
  phone: string
  notes: string
  name: string
  code: string | null
  type_name: string
  type_id: string
  status: 'pending' | 'valid' | 'used' | 'cancelled'
  created_at: string
  used_at: string | null
}
export type AttendeePage = { total: number; rows: RegistrationRow[] }
export type DashboardReservations = {
  reserved_pending: number; delivered: number; amount_collected: number
  reservations_active: number; reservations_completed: number; reservations_cancelled: number; reservations_expired: number
  committed?: number
}
export type Dashboard = {
  issued: number; used: number; valid: number; cancelled: number; pending: number; capacity: number | null
  // Desde 0016: modalidad del evento y cifras de reservas (null si el evento no tiene).
  mode?: string; item_name?: string; reservations?: DashboardReservations | null
}
export const statusLabels = { pending: 'Pendiente de confirmación', valid: 'Entrada válida', used: 'Entrada utilizada', cancelled: 'Entrada anulada' }
export const statusVariant = { pending: 'warning', valid: 'success', used: 'secondary', cancelled: 'destructive' } as const
export const eventStatusLabels = { draft: 'Borrador', published: 'Publicado', closed: 'Inscripciones cerradas', live: 'En curso', finished: 'Finalizado', cancelled: 'Cancelado' }
export const accessLabels: Record<string, string> = { ready: 'Pendiente de acceso', valid: 'Acceso confirmado', already_used: 'Entrada ya utilizada', cancelled: 'Entrada anulada — acceso denegado', not_found: 'Código no encontrado', forbidden: 'Sin autorización', rate_limited: 'Demasiados intentos', event_closed: 'Evento no disponible para acceso', reservation: 'Es una RESERVA, no una entrada' }
