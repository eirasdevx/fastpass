import 'server-only'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DEMO_MODE } from '@/lib/demo/mode'
import { audit } from '@/lib/security/audit'

export async function getStaff() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  if (DEMO_MODE) return { ...user, role: 'admin' as const }
  const { data: role, error } = await supabase.rpc('staff_role')
  if (error || !role) return null
  return { ...user, role }
}

/** Devuelve el usuario si es administrador, o null. */
export async function getAdmin() {
  const user = await getStaff()
  if (!user || !['admin', 'organizer'].includes(user.role)) {
    audit('access_denied')
    return null
  }
  return user
}

export async function requireStaff() {
  const user = await getStaff()
  if (!user) redirect('/login')
  return user
}

export async function canManageEvent(eventId: string) {
  if (DEMO_MODE) return true // Action already authenticated; demo is local-only by deployment policy.
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('can_manage_event', { p_event: eventId })
  if (error || !data) { audit('access_denied'); return false }
  return true
}

/** Para páginas y layouts de /admin: redirige al login si no es admin. */
export async function requireAdmin() {
  const user = await getAdmin()
  if (!user) redirect('/admin/validar')
  return user
}
