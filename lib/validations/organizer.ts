import { z } from 'zod'

// 72 bytes es el máximo que admite bcrypt, que usa Supabase Auth.
export const passwordSchema = z
  .string()
  .min(8, 'La contraseña debe tener al menos 8 caracteres')
  .max(72, 'La contraseña no puede superar los 72 caracteres')

const passwordPair = { password: passwordSchema, password_confirm: z.string().max(1024) }
const samePassword = (data: { password: string; password_confirm: string }) =>
  data.password === data.password_confirm
const mismatch = { message: 'Las contraseñas no coinciden', path: ['password_confirm'] }

export const profileSchema = z.object({
  first_name: z.string().trim().min(1, 'Indica tu nombre').max(80, 'Máximo 80 caracteres'),
  last_name: z.string().trim().min(1, 'Indica tus apellidos').max(120, 'Máximo 120 caracteres'),
  organization: z.string().trim().min(1, 'Indica el nombre del grupo').max(120, 'Máximo 120 caracteres'),
})

export const signupSchema = profileSchema
  .extend({ email: z.email('Correo electrónico no válido').max(254), ...passwordPair })
  .refine(samePassword, mismatch)

export const newPasswordSchema = z
  .object({ ...passwordPair, code: z.string().regex(/^\d{6}$/, 'Introduce el código de seis dígitos').optional() })
  .refine(samePassword, mismatch)

export const emailSchema = z.object({ email: z.email('Correo electrónico no válido').max(254) })

// Perfil propio: cambiar el correo o la contraseña pide la contraseña actual.
const currentPassword = z.string().min(1, 'Escribe tu contraseña actual').max(1024)
export const nameSchema = profileSchema.pick({ first_name: true, last_name: true })
export const changeEmailSchema = emailSchema.extend({ current_password: currentPassword })
export const changePasswordSchema = z
  .object({ ...passwordPair, current_password: currentPassword })
  .refine(samePassword, mismatch)

/** Primer mensaje de cada campo, para mostrarlo debajo del campo correspondiente. */
export function fieldErrors(error: z.ZodError) {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? '')
    out[key] ??= issue.message
  }
  return out
}
