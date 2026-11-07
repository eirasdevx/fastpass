'use server'

import { z } from 'zod'
import { getStaff } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { publicError } from '@/lib/security/errors'
import type { PaymentMethod, ReservationSummary } from '@/lib/reservations'

export type PickupLookup = { by_code: boolean; reservation: ReservationSummary }
export type PickupDone = { delivered: number; amount: number; reservation: ReservationSummary }

/** El QR lleva la URL del justificante; se extrae solo el token. Si no, se acepta el código de 4 caracteres. */
function credential(value: unknown) {
  if (typeof value !== 'string' || value.length > 300) return null
  const token = value.toLowerCase().match(/[a-f0-9]{64}/)?.[0]
  if (token) return token
  const code = value.replace(/[\s-]/g, '').toUpperCase()
  return /^[A-Z0-9]{4}$/.test(code) ? code : null
}

const SESSION_EXPIRED = 'Tu sesión ha caducado. Vuelve a iniciar sesión.'

/** `reason` es el código de error de la base de datos (NOT_FOUND, FORBIDDEN…) para que Accesos elija el aviso. */
export async function lookupReservation(event: string, value: string): Promise<{ error?: string; reason?: string; data?: PickupLookup }> {
  if (!(await getStaff())) return { error: SESSION_EXPIRED }
  const cred = credential(value)
  if (!z.uuid().safeParse(event).success || !cred) return { error: 'Escanea el QR o introduce el código de 4 caracteres.' }
  const db = await createClient()
  const { data, error } = await db.rpc('lookup_reservation', { p_event: event, p_credential: cred })
  if (error) return { error: publicError(error) }
  const result = data as unknown as { error?: string } & PickupLookup
  return result.error ? { error: publicError({ message: result.error }), reason: result.error } : { data: result }
}

const pickupSchema = z.object({
  event: z.uuid(),
  quantity: z.number().int().min(1).max(100),
  method: z.enum(['cash', 'card', 'bizum', 'other']),
  paid: z.boolean(),
  identity: z.boolean(),
})

export async function recordPickup(input: { event: string; credential: string; quantity: number; method: PaymentMethod; paid: boolean; identity: boolean }):
  Promise<{ error?: string; data?: PickupDone }> {
  if (!(await getStaff())) return { error: SESSION_EXPIRED }
  const parsed = pickupSchema.safeParse(input), cred = credential(input.credential)
  if (!parsed.success || !cred) return { error: 'Datos no válidos.' }
  const v = parsed.data, db = await createClient()
  // La base de datos bloquea la reserva: dos entregas simultáneas no pueden superar lo reservado.
  const { data, error } = await db.rpc('record_pickup', {
    p_event: v.event, p_credential: cred, p_quantity: v.quantity, p_method: v.method,
    p_payment_confirmed: v.paid, p_identity_checked: v.identity,
  })
  if (error) return { error: publicError(error) }
  const result = data as unknown as { error?: string } & PickupDone
  return result.error ? { error: publicError({ message: result.error }) } : { data: result }
}
