'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { DEMO_MODE } from '@/lib/demo/mode'
import { publicError } from '@/lib/security/errors'
import { reservationSchema, type ReservationInput } from '@/lib/validations/reservation'

export type QueueStatus =
  | { status: 'open' }
  | { status: 'admitted'; token: string; expires_at: string }
  | { status: 'waiting'; token: string; ahead: number; eta_minutes: number }
  | { error: string }

/** Turno en la sala de espera: se pide al entrar y se consulta cada pocos segundos. */
export async function queueStatus(event: string, token: string): Promise<QueueStatus> {
  if (DEMO_MODE) return { status: 'open' }
  if (!z.uuid().safeParse(event).success) return { error: 'Evento no válido.' }
  const db = await createClient()
  const { data, error } = await db.rpc('queue_status', { p_event: event, ...(/^[a-f0-9]{64}$/.test(token) ? { p_token: token } : {}) })
  if (error) return { error: publicError(error) }
  const result = data as QueueStatus
  return 'error' in result ? { error: publicError({ message: result.error }) } : result
}

export async function reserveBonocopas(input: z.input<typeof reservationSchema>): Promise<{ error?: string; token?: string; queue?: boolean }> {
  if (DEMO_MODE) return { error: 'Las reservas requieren Supabase. Configura la base de datos para utilizar esta función.' }
  const parsed = reservationSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos no válidos' }
  const v: ReservationInput = parsed.data
  if (!v.consent) return { error: 'Acepta la información de privacidad.' }

  // Aforo, cupos, plazos, turno de la sala de espera y límites de intentos se comprueban en la base de datos, de forma atómica.
  const db = await createClient()
  const args = {
    p_event: v.event, p_type: v.type, p_quantity: v.quantity, p_first: v.first, p_last: v.last,
    p_email: v.email, p_phone: v.phone, p_consent: true, p_attendees: v.attendees,
  }
  let { data, error } = await db.rpc('reserve_with_pass', { p_pass: v.pass, ...args })
  // Base de datos sin la migración 0017 (no hay sala de espera): se reserva como antes.
  if (error?.code === 'PGRST202') ({ data, error } = await db.rpc('reserve_bonocopas', args))
  if (error) return { error: publicError(error) }
  const result = data as { error?: string; token?: string }
  if (result.error) return { error: publicError({ message: result.error }), queue: result.error === 'QUEUE_REQUIRED' }
  return { token: result.token }
}
