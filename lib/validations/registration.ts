import { z } from 'zod'
export const registrationSchema = z.object({
  event: z.uuid(), type: z.uuid('Selecciona un tipo de entrada'),
  first: z.string().trim().min(1, 'Introduce el nombre').max(60),
  last: z.string().trim().max(60), email: z.email('Correo no válido').max(254).toLowerCase(),
  phone: z.string().trim().max(30), consent: z.boolean(),
  website: z.string().max(0, 'No se pudo enviar el formulario'),
  notes: z.string().max(2000), approve: z.boolean(),
})
export type RegistrationInput = z.infer<typeof registrationSchema>
export const privateTokenSchema = z.string().regex(/^[a-f0-9]{64}$/)
export const entryCodeSchema = z.string().trim().max(64).transform(v=>v.replace(/[ -]/g,'').toUpperCase())
  .refine(v=>/^[A-Z0-9]{4}$|^[A-F0-9]{16}$|^[A-F0-9]{32}$/.test(v),'Código no válido')
