'use client'

import { useActionState } from 'react'
import { MailCheck } from 'lucide-react'
import { signup, type SignupState } from '@/app/(public)/login/crear-cuenta/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/field'

export function SignupForm() {
  const [state, action, pending] = useActionState<SignupState, FormData>(signup, undefined)

  if (state?.sent) {
    return (
      <div role="status" className="grid justify-items-center gap-3 text-center text-sm">
        <MailCheck className="text-accent size-10" />
        <p className="font-medium">Revisa tu correo</p>
        <p className="text-muted-foreground">
          Te hemos enviado un enlace para confirmar la cuenta. Ábrelo para terminar el alta y configurar la
          verificación de seguridad. Si no lo ves, mira en la carpeta de spam.
        </p>
      </div>
    )
  }

  const fields = state?.fields ?? {}
  const values = state?.values ?? {}
  const invalid = (name: string) =>
    fields[name] ? { 'aria-invalid': true, 'aria-describedby': `${name}-error` } : {}

  return (
    <form action={action} className="grid gap-4" noValidate>
      <Field label="Correo electrónico" htmlFor="email" error={fields.email}>
        <Input id="email" name="email" type="email" autoComplete="email" required maxLength={254}
          defaultValue={values.email} {...invalid('email')} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre" htmlFor="first_name" error={fields.first_name}>
          <Input id="first_name" name="first_name" autoComplete="given-name" required maxLength={80}
            defaultValue={values.first_name} {...invalid('first_name')} />
        </Field>
        <Field label="Apellidos" htmlFor="last_name" error={fields.last_name}>
          <Input id="last_name" name="last_name" autoComplete="family-name" required maxLength={120}
            defaultValue={values.last_name} {...invalid('last_name')} />
        </Field>
      </div>
      <Field label="Nombre del grupo que lo organiza" htmlFor="organization" error={fields.organization}
        hint="Asociación, peña, empresa… Aparecerá como organizador de tus eventos.">
        <Input id="organization" name="organization" autoComplete="organization" required maxLength={120}
          defaultValue={values.organization} {...invalid('organization')} />
      </Field>
      <Field label="Contraseña" htmlFor="password" error={fields.password} hint="Mínimo 8 caracteres.">
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8}
          maxLength={72} {...invalid('password')} />
      </Field>
      <Field label="Repite la contraseña" htmlFor="password_confirm" error={fields.password_confirm}>
        <Input id="password_confirm" name="password_confirm" type="password" autoComplete="new-password" required
          maxLength={72} {...invalid('password_confirm')} />
      </Field>
      {state?.error && (
        <p role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? 'Creando cuenta…' : 'Crear cuenta'}
      </Button>
    </form>
  )
}
