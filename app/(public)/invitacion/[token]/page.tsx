import type { Metadata } from 'next'
import Link from 'next/link'
import { UserPlus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { DEMO_MODE } from '@/lib/demo/mode'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { InvitationForm } from '@/components/public/invitation-form'

export const metadata: Metadata = { title: 'Invitación al equipo', robots: { index: false, follow: false } }

type Invitation = { email: string; role: 'organizer' | 'controller'; organization: string; event_title: string | null; status: 'valid' | 'expired' | 'accepted' }
const roles = { organizer: 'administrador', controller: 'control de acceso' }

export default async function InvitationPage(props: PageProps<'/invitacion/[token]'>) {
  const { token } = await props.params
  let invitation: Invitation | null = null
  if (!DEMO_MODE && /^[a-f0-9]{64}$/.test(token)) {
    const supabase = await createClient()
    const { data } = await supabase.rpc('get_invitation', { p_token: token })
    invitation = data as Invitation | null
  }
  const problem = !invitation ? 'Este enlace de invitación no es válido. Pide a quien te invitó que te envíe uno nuevo.'
    : invitation.status === 'expired' ? 'Esta invitación ha caducado. Pide a quien te invitó que te envíe una nueva.'
    : invitation.status === 'accepted' ? 'Esta invitación ya se usó. Si es tuya, inicia sesión.' : null

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <Card>
        <CardHeader className="items-center text-center">
          <div className="bg-primary/10 text-primary ring-primary/5 mx-auto mb-2 flex size-14 items-center justify-center rounded-full ring-8">
            <UserPlus className="size-7" aria-hidden />
          </div>
          <CardTitle className="text-xl">{invitation && !problem ? `Únete a ${invitation.organization}` : 'Invitación al equipo'}</CardTitle>
          {invitation && !problem && (
            <CardDescription>
              Te han invitado como <strong>{roles[invitation.role]}</strong>
              {invitation.event_title ? <> para el evento <strong>{invitation.event_title}</strong></> : null}. Crea tu cuenta para
              empezar.
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {problem ? (
            <>
              <p role="alert" className="rounded-md border px-3 py-2 text-sm">{problem}</p>
              <Link href="/login" className="block text-center text-sm underline">Ir a iniciar sesión</Link>
            </>
          ) : (
            <InvitationForm token={token} email={invitation!.email} />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
