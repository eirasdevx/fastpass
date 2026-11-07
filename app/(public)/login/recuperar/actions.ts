'use server'

import { createClient } from '@/lib/supabase/server'
import { DEMO_MODE } from '@/lib/demo/mode'
import { siteUrl } from '@/lib/site-url'
import { authErrorMessage } from '@/lib/security/auth-errors'
import { emailSchema } from '@/lib/validations/organizer'

export type RecoverState = { error?: string; sent?: boolean } | undefined

export async function requestPasswordReset(_prev: RecoverState, formData: FormData): Promise<RecoverState> {
  const parsed = emailSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: 'Introduce un correo electrónico válido' }
  if (DEMO_MODE) return { error: 'En la versión beta no se envían correos: entra con cualquier contraseña.' }

  const supabase = await createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${await siteUrl()}/auth/confirm?next=/login/nueva-contrasena`,
  })
  // Solo se avisa de los límites de envío; el resto responde igual exista o no la cuenta.
  if (error?.code === 'over_email_send_rate_limit' || error?.code === 'over_request_rate_limit') {
    return { error: authErrorMessage(error) }
  }
  return { sent: true }
}
