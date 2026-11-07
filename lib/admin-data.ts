import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { DEMO_MODE } from '@/lib/demo/mode'
import type { AttendeePage, Dashboard, DashboardReservations } from '@/lib/registrations'
import type { ReservationPage, ReservationPeoplePage } from '@/lib/reservations'
import { z } from 'zod'

export async function staffEvents() {
  if (DEMO_MODE) return []
  const db = await createClient()
  const { data, error } = await db.rpc('staff_events')
  if (error) throw new Error('No se pudieron cargar los eventos.')
  return data ?? []
}
/**
 * Cifras del resumen de un evento. Con la migración 0016, event_dashboard ya trae las
 * reservas; sin ella se completan con reservation_stats (0008) para que el resumen de un
 * evento con recogida no se quede en ceros. null = sin permiso o error.
 */
export async function eventDashboard(event: string): Promise<Dashboard | null> {
  const db = await createClient()
  const { data, error } = await db.rpc('event_dashboard', { p_event: event })
  if (error || !data) return null
  const dashboard = data as unknown as Dashboard
  if (dashboard.mode !== undefined) return dashboard
  const { data: ev } = await db.from('events').select('registration_mode,pickup_item_name').eq('id', event).maybeSingle()
  if (ev?.registration_mode !== 'pickup') return { ...dashboard, mode: ev?.registration_mode ?? undefined, reservations: null }
  const stats = await db.rpc('reservation_stats', { p_event: event })
  return { ...dashboard, mode: 'pickup', item_name: ev.pickup_item_name ?? undefined, reservations: stats.error ? null : stats.data as unknown as DashboardReservations }
}
export type SearchParams =Record<string, string | string[] | undefined>
const string = (v: string | string[] | undefined) => typeof v === 'string' ? v : ''
export function attendeeFilters(params: SearchParams) {
  return {
    p_query: string(params.q).slice(0,120),
    p_status: ['pending','valid','used','cancelled'].includes(string(params.estado)) ? string(params.estado) : '',
    p_type: z.uuid().safeParse(params.tipo).success ? string(params.tipo) : undefined,
    p_page: Math.min(100000,Math.max(1,Number.parseInt(string(params.pagina)) || 1)),
    p_ascending: params.orden === 'asc',
  }
}
export async function attendeePage(event: string, params: SearchParams, size = 25) {
  const db = await createClient()
  const {data,error}=await db.rpc('list_attendees',{p_event:event,...attendeeFilters(params),p_size:size})
  if(error) throw new Error('No se pudo cargar el listado.')
  return data as unknown as AttendeePage
}

export function reservationFilters(params: SearchParams) {
  return {
    p_query: string(params.q).slice(0, 120),
    p_status: ['pending_pickup','partially_picked_up','completed','cancelled','expired'].includes(string(params.estado)) ? string(params.estado) : '',
    p_type: z.uuid().safeParse(params.tipo).success ? string(params.tipo) : undefined,
    p_page: Math.min(100000, Math.max(1, Number.parseInt(string(params.pagina)) || 1)),
    p_ascending: params.orden === 'asc',
  }
}
export async function reservationPage(event: string, params: SearchParams, size = 25) {
  const db = await createClient()
  const { data, error } = await db.rpc('list_reservations', { p_event: event, ...reservationFilters(params), p_size: size })
  if (error) throw new Error('No se pudo cargar el listado de reservas.')
  return data as unknown as ReservationPage
}
export async function reservationPeoplePage(event: string, params: SearchParams, size = 25) {
  const db = await createClient()
  const { data, error } = await db.rpc('list_reservation_people', { p_event: event, ...reservationFilters(params), p_size: size })
  if (error) throw new Error('No se pudo cargar el listado de asistentes.')
  return data as unknown as ReservationPeoplePage
}

/** Estados en los que el evento se trabaja en Accesos: publicado (también con las ventas o reservas cerradas) o en curso. */
export const ACCESS_STATUSES = ['published', 'closed', 'live']
