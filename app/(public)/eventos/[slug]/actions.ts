'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { purchaseSchema, type PurchaseInput } from '@/lib/validations/purchase'
import { z } from 'zod'
import { publicError } from '@/lib/security/errors'

export async function purchaseTickets(eventId: string, input: PurchaseInput) {
  if (!z.uuid().safeParse(eventId).success) return { error: 'Evento no válido' }
  const parsed = purchaseSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

  const supabase = await createClient()
  const { data: token, error } = await supabase.rpc('purchase_tickets', {
    p_event_id: eventId,
    p_buyer_name: parsed.data.buyer_name,
    p_buyer_email: parsed.data.buyer_email,
    p_items: parsed.data.items.filter((i) => i.quantity > 0),
    p_request_id: parsed.data.request_id,
  })

  if (error) return { error: publicError(error) }
  if (!z.uuid().safeParse(token).success) return { error: 'No se pudo completar la operación.' }

  redirect(`/entradas/${token}?nuevo=1`)
}
