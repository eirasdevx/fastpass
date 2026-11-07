'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { siteUrl } from '@/lib/site-url'
import { authErrorMessage } from '@/lib/security/auth-errors'
import { publicError } from '@/lib/security/errors'
import { fieldErrors, passwordSchema } from '@/lib/validations/organizer'

export type InvitationState = { error?: string; fields?: Record<string, string>; sent?: boolean; existing?: boolean } | undefined

const token = z.string().regex(/^[a-f0-9]{64}$/)
const signupSchema = z.object({
  token,
  first_name: z.string().trim().min(1, 'Indica tu nombre').max(80, 'Máximo 80 caracteres'),
  last_name: z.string().trim().min(1, 'Indica tus apellidos').max(120, 'Máximo 120 caracteres'),
  password: passwordSchema,
  password_confirm: z.string().max(1024),
}).refine((d) => d.password === d.password_confirm, { message: 'Las contraseñas no coinciden', path: ['password_confirm'] })

/** El correo sale de la invitación, nunca del formulario. */
async function invitationEmail(value: string) {
  const supabase = await createClient()
  const { data } = await supabase.rpc('get_invitation', { p_token: value })
  const invitation = data as { email: string; status: string } | null
  return invitation?.status === 'valid' ? invitation.email : null
}

export async function acceptWithSignup(_prev: InvitationState, formData: FormData): Promise<InvitationState> {
  const parsed = signupSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { fields: fieldErrors(parsed.error) }
  const { first_name, last_name, password } = parsed.data
  const email = await invitationEmail(parsed.data.token)
  if (!email) return { error: publicError({ message: 'INVITATION_INVALID' }) }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${await siteUrl()}/auth/confirm?next=/login/mfa`,
      // El trigger de 0016 mete a la persona en el equipo al confirmar el correo.
      data: { first_name, last_name, invitation: parsed.data.token },
    },
  })
  if (error?.code === 'user_already_exists') return { existing: true }
  if (error) return { error: authErrorMessage(error) }
  // Con confirmación de correo activada, una cuenta existente vuelve sin identidades.
  if (data.user && data.user.identities?.length === 0) return { existing: true }
  if (data.session) redirect('/login/mfa')
  return { sent: true }
}

const loginSchema = z.object({ token, password: z.string().min(1).max(1024) })

export async function acceptWithLogin(_prev: InvitationState, formData: FormData): Promise<InvitationState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { existing: true, error: 'Introduce tu contraseña.' }
  const email = await invitationEmail(parsed.data.token)
  if (!email) return { existing: true, error: publicError({ message: 'INVITATION_INVALID' }) }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password: parsed.data.password })
  if (error?.code === 'email_not_confirmed') return { existing: true, error: 'Confirma tu correo con el enlace que te enviamos antes de entrar.' }
  if (error) return { existing: true, error: 'Contraseña incorrecta.' }
  const accepted = await supabase.rpc('accept_invitation', { p_token: parsed.data.token })
  if (accepted.error) {
    await supabase.auth.signOut()
    return { existing: true, error: 'No se pudo aceptar: esta cuenta ya pertenece a otro equipo o la invitación ya no es válida.' }
  }
  redirect('/login/mfa')
}
