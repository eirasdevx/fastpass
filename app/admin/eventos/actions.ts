'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getAdmin, canManageEvent } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { localInputToIso } from '@/lib/format'
import { slugify } from '@/lib/utils'
import {
  eventSchema,
  ticketTypeSchema,
  type EventInput,
  type TicketTypeInput,
} from '@/lib/validations/event'
import type { TicketStatus } from '@/types/database'
import { z } from 'zod'
import { publicError } from '@/lib/security/errors'
import { removeCovers } from '@/lib/covers'

type Result = { error?: string; success?: boolean }

function toEventRow(data: EventInput) {
  return {
    title: data.title,
    description: data.description,
    venue: data.venue,
    starts_at: localInputToIso(data.starts_at),
    ends_at: data.ends_at ? localInputToIso(data.ends_at) : null,
    cover_url: data.cover_url || null,
    latitude: data.latitude ?? null,
    longitude: data.longitude ?? null,
    published: data.status ? data.status !== 'draft' : data.published,
    capacity: data.capacity ?? null,
    status: data.status ?? (data.published ? 'published' : 'draft'),
    registration_enabled: data.registration_enabled ?? false,
    registration_mode: data.registration_mode ?? 'manual',
    phone_required: data.phone_required ?? false,
    last_name_required: data.last_name_required ?? true,
    prevent_duplicates: data.prevent_duplicates ?? true,
    privacy_controller: data.privacy_controller ?? '',
    privacy_contact: data.privacy_contact ?? '',
    retention_days: data.retention_days ?? 90,
    reservations_open_at: data.reservations_open_at ? localInputToIso(data.reservations_open_at) : null,
    reservations_close_at: data.reservations_close_at ? localInputToIso(data.reservations_close_at) : null,
    pickup_deadline: data.pickup_deadline ? localInputToIso(data.pickup_deadline) : null,
    pickup_address: data.pickup_address ?? '',
    pickup_instructions: data.pickup_instructions ?? '',
    max_per_person: data.max_per_person ?? null,
    reserved_other_channels: data.reserved_other_channels ?? 0,
    attendee_details: data.attendee_details ?? false,
    require_document: data.require_document ?? false,
    // La edad mínima solo se puede comprobar con la fecha de nacimiento.
    require_birth_date: (data.require_birth_date ?? false) || data.min_age != null,
    min_age: data.min_age ?? null,
    pickup_item_name: data.pickup_item_name?.trim().toLowerCase() || 'bonocopas',
    // Solo se envían si el formulario los trae: así una base sin la migración 0017 puede seguir guardando.
    ...(data.queue_enabled !== undefined && { queue_enabled: data.queue_enabled, queue_capacity: data.queue_capacity ?? 100 }),
  }
}

function revalidateEvent(eventId: string) {
  revalidatePath('/admin')
  revalidatePath(`/admin/eventos/${eventId}`)
  revalidatePath('/', 'layout') // páginas públicas
}

// --- Eventos -------------------------------------------------------------------

export async function createEvent(input: EventInput): Promise<Result> {
  if (!(await getAdmin())) return { error: 'No autorizado' }
  const parsed = eventSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

  const supabase = await createClient()
  const slug = `${slugify(parsed.data.title) || 'evento'}-${crypto.randomUUID().slice(0, 6)}`

  const { data, error } = await supabase
    .from('events')
    .insert({ ...toEventRow(parsed.data), slug })
    .select('id')
    .single()

  if (error) return { error: publicError(error) }

  revalidatePath('/admin')
  redirect(`/admin/eventos/${data.id}`)
}

export async function updateEvent(id: string, input: EventInput): Promise<Result> {
  if (!(await getAdmin())) return { error: 'No autorizado' }
  if (!z.uuid().safeParse(id).success) return { error: 'Datos inválidos' }
  if (!(await canManageEvent(id))) return { error: 'No autorizado' }
  const parsed = eventSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

  const supabase = await createClient()
  const row = toEventRow(parsed.data)
  const { data: before } = await supabase.from('events').select('cover_url').eq('id', id).maybeSingle()
  const { error } = await supabase.from('events').update(row).eq('id', id)
  if (error) return { error: publicError(error) }
  // La portada anterior ya no se usa: se borra del almacenamiento.
  if (before?.cover_url && before.cover_url !== row.cover_url) await removeCovers(supabase, [before.cover_url])

  revalidateEvent(id)
  return { success: true }
}

export async function deleteEvent(id: string): Promise<Result> {
  if (!(await getAdmin())) return { error: 'No autorizado' }
  if (!z.uuid().safeParse(id).success) return { error: 'Datos inválidos' }
  if (!(await canManageEvent(id))) return { error: 'No autorizado' }
  const supabase = await createClient()
  const { data: before } = await supabase.from('events').select('cover_url').eq('id', id).maybeSingle()
  const { error } = await supabase.from('events').delete().eq('id', id)
  if (error) return { error: publicError(error) }
  await removeCovers(supabase, [before?.cover_url])

  revalidatePath('/', 'layout')
  redirect('/admin')
}

// --- Tipos de entrada ----------------------------------------------------------

export async function saveTicketType(
  eventId: string,
  ticketTypeId: string | null,
  input: TicketTypeInput
): Promise<Result> {
  if (!(await getAdmin())) return { error: 'No autorizado' }
  if (!z.uuid().safeParse(eventId).success || (ticketTypeId !== null && !z.uuid().safeParse(ticketTypeId).success)) return { error: 'Datos inválidos' }
  if (!(await canManageEvent(eventId))) return { error: 'No autorizado' }
  const parsed = ticketTypeSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

  const supabase = await createClient()
  const { error } = ticketTypeId
    ? await supabase.from('ticket_types').update(parsed.data).eq('id', ticketTypeId).eq('event_id', eventId)
    : await supabase.from('ticket_types').insert({ ...parsed.data, event_id: eventId })

  if (error) return { error: publicError(error) }

  revalidateEvent(eventId)
  return { success: true }
}

export async function deleteTicketType(eventId: string, ticketTypeId: string): Promise<Result> {
  if (!(await getAdmin())) return { error: 'No autorizado' }
  if (!z.uuid().safeParse(eventId).success || !z.uuid().safeParse(ticketTypeId).success) return { error: 'Datos inválidos' }
  if (!(await canManageEvent(eventId))) return { error: 'No autorizado' }
  const supabase = await createClient()
  const { error } = await supabase.from('ticket_types').delete().eq('id', ticketTypeId).eq('event_id', eventId)

  if (error) {
    // 23503 = foreign_key_violation: ya hay entradas emitidas de este tipo
    if (error.code === '23503') {
      return { error: 'Ya hay entradas emitidas de este tipo. Cierra la venta en lugar de borrarlo.' }
    }
    return { error: publicError(error) }
  }

  revalidateEvent(eventId)
  return { success: true }
}

// --- Entradas ------------------------------------------------------------------

export async function setTicketStatus(
  eventId: string,
  ticketId: string,
  status: TicketStatus
): Promise<Result> {
  const admin = await getAdmin()
  if (!admin) return { error: 'No autorizado' }
  if (!z.uuid().safeParse(eventId).success || !z.uuid().safeParse(ticketId).success ||
    !z.enum(['valid', 'used', 'cancelled']).safeParse(status).success) return { error: 'Datos inválidos' }
  if (!(await canManageEvent(eventId))) return { error: 'No autorizado' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('tickets')
    .update({ status })
    .eq('id', ticketId)
    .eq('event_id', eventId)

  if (error) return { error: publicError(error) }

  revalidateEvent(eventId)
  return { success: true }
}
