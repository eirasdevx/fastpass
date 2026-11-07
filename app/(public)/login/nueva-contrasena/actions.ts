'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { audit } from '@/lib/security/audit'
import { authErrorMessage } from '@/lib/security/auth-errors'
import { fieldErrors, newPasswordSchema } from '@/lib/validations/organizer'

export type NewPasswordState = { error?: string; fields?: Record<string, string> } | undefined

export async function updatePassword(_prev: NewPasswordState, formData: FormData): Promise<NewPasswordState> {
  const input = Object.fromEntries(formData)
  if (input.code === '') delete input.code
  const parsed = newPasswordSchema.safeParse(input)
  if (!parsed.success) return { fields: fieldErrors(parsed.error) }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'El enlace ha caducado. Solicita uno nuevo.' }

  // Con MFA activado, Supabase exige el código del autenticador para cambiar la contraseña.
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aal?.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
    if (!parsed.data.code) return { fields: { code: 'Introduce el código de seis dígitos' } }
    const { data: factors } = await supabase.auth.mfa.listFactors()
    const factor = factors?.totp.find((f) => f.status === 'verified')
    const verified = factor && (await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: parsed.data.code }))
    if (!verified || verified.error) { audit('mfa_failed'); return { fields: { code: 'Código incorrecto o caducado' } } }
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error) return { error: authErrorMessage(error) }
  // Cierra todas las sesiones abiertas con la contraseña anterior.
  await supabase.auth.signOut({ scope: 'global' })
  redirect('/login?aviso=contrasena')
}
