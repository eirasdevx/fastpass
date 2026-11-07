import { redirect } from 'next/navigation'
import { ShieldCheck } from 'lucide-react'
import { staffIdentity } from '@/lib/security/staff'
import { getStaff } from '@/lib/auth'
import { MfaForm } from '@/components/public/mfa-form'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export const metadata = { title: 'Verificación de seguridad', robots: { index: false, follow: false } }

export default async function MfaPage() {
  if (!(await staffIdentity())) redirect('/login')
  const staff = await getStaff()
  if (staff) redirect(staff.role === 'controller' ? '/admin/validar' : '/admin')
  return <div className="mx-auto max-w-sm px-4 py-16"><Card>
    <CardHeader className="items-center text-center">
      <div className="bg-primary/10 text-primary mx-auto mb-2 flex size-14 items-center justify-center rounded-full ring-8 ring-primary/5">
        <ShieldCheck className="size-7" aria-hidden />
      </div>
      <CardTitle className="text-xl">Verificación de seguridad</CardTitle>
      <CardDescription>
        Protegemos el panel con un segundo paso. Usa una app como Google Authenticator, Microsoft Authenticator o 1Password.
      </CardDescription>
    </CardHeader>
    <CardContent><MfaForm /></CardContent>
  </Card></div>
}
