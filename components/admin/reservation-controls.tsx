'use client'

import { useId, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X } from 'lucide-react'
import { cancelReservation, createManualReservation, redactReservation, rotateReservationLink } from '@/app/admin/reservas/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Field } from '@/components/ui/field'
import { AttendeeFields, attendeeError, readAttendees } from '@/components/public/attendee-fields'
import type { AttendeeRules } from '@/lib/validations/document'

function PrivateLink({ link, onMessage }: { link: string; onMessage: (text: string) => void }) {
  return (
    <div className="space-y-2">
      <Input aria-label="Enlace del justificante" value={link} readOnly onFocus={(e) => e.target.select()} />
      <Button size="sm" type="button" onClick={() => navigator.clipboard.writeText(link)
        .then(() => onMessage('Enlace copiado.')).catch(() => onMessage('Selecciona y copia el enlace manualmente.'))}>Copiar enlace</Button>
      <p className="text-muted-foreground text-xs">Envíaselo al titular ahora: solo se muestra una vez (guardamos su huella, no el enlace).</p>
    </div>
  )
}

export function ManualReservation({ event, types, lastRequired, phoneRequired, rules }: {
  event: string; types: { id: string; name: string }[]; lastRequired: boolean; phoneRequired: boolean; rules: AttendeeRules
}) {
  const router = useRouter(), prefix = useId()
  const [open, setOpen] = useState(false), [pending, start] = useTransition()
  const [error, setError] = useState(''), [message, setMessage] = useState(''), [created, setCreated] = useState<{ link: string; code: string } | null>(null)
  const [quantity, setQuantity] = useState(1)

  return (
    <section>
      {!open && <Button onClick={() => { setOpen(true); setCreated(null); setError('') }}><Plus /> Reserva manual</Button>}
      {open && (
        <div className="bg-card max-w-2xl rounded-2xl border p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Nueva reserva manual</h2>
              <p className="text-muted-foreground text-sm">Para reservas por teléfono o en persona. Respeta el aforo y los cupos.</p>
            </div>
            <Button type="button" variant="ghost" size="icon" aria-label="Cerrar" onClick={() => setOpen(false)}><X /></Button>
          </div>
          {created ? (
            <div role="status" className="space-y-3">
              <p>Reserva creada con el código <strong className="font-mono text-lg">{created.code}</strong>.</p>
              <PrivateLink link={created.link} onMessage={setMessage} />
              {message && <p className="text-sm">{message}</p>}
              <Button variant="outline" onClick={() => { setCreated(null); setMessage('') }}>Crear otra</Button>
            </div>
          ) : (
            <form className="grid gap-4" onSubmit={(e) => {
              e.preventDefault()
              const f = new FormData(e.currentTarget)
              setError('')
              const first = String(f.get('first') ?? ''), last = String(f.get('last') ?? '')
              const attendees = readAttendees(f, quantity, rules, { first, last })
              const invalid = attendeeError(attendees)
              if (invalid) { setError(invalid); return }
              start(async () => {
                try {
                  const r = await createManualReservation({
                    event, type: String(f.get('type') ?? ''), quantity, first, last, email: String(f.get('email') ?? ''),
                    phone: String(f.get('phone') ?? ''), notes: String(f.get('notes') ?? ''), attendees,
                  })
                  if (r.error) { setError(r.error); return }
                  setCreated({ link: `${location.origin}/reserva/${r.token}`, code: r.code ?? '' })
                  router.refresh()
                } catch {
                  setError('No se pudo confirmar la operación. Comprueba la conexión y el listado antes de repetirla.')
                }
              })
            }}>
              <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
                <Field label="Tipo" htmlFor={`${prefix}-type`}>
                  <NativeSelect id={`${prefix}-type`} name="type" required><option value="">Selecciona</option>{types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</NativeSelect>
                </Field>
                <Field label="Cantidad" htmlFor={`${prefix}-quantity`}>
                  <Input id={`${prefix}-quantity`} name="quantity" type="number" min={1} max={100} value={quantity} required
                    onChange={(e) => setQuantity(Math.min(100, Math.max(1, Number(e.target.value) || 1)))} />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nombre" htmlFor={`${prefix}-first`}><Input id={`${prefix}-first`} name="first" required maxLength={60} /></Field>
                <Field label={`Apellidos${lastRequired ? '' : ' (opcional)'}`} htmlFor={`${prefix}-last`}><Input id={`${prefix}-last`} name="last" required={lastRequired} maxLength={60} /></Field>
              </div>
              <Field label="Correo electrónico" htmlFor={`${prefix}-email`}><Input id={`${prefix}-email`} name="email" type="email" required maxLength={254} /></Field>
              <Field label={`Teléfono${phoneRequired ? '' : ' (opcional)'}`} htmlFor={`${prefix}-phone`}><Input id={`${prefix}-phone`} name="phone" type="tel" required={phoneRequired} maxLength={30} /></Field>
              <AttendeeFields count={quantity} rules={rules} prefix={prefix} />
              <Field label="Observaciones internas" htmlFor={`${prefix}-notes`}><Textarea id={`${prefix}-notes`} name="notes" maxLength={2000} /></Field>
              {error && <p role="alert" className="bg-destructive/10 text-destructive rounded-lg p-3 text-sm">{error}</p>}
              <Button type="submit" disabled={pending || types.length === 0}>{pending ? 'Guardando…' : 'Crear reserva'}</Button>
            </form>
          )}
        </div>
      )}
    </section>
  )
}

export function ReservationActions({ id, canCancel, redacted }: { id: string; canCancel: boolean; redacted: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition(), [message, setMessage] = useState(''), [link, setLink] = useState('')

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {canCancel && (
          <Button variant="outline" disabled={pending} onClick={() => {
            if (!confirm('¿Cancelar la reserva? Se liberará lo no entregado. Lo ya entregado se mantiene.')) return
            start(async () => {
              const r = await cancelReservation(id)
              setMessage(r.error ?? 'Reserva cancelada.')
              router.refresh()
            })
          }}>Cancelar reserva</Button>
        )}
        {!redacted && <Button variant="outline" disabled={pending} onClick={() => {
          if (!confirm('¿Crear un nuevo enlace del justificante? El enlace y el QR anteriores dejarán de funcionar.')) return
          start(async () => {
            const r = await rotateReservationLink(id)
            if (r.error) setMessage(r.error)
            else { setLink(`${location.origin}/reserva/${r.token}`); setMessage('') }
          })
        }}>Nuevo enlace del justificante</Button>}
        {!redacted && <Button variant="ghost" disabled={pending} onClick={() => {
          if (!confirm('¿Suprimir los datos personales de esta reserva (nombre, correo, teléfono, DNI y fechas de nacimiento)? Si sigue pendiente, se anulará. Se conservan cantidades e importes. No se puede deshacer. Hazlo solo tras comprobar la identidad de quien lo pide.')) return
          start(async () => {
            const r = await redactReservation(id)
            setMessage(r.error ?? 'Datos suprimidos.')
            router.refresh()
          })
        }}>Suprimir datos personales</Button>}
      </div>
      {message && <p role="status" className="text-sm">{message}</p>}
      {link && <PrivateLink link={link} onMessage={setMessage} />}
    </div>
  )
}
