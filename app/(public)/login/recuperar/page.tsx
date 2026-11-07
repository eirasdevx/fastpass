import type { Metadata } from 'next'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { RecoverForm } from '@/components/public/recover-form'

export const metadata: Metadata = { title: 'Restablecer contraseña', robots: { index: false, follow: false } }

export default function RecoverPage() {
  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Restablecer contraseña</CardTitle>
          <CardDescription>Te enviaremos un enlace al correo de tu cuenta para elegir una nueva.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <RecoverForm />
          <p className="text-center text-sm">
            <Link href="/login" className="text-muted-foreground hover:text-foreground underline">
              Volver a iniciar sesión
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
