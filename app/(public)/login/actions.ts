'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { staffIdentity } from '@/lib/security/staff'
import { DEMO_MODE } from '@/lib/demo/mode'
import { safeAdminPath } from '@/lib/security/inputs'
import { audit } from '@/lib/security/audit'

const loginSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(1024),
  next: z.string().max(2048).optional(),
})

export type LoginState = { error?: string } | undefined

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: 'Introduce email y contraseña' }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  })
  // Supabase solo responde así si la contraseña es correcta: no revela cuentas a terceros.
  if (error?.code === 'email_not_confirmed') return { error: 'Confirma tu correo con el enlace que te enviamos antes de entrar.' }
  if (error) { audit('login_failed'); return { error: 'Email o contraseña incorrectos' } }
  if (!(await staffIdentity())) {
    await supabase.auth.signOut()
    audit('login_failed')
    return { error: 'Email o contraseña incorrectos' }
  }

  // Solo rutas internas para evitar redirecciones abiertas
  if (!DEMO_MODE) redirect('/login/mfa')
  redirect(safeAdminPath(parsed.data.next))
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
