'use client'
import { useActionState } from 'react'
import { changePassword, updateEmail, updateName, type ProfileState } from '@/app/admin/cuenta/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/field'

function Result({ state }: { state: ProfileState }) {
  if (state?.error) return <p role="alert" className="text-destructive text-sm">{state.error}</p>
  if (state?.success) return <p role="status" className="text-success text-sm">{state.success}</p>
  return null
}

function CurrentPassword({ id, error }: { id: string; error?: string }) {
  return <Field label="Contraseña actual" htmlFor={id} error={error} hint="Por seguridad, confirma que eres tú.">
    <Input id={id} name="current_password" type="password" autoComplete="current-password" required maxLength={1024} aria-invalid={!!error}/>
  </Field>
}

export function NameForm({ firstName, lastName }: { firstName: string; lastName: string }) {
  const [state, action, pending] = useActionState<ProfileState, FormData>(updateName, undefined)
  const fields = state?.fields ?? {}
  return <form action={action} className="grid gap-4">
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Nombre" htmlFor="first_name" error={fields.first_name}>
        <Input id="first_name" name="first_name" defaultValue={firstName} required maxLength={80} autoComplete="given-name" aria-invalid={!!fields.first_name}/>
      </Field>
      <Field label="Apellidos" htmlFor="last_name" error={fields.last_name}>
        <Input id="last_name" name="last_name" defaultValue={lastName} required maxLength={120} autoComplete="family-name" aria-invalid={!!fields.last_name}/>
      </Field>
    </div>
    <Result state={state}/>
    <div><Button type="submit" disabled={pending}>{pending ? 'Guardando…' : 'Guardar nombre'}</Button></div>
  </form>
}

export function EmailForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState<ProfileState, FormData>(updateEmail, undefined)
  const fields = state?.fields ?? {}
  return <form action={action} className="grid gap-4">
    <p className="text-muted-foreground text-sm">Correo actual: <strong className="text-foreground">{email}</strong></p>
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Correo nuevo" htmlFor="new_email" error={fields.email}>
        <Input id="new_email" name="email" type="email" required maxLength={254} autoComplete="email" aria-invalid={!!fields.email}/>
      </Field>
      <CurrentPassword id="email_current_password" error={fields.current_password}/>
    </div>
    <Result state={state}/>
    <div><Button type="submit" disabled={pending}>{pending ? 'Enviando…' : 'Cambiar correo'}</Button></div>
  </form>
}

export function PasswordForm() {
  const [state, action, pending] = useActionState<ProfileState, FormData>(changePassword, undefined)
  const fields = state?.fields ?? {}
  // Al terminar bien se vacían los campos (cambia la key del formulario).
  return <form key={state?.success} action={action} className="grid gap-4">
    <CurrentPassword id="password_current_password" error={fields.current_password}/>
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Contraseña nueva" htmlFor="password" error={fields.password} hint="Mínimo 8 caracteres.">
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={72} aria-invalid={!!fields.password}/>
      </Field>
      <Field label="Repite la contraseña nueva" htmlFor="password_confirm" error={fields.password_confirm}>
        <Input id="password_confirm" name="password_confirm" type="password" autoComplete="new-password" required maxLength={72} aria-invalid={!!fields.password_confirm}/>
      </Field>
    </div>
    <Result state={state}/>
    <div><Button type="submit" disabled={pending}>{pending ? 'Guardando…' : 'Cambiar contraseña'}</Button></div>
  </form>
}
