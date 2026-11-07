import { formatDateTime, isPast } from '@/lib/format'

type ReadinessEvent = {
  status?: string | null
  registration_enabled?: boolean
  registration_mode?: string
  privacy_controller?: string
  privacy_contact?: string
  pickup_address?: string
  capacity: number | null
  starts_at: string
  ends_at: string | null
  reservations_open_at?: string | null
  reservations_close_at?: string | null
  pickup_deadline?: string | null
  pickup_item_name?: string
}

export type ReadinessKey = 'published' | 'enabled' | 'privacy' | 'types' | 'not_ended' | 'address' | 'not_open_yet' | 'closed' | 'deadline' | 'capacity'
export type ReadinessItem = { key: ReadinessKey; level: 'ok' | 'error' | 'warning'; label: string; fix?: string }

/**
 * Lo que tiene que cumplirse para que el formulario público (inscripción o reserva) esté abierto.
 * Repite en lenguaje sencillo las condiciones que la base de datos comprueba al reservar.
 */
export function formReadiness(event: ReadinessEvent, openTypes: number): { open: boolean; items: ReadinessItem[] } {
  const pickup = event.registration_mode === 'pickup'
  const thing = event.pickup_item_name?.trim() || 'bonocopas'
  const item = (key: ReadinessKey, ok: boolean, label: string, fix: string): ReadinessItem =>
    ({ key, level: ok ? 'ok' : 'error', label, fix: ok ? undefined : fix })
  const items: ReadinessItem[] = [
    item('published', ['published', 'live'].includes(event.status ?? ''), 'Evento publicado',
      'En «Publicación», cambia el estado a «Publicado». En borrador nadie ve el evento.'),
    item('enabled', !!event.registration_enabled, pickup ? 'Reservas activadas' : 'Formulario activado',
      `En «¿Cómo se consiguen las plazas?», marca «${pickup ? 'Reservas abiertas' : 'Formulario abierto'}».`),
    item('privacy', !!event.privacy_controller?.trim() && !!event.privacy_contact?.trim(), 'Datos de privacidad',
      'En «Privacidad», rellena el responsable y el correo de contacto.'),
    item('types', openTypes > 0, pickup ? `Al menos un tipo de ${thing} a la venta` : 'Al menos un tipo de entrada abierto',
      pickup ? `En «Tipos de ${thing}», añade uno o marca «Se puede reservar».` : 'En «Tipos de entrada», añade uno o marca «Venta abierta».'),
    item('not_ended', !isPast(event.ends_at ?? event.starts_at), 'El evento no ha terminado', 'Revisa la fecha de inicio o fin del evento.'),
  ]
  if (pickup) {
    items.push(item('address', !!event.pickup_address?.trim(), 'Punto de recogida indicado', 'En «Reservas y recogida», indica la dirección.'))
    if (event.reservations_open_at && !isPast(event.reservations_open_at))
      items.push({ key: 'not_open_yet', level: 'warning', label: `Las reservas se abrirán el ${formatDateTime(event.reservations_open_at)}`, fix: 'Si quieres abrirlas ya, borra la fecha de apertura.' })
    if (event.reservations_close_at && isPast(event.reservations_close_at))
      items.push({ key: 'closed', level: 'error', label: 'El plazo de reservas ha terminado', fix: 'Cambia o borra la fecha de cierre de reservas.' })
    if (event.pickup_deadline && isPast(event.pickup_deadline))
      items.push({ key: 'deadline', level: 'error', label: 'Ha pasado la fecha límite de recogida', fix: 'Cambia o borra la fecha límite de recogida.' })
  }
  if (event.capacity === null)
    items.push({ key: 'capacity', level: 'warning', label: 'Sin aforo total', fix: 'Solo limitan los cupos de cada tipo. Indica el aforo autorizado en «Aforo».' })
  const notYetOpen = items.some((i) => i.key === 'not_open_yet')
  return { open: !notYetOpen && items.every((i) => i.level !== 'error'), items }
}

/** Mensaje para el público: por qué no puede reservar, sin detalles de configuración. */
export function publicClosedReason(readiness: { open: boolean; items: ReadinessItem[] }, opensAt?: string | null) {
  if (readiness.open) return null
  const failing = new Set(readiness.items.filter((i) => i.level === 'error').map((i) => i.key))
  if (failing.size === 0 && opensAt) return `Las reservas se abren el ${formatDateTime(opensAt)}.`
  if (failing.has('closed') || failing.has('deadline') || failing.has('not_ended')) return 'El plazo de reservas ha terminado.'
  return 'Las reservas no están disponibles en este momento.'
}
