'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient as createStatelessClient } from '@supabase/supabase-js'
import { getStaff } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { DEMO_MODE } from '@/lib/demo/mode'
import { audit } from '@/lib/security/audit'
import { authErrorMessage } from '@/lib/security/auth-errors'
import { publicError } from '@/lib/security/errors'
import { siteUrl } from '@/lib/site-url'
import { removeCovers } from '@/lib/covers'
import { changeEmailSchema, changePasswordSchema, fieldErrors, nameSchema } from '@/lib/validations/organizer'

export type ProfileState = { error?: string; fields?: Record<string, string>; success?: string } | undefined

const DEMO_ERROR = { error: 'En la versión de demostración no se pueden cambiar los datos de la cuenta.' }

/**
 * Comprueba la contraseña actual con un cliente aparte que no toca las cookies: la sesión
 * del panel (con la verificación en dos pasos) sigue igual. Supabase limita los intentos.
 */
async function checkPassword(email: string, password: string) {
  const probe = createStatelessClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
  const { error } = await probe.auth.signInWithPassword({ email, password })
  if (error) { audit('login_failed'); return false }
  // Esa sesión de comprobación no se usa: se cierra al momento.
  await probe.auth.signOut({ scope: 'local' })
  return true
}

export async function updateName(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const user = await getStaff()
  if (!user) return { error: 'No autorizado.' }
  if (DEMO_MODE) return DEMO_ERROR
  const parsed = nameSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { fields: fieldErrors(parsed.error) }
  const { error } = await (await createClient()).auth.updateUser({ data: parsed.data })
  if (error) return { error: authErrorMessage(error) }
  revalidatePath('/admin', 'layout')
  return { success: 'Nombre actualizado.' }
}

export async function updateEmail(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const user = await getStaff()
  if (!user?.email) return { error: 'No autorizado.' }
  if (DEMO_MODE) return DEMO_ERROR
  const parsed = changeEmailSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { fields: fieldErrors(parsed.error) }
  const email = parsed.data.email.trim().toLowerCase()
  if (email === user.email.toLowerCase()) return { fields: { email: 'Es el correo que ya tienes.' } }
  if (!(await checkPassword(user.email, parsed.data.current_password))) return { fields: { current_password: 'Contraseña incorrecta' } }
  const { error } = await (await createClient()).auth.updateUser(
    { email }, { emailRedirectTo: `${await siteUrl()}/auth/confirm?next=/login/mfa` })
  if (error) return { error: authErrorMessage(error) }
  return { success: `Te hemos enviado un enlace a ${email} (y otro a tu correo actual si así lo pide la configuración). El cambio se aplica al abrirlo; hasta entonces sigues entrando con el correo de siempre.` }
}

export async function changePassword(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const user = await getStaff()
  if (!user?.email) return { error: 'No autorizado.' }
  if (DEMO_MODE) return DEMO_ERROR
  const parsed = changePasswordSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { fields: fieldErrors(parsed.error) }
  if (!(await checkPassword(user.email, parsed.data.current_password))) return { fields: { current_password: 'Contraseña incorrecta' } }
  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error) return { error: authErrorMessage(error) }
  // Cierra las sesiones abiertas en otros dispositivos con la contraseña anterior; esta sigue abierta.
  await supabase.auth.signOut({ scope: 'others' })
  return { success: 'Contraseña cambiada. Se ha cerrado la sesión en tus otros dispositivos.' }
}

/** Borra la cuenta con la que se ha iniciado sesión. Hay que escribir el correo para confirmar. */
export async function deleteOwnAccount(confirmation:string):Promise<{error?:string}>{
  const user=await getStaff()
  if(!user)return {error:'No autorizado.'}
  if(DEMO_MODE)return {error:'En la versión de demostración no se pueden borrar cuentas.'}
  if(typeof confirmation!=='string'||confirmation.trim().toLowerCase()!==(user.email??'').toLowerCase())return {error:'Escribe tu correo exactamente para confirmar.'}
  const db=await createClient(),{data,error}=await db.rpc('delete_own_account')
  if(error)return {error:publicError(error)}
  // Las portadas de los eventos borrados con la cuenta (la sesión aún sirve para esto).
  await removeCovers(db,(data as {covers?:string[]}).covers??[])
  // La cuenta ya no existe: solo queda borrar las cookies de este navegador.
  await db.auth.signOut({scope:'local'})
  revalidatePath('/','layout')
  redirect('/login?aviso=cuenta')
}
