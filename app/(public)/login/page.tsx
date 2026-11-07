import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { LogIn } from 'lucide-react'
import { getAdmin } from '@/lib/auth'
import { DEMO_MODE } from '@/lib/demo/mode'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { LoginForm } from '@/components/public/login-form'

export const metadata: Metadata = { title: 'Acceso organizadores' }

const NOTICES: Record<string, string> = {
  contrasena: 'Contraseña actualizada. Inicia sesión con la nueva.',
  cuenta: 'Tu cuenta se ha eliminado.',
  enlace: 'El enlace no es válido o ha caducado. Si ya confirmaste tu correo, inicia sesión; si no, vuelve a solicitarlo.',
}

export default async function LoginPage(props: PageProps<'/login'>) {
  if (await getAdmin()) redirect('/admin')
  const { next, aviso } = await props.searchParams
  const notice = typeof aviso === 'string' ? NOTICES[aviso] : undefined

  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <Card>
        <CardHeader className="items-center text-center">
          <div className="bg-primary/10 text-primary ring-primary/5 mx-auto mb-2 flex size-14 items-center justify-center rounded-full ring-8">
            <LogIn className="size-7" aria-hidden />
          </div>
          <CardTitle className="text-xl">Acceso organizadores</CardTitle>
          <CardDescription>
            Solo para quien gestiona eventos. Para comprar entradas no necesitas cuenta.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {DEMO_MODE && (
            <p className="bg-accent/15 rounded-md border border-dashed px-3 py-2 text-sm">
              <strong>Versión beta:</strong> entra con cualquier email y contraseña.
            </p>
          )}
          {notice && (
            <p role="status" className="rounded-md border px-3 py-2 text-sm">
              {notice}
            </p>
          )}
          <LoginForm next={typeof next === 'string' ? next : undefined} />
          <p className="text-muted-foreground text-center text-sm">
            ¿No tienes cuenta?{' '}
            <Link href="/login/crear-cuenta" className="text-foreground underline">
              Crear cuenta
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
