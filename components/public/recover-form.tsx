'use client'

import { useActionState } from 'react'
import { requestPasswordReset, type RecoverState } from '@/app/(public)/login/recuperar/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/field'

export function RecoverForm() {
  const [state, action, pending] = useActionState<RecoverState, FormData>(requestPasswordReset, undefined)

  if (state?.sent) {
    return (
      <p role="status" className="text-sm">
        Si existe una cuenta con ese correo, te hemos enviado un enlace para elegir una contraseña nueva. Caduca
        en una hora. Si no lo ves, mira en la carpeta de spam.
      </p>
    )
  }

  return (
    <form action={action} className="grid gap-4">
      <Field label="Correo electrónico" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required maxLength={254} />
      </Field>
      {state?.error && (
        <p role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? 'Enviando…' : 'Enviar enlace'}
      </Button>
    </form>
  )
}
