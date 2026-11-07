import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { UserRoundPlus } from 'lucide-react'
import { getAdmin } from '@/lib/auth'
import { DEMO_MODE } from '@/lib/demo/mode'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { SignupForm } from '@/components/public/signup-form'

export const metadata: Metadata = { title: 'Crear cuenta de organizador', robots: { index: false, follow: false } }

export default async function SignupPage() {
  if (await getAdmin()) redirect('/admin')

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <Card>
        <CardHeader className="items-center text-center">
          <div className="bg-primary/10 text-primary ring-primary/5 mx-auto mb-2 flex size-14 items-center justify-center rounded-full ring-8">
            <UserRoundPlus className="size-7" aria-hidden />
          </div>
          <CardTitle className="text-xl">Crear cuenta de organizador</CardTitle>
          <CardDescription>Para publicar eventos y gestionar sus entradas.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {DEMO_MODE && (
            <p className="bg-accent/15 rounded-md border border-dashed px-3 py-2 text-sm">
              <strong>Versión beta:</strong> no se envía ningún correo; entrarás directamente al panel.
            </p>
          )}
          <SignupForm />
          <p className="text-muted-foreground text-center text-sm">
            ¿Ya tienes cuenta?{' '}
            <Link href="/login" className="text-foreground underline">
              Inicia sesión
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
