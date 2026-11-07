/** Nombre de lo que se recoge en la modalidad de recogida (configurable por evento). */
export const itemName = (name?: string | null) => name?.trim() || 'bonocopas'
export const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

export type ReservationStatus = 'pending_pickup' | 'partially_picked_up' | 'completed' | 'cancelled' | 'expired'

/** Lo que devuelven get_reservation, lookup_reservation y record_pickup (sin correo ni teléfono). */
export type ReservationSummary = {
  code: string
  holder: string
  type_name: string
  quantity: number
  delivered_quantity: number
  pending_quantity: number
  unit_price: number
  total: number
  amount_paid: number
  amount_pending: number
  status: ReservationStatus
  created_at: string
  expires_at: string | null
  event_title: string
  event_starts_at: string
  event_venue: string
  event_status: string
  pickup_address: string
  pickup_instructions: string
  /** Lo que se recoge, en plural y minúsculas (bonocopas, pulseras…). */
  item_name: string
  /** Personas de la reserva; el documento llega enmascarado (•••••678Z). */
  people?: { name: string; document: string | null }[]
  /** Plantilla del justificante elegida en el tipo (jsonb); null = la de por defecto. */
  design?: unknown
  /** Fecha de la última entrega registrada, si la hay. */
  last_pickup_at?: string | null
}

export const reservationStatusLabels: Record<ReservationStatus, string> = {
  pending_pickup: 'Pendiente de recogida',
  partially_picked_up: 'Recogida parcialmente',
  completed: 'Recogida completada',
  cancelled: 'Cancelada',
  expired: 'Caducada',
}

/** Color de la etiqueta de estado en los listados. */
export const reservationStatusVariant: Record<ReservationStatus, 'warning' | 'success' | 'destructive' | 'secondary'> = {
  pending_pickup: 'warning',
  partially_picked_up: 'warning',
  completed: 'success',
  cancelled: 'destructive',
  expired: 'secondary',
}

export const paymentMethodLabels ={ cash: 'Efectivo', card: 'Tarjeta', bizum: 'Bizum', other: 'Otro' } as const
export type PaymentMethod = keyof typeof paymentMethodLabels

export type ReservationRow = {
  id: string
  code: string
  name: string
  email: string
  phone: string
  type_id: string
  type_name: string
  quantity: number
  delivered_quantity: number
  unit_price: number
  amount_paid: number
  total: number
  status: ReservationStatus
  source: 'public' | 'manual'
  created_at: string
  people: string | null
}
export type ReservationPage = { total: number; rows: ReservationRow[] }

/** Asistente de un evento con reserva: una persona de una reserva (o el titular con todas sus plazas). */
export type ReservationPersonRow = {
  reservation_id: string
  position: number
  name: string
  document_id: string | null
  birth_date: string | null
  /** Plazas que representa la fila: 1 por persona, o la cantidad reservada si no hay datos por persona. */
  places: number
  code: string
  email: string
  phone: string
  type_name: string
  quantity: number
  delivered_quantity: number
  status: ReservationStatus
  created_at: string
}
export type ReservationPeoplePage = { total: number; places: number; rows: ReservationPersonRow[] }

export type ReservationDetail = ReservationSummary & {
  id: string
  event_id: string
  email: string
  phone: string
  notes: string
  source: 'public' | 'manual'
  cancelled_at: string | null
  privacy_accepted_at: string | null
  /** Fecha en que se suprimieron sus datos personales (RGPD). */
  personal_data_removed_at?: string | null
  attendees?: { position: number; first_name: string; last_name: string; document_id: string | null; birth_date: string | null }[]
  pickups: { quantity: number; amount: number; payment_method: PaymentMethod; created_at: string; admin_email: string | null }[]
}

export type ReservationStats = {
  capacity: number | null
  other_channels: number
  tickets: number
  registrations_pending: number
  reserved_pending: number
  delivered: number
  amount_collected: number
  reservations_active: number
  reservations_completed: number
  reservations_cancelled: number
  reservations_expired: number
  committed: number
}
