'use client'

import { useActionState, useState, useTransition } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { KeyRound, Loader2, Smartphone } from 'lucide-react'
import { prepareMfa, verifyMfa, type MfaState } from '@/app/(public)/login/mfa/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function MfaForm() {
  const [setup, setSetup] = useState<MfaState>()
  const [loading, startTransition] = useTransition()
  const [state, action, pending] = useActionState(verifyMfa, undefined)
  return <div className="grid gap-5">
    {!setup?.factorId && <>
      <ol className="text-muted-foreground grid gap-3 text-sm">
        <li className="flex items-start gap-3">
          <Smartphone className="text-foreground mt-0.5 size-4 shrink-0" aria-hidden />
          <span>Ten a mano el móvil con tu app de autenticación.</span>
        </li>
        <li className="flex items-start gap-3">
          <KeyRound className="text-foreground mt-0.5 size-4 shrink-0" aria-hidden />
          <span>Si es tu primera vez verás un QR; si no, solo tendrás que escribir el código de 6 cifras.</span>
        </li>
      </ol>
      <Button size="lg" className="w-full" disabled={loading} onClick={() => startTransition(async () => setSetup(await prepareMfa()))}>
        {loading ? <><Loader2 className="size-4 animate-spin" aria-hidden /> Preparando…</> : 'Continuar'}
      </Button>
    </>}
    {setup?.uri && <div className="grid justify-items-center gap-3">
      <p className="text-muted-foreground text-center text-sm">Escanea este QR con tu aplicación de autenticación. No lo compartas.</p>
      <div className="rounded-xl border bg-white p-3 shadow-sm">
        <QRCodeSVG value={setup.uri} size={180} marginSize={0} />
      </div>
    </div>}
    {setup?.factorId && <form action={action} className="grid gap-3">
      <input type="hidden" name="factorId" value={setup.factorId} />
      <label htmlFor="mfa-code" className="text-center text-sm font-medium">Código del autenticador</label>
      <Input id="mfa-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required autoFocus
        placeholder="000000" className="h-12 text-center font-mono text-2xl tracking-[0.5em]" />
      <Button size="lg" className="w-full" disabled={pending}>
        {pending ? <><Loader2 className="size-4 animate-spin" aria-hidden /> Verificando…</> : 'Verificar'}
      </Button>
    </form>}
    {(setup?.error || state?.error) && <p role="alert" className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm">{state?.error ?? setup?.error}</p>}
  </div>
}
