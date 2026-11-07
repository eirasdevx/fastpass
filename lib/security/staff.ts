import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { DEMO_MODE } from '@/lib/demo/mode'

/** AAL1 is allowed only to enrol/challenge MFA, never to access business data. */
export async function staffIdentity() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  if (DEMO_MODE) return { supabase, user }
  const [admin, member] = await Promise.all([
    supabase.from('admins').select('user_id').eq('user_id', user.id).maybeSingle(),
    supabase.from('organization_members').select('user_id').eq('user_id', user.id).maybeSingle(),
  ])
  if (!admin.data && !member.data) return null
  return { supabase, user }
}
