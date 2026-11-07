import { z } from 'zod'
import { optionalImageUrl } from '@/lib/security/inputs'

const localDateTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Fecha y hora no válidas')

export const eventSchema = z
  .object({
    title: z.string().trim().min(1, 'El título es obligatorio').max(120),
    description: z.string().max(5000),
    venue: z.string().trim().max(200),
    starts_at: localDateTime,
    ends_at: z.union([z.literal(''), localDateTime]),
    cover_url: optionalImageUrl,
    // Punto exacto en el mapa (opcional): las dos coordenadas o ninguna.
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
    capacity: z.number().int().positive().max(2147483647).nullable().optional(),
    published: z.boolean(),
    status: z.enum(['draft','published','closed','live','finished','cancelled']).optional(),
    registration_enabled: z.boolean().optional(),
    registration_mode: z.enum(['manual','automatic','payment','pickup']).optional(),
    phone_required: z.boolean().optional(),
    last_name_required: z.boolean().optional(),
    prevent_duplicates: z.boolean().optional(),
    privacy_controller: z.string().trim().max(300).optional(),
    privacy_contact: z.union([z.literal(''),z.email().max(254)]).optional(),
    retention_days: z.number().int().min(1).max(3650).optional(),
    // Reserva con recogida y pago presencial (modalidad 'pickup')
    reservations_open_at: z.union([z.literal(''), localDateTime]).optional(),
    reservations_close_at: z.union([z.literal(''), localDateTime]).optional(),
    pickup_deadline: z.union([z.literal(''), localDateTime]).optional(),
    pickup_address: z.string().trim().max(300).optional(),
    pickup_instructions: z.string().trim().max(2000).optional(),
    max_per_person: z.number().int().min(1, 'Debe ser al menos 1').max(100).nullable().optional(),
    attendee_details: z.boolean().optional(),
    require_document: z.boolean().optional(),
    require_birth_date: z.boolean().optional(),
    min_age: z.number().int().min(1, 'Edad no válida').max(120, 'Edad no válida').nullable().optional(),
    pickup_item_name: z.string().trim().min(1, 'Indica qué se recoge').max(40).optional(),
    reserved_other_channels: z.number({ error: 'Número no válido' }).int().min(0, 'No puede ser negativo').max(1000000).optional(),
    // Sala de espera virtual para picos de público.
    queue_enabled: z.boolean().optional(),
    queue_capacity: z.number({ error: 'Número no válido' }).int().min(1, 'Debe ser al menos 1').max(10000, 'Máximo 10.000').optional(),
  })
  .refine((v) => (v.latitude == null) === (v.longitude == null), {
    message: 'Ubicación incompleta: vuelve a marcarla en el mapa',
    path: ['latitude'],
  })
  .refine((v) => !v.ends_at || v.ends_at >= v.starts_at, {
    message: 'El fin debe ser posterior al inicio',
    path: ['ends_at'],
  })
  .refine((v) => !v.reservations_open_at || !v.reservations_close_at || v.reservations_close_at > v.reservations_open_at, {
    message: 'El cierre debe ser posterior a la apertura',
    path: ['reservations_close_at'],
  })
  .refine((v) => !v.registration_enabled || !!v.privacy_controller, {
    message: 'Obligatorio para abrir el formulario',
    path: ['privacy_controller'],
  })
  .refine((v) => !v.registration_enabled || !!v.privacy_contact, {
    message: 'Obligatorio para abrir el formulario',
    path: ['privacy_contact'],
  })
  .refine((v) => v.registration_mode !== 'pickup' || !!v.pickup_address, {
    message: 'Indica el punto de recogida',
    path: ['pickup_address'],
  })

export type EventInput = z.infer<typeof eventSchema>

export const ticketTypeSchema = z.object({
  name: z.string().trim().min(1, 'Ponle un nombre').max(60),
  description: z.string().max(500),
  price: z.number({ error: 'Precio no válido' }).min(0, 'No puede ser negativo').max(100000),
  // NaN (campo vacío) = sin límite
  capacity: z.number().int().positive('Debe ser mayor que 0').max(2147483647).nullable(),
  max_per_order: z.number({ error: 'Número no válido' }).int().min(1).max(50),
  template_id: z.uuid().nullable(),
  sales_open: z.boolean(),
})

export type TicketTypeInput = z.infer<typeof ticketTypeSchema>
