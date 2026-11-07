'use client'

import { useActionState, useState } from 'react'
import { MailCheck } from 'lucide-react'
import { acceptWithLogin, acceptWithSignup, type InvitationState } from '@/app/(public)/invitacion/[token]/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/field'

export function InvitationForm({ token, email }: { token: string; email: string }) {
  const [signupState, signup, signingUp] = useActionState<InvitationState, FormData>(acceptWithSignup, undefined)
  const [loginState, login, loggingIn] = useActionState<InvitationState, FormData>(acceptWithLogin, undefined)
  const [haveAccount, setHaveAccount] = useState(false)

  if (signupState?.sent) {
    return (
      <div role="status" className="grid justify-items-center gap-3 text-center text-sm">
        <MailCheck className="text-accent size-10" />
        <p className="font-medium">Revisa tu correo</p>
        <p className="text-muted-foreground">
          Te hemos enviado un enlace a <strong>{email}</strong> para confirmar la cuenta. Al abrirlo entrarás en el equipo y
          configurarás la verificación de seguridad. Si no lo ves, mira en la carpeta de spam.
        </p>
      </div>
    )
  }

  const emailField = (
    <Field label="Correo electrónico" htmlFor="invite-email" hint="La invitación es para este correo.">
      <Input id="invite-email" value={email} readOnly disabled />
    </Field>
  )

  if (haveAccount || signupState?.existing) {
    return (
      <form action={login} className="grid gap-4">
        {signupState?.existing && !loginState && (
          <p role="status" className="rounded-md border px-3 py-2 text-sm">Ya hay una cuenta con este correo. Entra con tu contraseña para aceptar la invitación.</p>
        )}
        <input type="hidden" name="token" value={token} />
        {emailField}
        <Field label="Contraseña" htmlFor="invite-login-password">
          <Input id="invite-login-password" name="password" type="password" autoComplete="current-password" required maxLength={1024} />
        </Field>
        {loginState?.error && <p role="alert" className="text-destructive text-sm">{loginState.error}</p>}
        <Button type="submit" disabled={loggingIn}>{loggingIn ? 'Entrando…' : 'Entrar y aceptar la invitación'}</Button>
        <button type="button" className="text-muted-foreground text-sm underline" onClick={() => setHaveAccount(false)}>No tengo cuenta: crearla</button>
      </form>
    )
  }

  const fields = signupState?.fields ?? {}
  return (
    <form action={signup} className="grid gap-4" noValidate>
      <input type="hidden" name="token" value={token} />
      {emailField}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre" htmlFor="invite-first" error={fields.first_name}>
          <Input id="invite-first" name="first_name" autoComplete="given-name" required maxLength={80} />
        </Field>
        <Field label="Apellidos" htmlFor="invite-last" error={fields.last_name}>
          <Input id="invite-last" name="last_name" autoComplete="family-name" required maxLength={120} />
        </Field>
      </div>
      <Field label="Contraseña" htmlFor="invite-password" error={fields.password} hint="Mínimo 8 caracteres.">
        <Input id="invite-password" name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={72} />
      </Field>
      <Field label="Repite la contraseña" htmlFor="invite-password-confirm" error={fields.password_confirm}>
        <Input id="invite-password-confirm" name="password_confirm" type="password" autoComplete="new-password" required maxLength={72} />
      </Field>
      {signupState?.error && <p role="alert" className="text-destructive text-sm">{signupState.error}</p>}
      <Button type="submit" disabled={signingUp}>{signingUp ? 'Creando cuenta…' : 'Crear cuenta y unirme'}</Button>
      <button type="button" className="text-muted-foreground text-sm underline" onClick={() => setHaveAccount(true)}>Ya tengo cuenta con este correo</button>
    </form>
  )
}
