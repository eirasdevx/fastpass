import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DEMO_MODE } from '@/lib/demo/mode'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { NewPasswordForm } from '@/components/public/new-password-form'

export const metadata: Metadata = { title: 'Nueva contraseña', robots: { index: false, follow: false } }

export default async function NewPasswordPage() {
  if (DEMO_MODE) redirect('/login')
  // Se llega desde el enlace del correo, que abre una sesión temporal (/auth/confirm).
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: aal } = user ? await supabase.auth.mfa.getAuthenticatorAssuranceLevel() : { data: null }

  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Nueva contraseña</CardTitle>
          {user && <CardDescription>Elige la nueva contraseña para {user.email}.</CardDescription>}
        </CardHeader>
        <CardContent>
          {user ? (
            <NewPasswordForm needsCode={aal?.nextLevel === 'aal2' && aal.currentLevel !== 'aal2'} />
          ) : (
            <p className="text-sm">
              El enlace no es válido o ha caducado.{' '}
              <Link href="/login/recuperar" className="underline">
                Solicita uno nuevo
              </Link>
              .
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
