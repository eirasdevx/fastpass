'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DEMO_MODE } from '@/lib/demo/mode'
import { siteUrl } from '@/lib/site-url'
import { authErrorMessage } from '@/lib/security/auth-errors'
import { fieldErrors, signupSchema } from '@/lib/validations/organizer'

type SignupValues = { email?: string; first_name?: string; last_name?: string; organization?: string }

export type SignupState =
  | { error?: string; fields?: Record<string, string>; values?: SignupValues; sent?: boolean }
  | undefined

export async function signup(_prev: SignupState, formData: FormData): Promise<SignupState> {
  const input = Object.fromEntries(formData)
  // Se devuelven para que el formulario no se vacíe; nunca las contraseñas.
  const values: SignupValues = {
    email: String(input.email ?? '').slice(0, 254),
    first_name: String(input.first_name ?? '').slice(0, 80),
    last_name: String(input.last_name ?? '').slice(0, 120),
    organization: String(input.organization ?? '').slice(0, 120),
  }
  const parsed = signupSchema.safeParse(input)
  if (!parsed.success) return { fields: fieldErrors(parsed.error), values }
  const { email, password, first_name, last_name, organization } = parsed.data

  const supabase = await createClient()
  if (DEMO_MODE) {
    // Versión beta: no hay correos ni base de datos; se entra directamente.
    await supabase.auth.signInWithPassword({ email, password })
    redirect('/admin')
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${await siteUrl()}/auth/confirm?next=/login/mfa`,
      // El trigger de 0005_organizer_signup.sql crea el grupo al confirmar el correo.
      data: { first_name, last_name, organization_name: organization },
    },
  })
  // Una cuenta ya existente responde igual que una nueva: no se revela qué correos están dados de alta.
  if (error && error.code !== 'user_already_exists') return { error: authErrorMessage(error), values }
  // Si el proyecto no exige confirmar el correo, la sesión llega ya abierta.
  if (data.session) redirect('/login/mfa')
  return { sent: true }
}
