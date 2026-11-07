'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getAdmin } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { publicError } from '@/lib/security/errors'
import { attendeeSchema } from '@/lib/validations/document'

const manualSchema = z.object({
  event: z.uuid(),
  type: z.uuid('Selecciona un tipo'),
  quantity: z.number().int().min(1, 'Cantidad no válida').max(100, 'Cantidad no válida'),
  first: z.string().trim().min(1, 'Introduce el nombre').max(60),
  last: z.string().trim().max(60),
  email: z.email('Correo no válido').max(254).toLowerCase(),
  phone: z.string().trim().max(30),
  notes: z.string().max(2000),
  attendees: z.array(attendeeSchema).max(100),
})
export type ManualReservationInput = z.infer<typeof manualSchema>

/** Alta manual (p. ej. por teléfono o en persona): sin límites de intentos ni de plazo de apertura. */
export async function createManualReservation(input: ManualReservationInput): Promise<{ error?: string; token?: string; code?: string }> {
  if (!(await getAdmin())) return { error: 'No autorizado.' }
  const parsed = manualSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos no válidos.' }
  const v = parsed.data, db = await createClient()
  const { data, error } = await db.rpc('reserve_bonocopas', {
    p_event: v.event, p_type: v.type, p_quantity: v.quantity, p_first: v.first, p_last: v.last,
    p_email: v.email, p_phone: v.phone, p_consent: false, p_manual: true, p_notes: v.notes, p_attendees: v.attendees,
  })
  if (error) return { error: publicError(error) }
  const result = data as { error?: string; token?: string; code?: string }
  if (result.error) return { error: publicError({ message: result.error }) }
  revalidatePath('/admin/reservas')
  return { token: result.token, code: result.code }
}

export async function cancelReservation(id: string): Promise<{ error?: string; success?: boolean }> {
  if (!(await getAdmin())) return { error: 'No autorizado.' }
  if (!z.uuid().safeParse(id).success) return { error: 'Datos no válidos.' }
  const db = await createClient()
  const { data, error } = await db.rpc('cancel_reservation', { p_reservation: id })
  if (error) return { error: publicError(error) }
  const result = data as { error?: string }
  if (result.error) return { error: result.error === 'INVALID_TRANSITION' ? 'Esta reserva ya está completada o cancelada.' : publicError({ message: result.error }) }
  revalidatePath('/admin/reservas')
  return { success: true }
}

export async function rotateReservationLink(id: string): Promise<{ error?: string; token?: string }> {
  if (!(await getAdmin())) return { error: 'No autorizado.' }
  if (!z.uuid().safeParse(id).success) return { error: 'Datos no válidos.' }
  const db = await createClient()
  const { data, error } = await db.rpc('rotate_reservation_link', { p_reservation: id })
  if (error) return { error: publicError(error) }
  return { token: data }
}

/** Solicitud de supresión de una persona: borra sus datos de esta reserva. */
export async function redactReservation(id: string): Promise<{ error?: string; success?: boolean }> {
  if (!(await getAdmin())) return { error: 'No autorizado.' }
  if (!z.uuid().safeParse(id).success) return { error: 'Datos no válidos.' }
  const db = await createClient()
  const { data, error } = await db.rpc('redact_reservation', { p_reservation: id })
  if (error) return { error: publicError(error) }
  const result = data as { error?: string }
  if (result.error) return { error: publicError({ message: result.error }) }
  revalidatePath('/admin/reservas')
  return { success: true }
}

/** Borra ya los datos personales de un evento terminado. */
export async function purgeEventPersonalData(event: string): Promise<{ error?: string; success?: boolean }> {
  if (!(await getAdmin())) return { error: 'No autorizado.' }
  if (!z.uuid().safeParse(event).success) return { error: 'Datos no válidos.' }
  const db = await createClient()
  const { data, error } = await db.rpc('purge_event_personal_data', { p_event: event })
  if (error) return { error: publicError(error) }
  const result = data as { error?: string }
  if (result.error) return { error: result.error === 'EVENT_NOT_FINISHED' ? 'Solo se puede hacer cuando el evento ha terminado.' : publicError({ message: result.error }) }
  revalidatePath(`/admin/eventos/${event}`)
  revalidatePath('/admin/reservas')
  return { success: true }
}
