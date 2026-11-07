import type { EmailOtpType } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DEMO_MODE } from '@/lib/demo/mode'

// Destinos permitidos tras el enlace del correo: nunca se redirige a otra web.
const NEXT = ['/login/mfa', '/login/nueva-contrasena']
const TYPES: EmailOtpType[] = ['signup', 'email', 'recovery', 'email_change']

/**
 * Enlaces de los correos de Supabase (confirmar cuenta, cambiar el correo y restablecer contraseña).
 * Admite ?token_hash=&type= (plantillas de docs/ORGANIZADORES.md, funciona desde
 * cualquier dispositivo) y ?code= (plantillas por defecto, mismo navegador).
 */
export async function GET(request: Request) {
  if (DEMO_MODE) redirect('/login')
  const params = new URL(request.url).searchParams
  const tokenHash = params.get('token_hash')
  const type = params.get('type') as EmailOtpType | null
  const code = params.get('code')
  const requested = params.get('next') ?? ''
  const next = type === 'recovery' ? '/login/nueva-contrasena' : NEXT.includes(requested) ? requested : '/login/mfa'

  const supabase = await createClient()
  let ok = false
  if (tokenHash && type && TYPES.includes(type)) {
    ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error
  } else if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error
  }
  redirect(ok ? next : '/login?aviso=enlace')
}
