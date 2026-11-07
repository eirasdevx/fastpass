'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getStaff } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { ticketCodeSchema } from '@/lib/security/inputs'
import { publicError } from '@/lib/security/errors'
import { audit } from '@/lib/security/audit'

export type ValidationResult = {
  result: 'valid' | 'already_used' | 'not_found' | 'cancelled' | 'wrong_event'
  code: string
  attendee_name?: string
  event_title?: string
  type_name?: string
  starts_at?: string
  used_at?: string | null
}

const inputSchema = z.object({
  code: ticketCodeSchema,
  eventId: z.uuid().nullable(),
})

export async function validateTicket(
  code: string,
  eventId: string | null
): Promise<{ data?: ValidationResult; error?: string }> {
  if (!(await getStaff())) { audit('access_denied'); return { error: 'Tu sesión ha caducado. Vuelve a entrar.' } }

  const parsed = inputSchema.safeParse({ code, eventId })
  if (!parsed.success) return { error: 'Código no válido' }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('validate_ticket', {
    p_code: parsed.data.code,
    ...(parsed.data.eventId ? { p_event_id: parsed.data.eventId } : {}),
  })
  if (error) return { error: publicError(error) }
  const outcome = (data as { result?: string } | null)?.result
  if (outcome === 'rate_limited') return { error: 'Demasiados intentos. Espera un minuto.' }
  if (!outcome || outcome === 'forbidden') return { error: 'No autorizado' }

  const result = data as unknown as ValidationResult
  if (result.result === 'valid' && parsed.data.eventId) {
    revalidatePath(`/admin/eventos/${parsed.data.eventId}`)
  }
  return { data: result }
}
