'use client'

import { useActionState } from 'react'
import { updatePassword, type NewPasswordState } from '@/app/(public)/login/nueva-contrasena/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/field'

export function NewPasswordForm({ needsCode }: { needsCode: boolean }) {
  const [state, action, pending] = useActionState<NewPasswordState, FormData>(updatePassword, undefined)
  const fields = state?.fields ?? {}

  return (
    <form action={action} className="grid gap-4">
      <Field label="Nueva contraseña" htmlFor="password" error={fields.password} hint="Mínimo 8 caracteres.">
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8}
          maxLength={72} aria-invalid={!!fields.password} />
      </Field>
      <Field label="Repite la contraseña" htmlFor="password_confirm" error={fields.password_confirm}>
        <Input id="password_confirm" name="password_confirm" type="password" autoComplete="new-password" required
          maxLength={72} aria-invalid={!!fields.password_confirm} />
      </Field>
      {needsCode && (
        <Field label="Código del autenticador" htmlFor="code" error={fields.code}
          hint="Tu cuenta tiene verificación de seguridad: escribe el código de seis dígitos de tu aplicación.">
          <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}"
            maxLength={6} required aria-invalid={!!fields.code} />
        </Field>
      )}
      {state?.error && (
        <p role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? 'Guardando…' : 'Guardar contraseña'}
      </Button>
    </form>
  )
}
