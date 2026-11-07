import { z } from 'zod'
import { attendeeSchema } from '@/lib/validations/document'

export const reservationSchema = z.object({
  event: z.uuid(),
  type: z.uuid('Selecciona un tipo'),
  quantity: z.number({ error: 'Elige la cantidad' }).int().min(1, 'Elige la cantidad').max(100),
  first: z.string().trim().min(1, 'Introduce el nombre').max(60),
  last: z.string().trim().max(60),
  email: z.email('Correo no válido').max(254).toLowerCase(),
  phone: z.string().trim().max(30),
  consent: z.boolean(),
  attendees: z.array(attendeeSchema).max(100),
  // Pase de la sala de espera (vacío si el evento no la usa).
  pass: z.union([z.literal(''), z.string().regex(/^[a-f0-9]{64}$/)]).default(''),
  // Campo trampa invisible: los bots lo rellenan.
  website: z.string().max(0, 'No se pudo enviar el formulario'),
})
export type ReservationInput = z.infer<typeof reservationSchema>
