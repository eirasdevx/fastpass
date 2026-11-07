'use client'

import { useId, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CalendarClock, Loader2, MapPin, Minus, Plus, ShieldCheck, Wallet } from 'lucide-react'
import { reserveBonocopas } from '@/app/(public)/eventos/[slug]/reservar/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/field'
import { formatDateTime, formatPrice } from '@/lib/format'
import { AttendeeFields, attendeeBlocks, attendeeError, readAttendees } from '@/components/public/attendee-fields'
import { FormStep, OptionCard } from '@/components/public/form-step'
import type { AttendeeRules } from '@/lib/validations/document'

export type ReservableType = { id: string; name: string; description: string; price: number; maxQuantity: number }

export function ReservationForm({ eventId, types, lastRequired, phoneRequired, item, rules, pickup, pass = '', onQueueExpired }: {
  eventId: string; types: ReservableType[]; lastRequired: boolean; phoneRequired: boolean; item: string; rules: AttendeeRules
  pickup: { address: string | null; deadline: string | null }
  /** Pase de la sala de espera; vacío si el evento no la usa. */
  pass?: string; onQueueExpired?: () => void
}) {
  const router = useRouter(), prefix = useId(), errorRef = useRef<HTMLParagraphElement>(null)
  const [pending, start] = useTransition()
  const [error, setError] = useState('')
  const [typeId, setTypeId] = useState(types.length === 1 ? types[0].id : '')
  const [quantity, setQuantity] = useState(1)
  const type = types.find((t) => t.id === typeId)
  const max = type?.maxQuantity ?? 1
  const total = type ? type.price * quantity : 0
  const people = attendeeBlocks(quantity, rules).length > 0
  // El aviso de error queda a la vista aunque esté al final del formulario.
  const fail = (text: string) => { setError(text); requestAnimationFrame(() => errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })) }

  return (
    <form className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]" onSubmit={(e) => {
      e.preventDefault()
      const f = new FormData(e.currentTarget)
      setError('')
      if (!type) { fail(`Elige un tipo de ${item}.`); return }
      const first = String(f.get('first') ?? ''), last = String(f.get('last') ?? '')
      const attendees = readAttendees(f, quantity, rules, { first, last })
      const invalid = attendeeError(attendees)
      if (invalid) { fail(invalid); return }
      const input = {
        event: eventId, type: typeId, quantity, first, last, attendees,
        email: String(f.get('email') ?? ''), phone: String(f.get('phone') ?? ''), consent: f.get('consent') === 'on',
        website: String(f.get('website') ?? ''), pass,
      }
      start(async () => {
        try {
          const r = await reserveBonocopas(input)
          // Turno caducado: vuelve a la sala de espera (los datos escritos se pierden; avisamos antes con la cuenta atrás).
          if (r.queue && onQueueExpired) { alert(r.error); onQueueExpired() }
          else if (r.error) fail(r.error)
          else if (r.token) router.push(`/reserva/${r.token}?nueva=1`)
        } catch {
          fail('No se pudo confirmar la reserva. Comprueba la conexión antes de repetirla.')
        }
      })
    }}>
      <div className="space-y-5">
        <FormStep step={1} title="Elige tu reserva" description={`Qué ${item} quieres y cuántos.`}>
          <div className="grid gap-3" role="radiogroup" aria-label={`Tipo de ${item}`}>
            {types.map((t) => (
              <OptionCard key={t.id} name="type" value={t.id} checked={typeId === t.id} title={t.name} detail={t.description || undefined}
                aside={formatPrice(t.price)} onChange={() => { setTypeId(t.id); setQuantity((q) => Math.min(q, t.maxQuantity)) }} />
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 pl-4">
            <div>
              <p id={`${prefix}-quantity`} className="text-sm font-medium">Cantidad</p>
              <p className="text-muted-foreground text-xs">{type ? `Máximo ${max} por reserva` : `Elige primero un tipo`}</p>
            </div>
            <div className="flex items-center gap-1" role="group" aria-labelledby={`${prefix}-quantity`}>
              <Button type="button" variant="outline" size="icon" aria-label="Uno menos" disabled={!type || quantity <= 1} onClick={() => setQuantity((q) => q - 1)}><Minus /></Button>
              <output aria-live="polite" className="w-12 text-center text-xl font-semibold tabular-nums">{quantity}</output>
              <Button type="button" variant="outline" size="icon" aria-label="Uno más" disabled={!type || quantity >= max} onClick={() => setQuantity((q) => q + 1)}><Plus /></Button>
            </div>
          </div>
        </FormStep>

        <FormStep step={2} title="Tus datos" description="Eres el titular: quien hace la reserva y la recoge.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre" htmlFor={`${prefix}-first`}>
              <Input id={`${prefix}-first`} name="first" required maxLength={60} autoComplete="given-name" />
            </Field>
            <Field label={`Apellidos${lastRequired ? '' : ' (opcional)'}`} htmlFor={`${prefix}-last`}>
              <Input id={`${prefix}-last`} name="last" required={lastRequired} maxLength={60} autoComplete="family-name" />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Correo electrónico" htmlFor={`${prefix}-email`} hint="Para identificar tu reserva si la pierdes.">
              <Input id={`${prefix}-email`} name="email" type="email" required maxLength={254} autoComplete="email" inputMode="email" placeholder="nombre@correo.com" />
            </Field>
            {phoneRequired && (
              <Field label="Teléfono" htmlFor={`${prefix}-phone`}>
                <Input id={`${prefix}-phone`} name="phone" type="tel" required maxLength={30} autoComplete="tel" inputMode="tel" placeholder="600 000 000" />
              </Field>
            )}
          </div>
        </FormStep>

        {people && (
          <FormStep step={3} title={quantity > 1 ? 'Datos de cada persona' : 'Tu documento'}
            description={rules.min_age !== null ? `Todas las personas deben tener al menos ${rules.min_age} años el día del evento.` : 'Se comprueban al recoger.'}>
            <AttendeeFields count={quantity} rules={rules} prefix={prefix} embedded />
          </FormStep>
        )}

        <div className="hidden" aria-hidden="true">
          <label htmlFor={`${prefix}-website`}>Sitio web</label>
          <input id={`${prefix}-website`} name="website" tabIndex={-1} autoComplete="off" />
        </div>
      </div>

      {/* Resumen: a la derecha en ordenador (fijo al bajar) y al final en el móvil. */}
      <aside className="bg-card space-y-4 rounded-2xl border p-5 shadow-lg lg:sticky lg:top-24">
        <h2 className="font-semibold">Resumen</h2>
        {type ? (
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">{type.name}</dt><dd className="tabular-nums">{quantity} × {formatPrice(type.price)}</dd></div>
            <div className="flex items-baseline justify-between gap-3 border-t pt-3"><dt className="font-medium">Total a pagar al recoger</dt><dd className="text-2xl font-bold tabular-nums">{formatPrice(total)}</dd></div>
          </dl>
        ) : <p className="text-muted-foreground text-sm">Elige un tipo de {item} para ver el total.</p>}
        <ul className="text-muted-foreground space-y-2 text-xs">
          <li className="flex gap-2"><Wallet className="size-4 shrink-0" aria-hidden />Ahora no se cobra nada: pagas en persona al recoger.</li>
          {pickup.address && <li className="flex gap-2"><MapPin className="size-4 shrink-0" aria-hidden />Recogida en {pickup.address}</li>}
          {pickup.deadline && <li className="flex gap-2"><CalendarClock className="size-4 shrink-0" aria-hidden />Recoge antes del {formatDateTime(pickup.deadline)} o la reserva caduca.</li>}
        </ul>
        <label className="flex items-start gap-3 rounded-xl border p-3 text-sm">
          <input name="consent" type="checkbox" required className="accent-primary mt-0.5 size-4 shrink-0" />
          <span>He leído y acepto la <Link className="font-medium underline" href={`/privacidad?evento=${eventId}`} target="_blank" rel="noreferrer">información de privacidad</Link>.</span>
        </label>
        {error && <p ref={errorRef} role="alert" className="border-destructive/30 bg-destructive/10 text-destructive rounded-xl border p-3 text-sm">{error}</p>}
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? <><Loader2 className="animate-spin" aria-hidden /> Reservando…</> : 'Confirmar reserva'}
        </Button>
        <p className="text-muted-foreground flex items-center justify-center gap-1.5 text-xs"><ShieldCheck className="size-3.5" aria-hidden />Tus datos solo los ve la organización del evento.</p>
      </aside>
    </form>
  )
}
