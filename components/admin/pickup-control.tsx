'use client'

import { useRef, useState, useTransition } from 'react'
import { TriangleAlert } from 'lucide-react'
import { lookupReservation, recordPickup, type PickupDone, type PickupLookup } from '@/app/admin/recogidas/actions'
import { itemName, paymentMethodLabels, type PaymentMethod, type ReservationSummary } from '@/lib/reservations'
import { formatDateTime, formatPrice } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/select'
import { CodeEntry } from './code-entry'
import { ScanResult, type ScanKind } from './scan-result'

type Outcome = { kind: ScanKind; title: string; reservation?: ReservationSummary; text?: string }

function People({ r }: { r: ReservationSummary }) {
  return (
    <div className="bg-card rounded-lg border p-3 text-sm">
      <p className="text-lg font-bold">{r.holder}</p>
      <p className="text-muted-foreground">{r.quantity} × {r.type_name} · <span className="font-mono">{r.code}</span></p>
      {r.people && r.people.length > 0 && (
        <ul className="mt-2 grid gap-1">{r.people.map((p, i) => <li key={i}>{i + 1}. {p.name}{p.document && <span className="font-mono"> · {p.document}</span>}</li>)}</ul>
      )}
    </div>
  )
}

export function PickupControl({ event }: { event: string }) {
  const [found, setFound] = useState<PickupLookup | null>(null), [outcome, setOutcome] = useState<Outcome | null>(null)
  const [error, setError] = useState(''), [camera, setCamera] = useState(false), [entryKey, setEntryKey] = useState(0)
  const [quantity, setQuantity] = useState(1), [method, setMethod] = useState<PaymentMethod>('cash')
  const [paid, setPaid] = useState(false), [identity, setIdentity] = useState(false)
  const [pending, start] = useTransition()
  const busy = useRef(false), searched = useRef('')

  /** Una reserva encontrada: entregable o con su resultado (ya recogida, cancelada, caducada). */
  function show(data: PickupLookup) {
    const r = data.reservation
    if (r.status === 'completed') {
      setOutcome({ kind: 'warning', title: 'Ya se ha escaneado antes', reservation: r,
        text: `Ya se entregó todo${r.last_pickup_at ? ` (${formatDateTime(r.last_pickup_at)})` : ''}. No entregues más.` })
    } else if (r.status === 'cancelled' || r.status === 'expired') {
      setOutcome({ kind: 'denied', title: r.status === 'cancelled' ? 'Reserva cancelada' : 'Reserva caducada', reservation: r,
        text: r.status === 'expired' ? 'Pasó la fecha límite de recogida. No se puede entregar.' : 'No se puede entregar.' })
    } else {
      setFound(data); setQuantity(Math.max(1, r.pending_quantity)); setPaid(false); setIdentity(false)
    }
  }

  function lookup(value: string) {
    if (busy.current) return
    busy.current = true; setError(''); setFound(null); setOutcome(null)
    start(async () => {
      try {
        const r = await lookupReservation(event, value)
        if (r.data) { searched.current = value; show(r.data); return }
        if (r.reason === 'NOT_FOUND') setOutcome({ kind: 'missing', title: 'Reserva no encontrada', text: 'No hay ninguna reserva con este código o QR en este evento. Comprueba que es el evento correcto.' })
        else if (r.reason === 'RATE_LIMITED') setOutcome({ kind: 'warning', title: 'Demasiados intentos', text: r.error })
        else if (r.reason) setOutcome({ kind: 'denied', title: r.error ?? 'No autorizado' })
        else setError(r.error ?? 'Escanea el QR o escribe el código de 4 caracteres.')
      } catch {
        setError('No se ha podido consultar la reserva. Recupera la conexión y vuelve a intentarlo.')
      } finally { busy.current = false }
    })
  }

  function deliver() {
    if (busy.current) return
    busy.current = true; setError('')
    start(async () => {
      try {
        const r = await recordPickup({ event, credential: searched.current, quantity, method, paid, identity })
        if (r.error || !r.data) {
          setError(r.error ?? 'No se registró la entrega.')
          // Otra persona pudo entregar a la vez: se vuelve a consultar el estado real.
          const fresh = await lookupReservation(event, searched.current)
          if (fresh.data) { setFound(null); show(fresh.data) }
          return
        }
        const done: PickupDone = r.data
        setFound(null)
        setOutcome({ kind: 'ok', title: 'Entrega registrada', reservation: done.reservation,
          text: `${done.delivered} ${itemName(done.reservation.item_name)} · cobrado ${formatPrice(Number(done.amount))}. `
            + (done.reservation.pending_quantity > 0 ? `Quedan ${done.reservation.pending_quantity} por recoger.` : 'Reserva completada.') })
        if ('vibrate' in navigator) navigator.vibrate(100)
      } catch {
        // Sin respuesta no se sabe si quedó registrada: no entregar hasta comprobarlo.
        setError('No se ha podido confirmar la entrega. NO entregues nada: recupera la conexión y vuelve a buscar la reserva para ver si quedó registrada.')
      } finally { busy.current = false }
    })
  }

  function next() {
    setFound(null); setOutcome(null); setError(''); searched.current = ''; setEntryKey((k) => k + 1)
  }

  const r = found?.reservation
  return (
    <div className="space-y-5">
      {!found && !outcome && (
        <CodeEntry key={entryKey} what="el justificante" pending={pending} startWithCamera={camera} onCode={lookup} onCameraChange={setCamera} />
      )}

      {error && <p role="alert" className="border-destructive bg-destructive/10 rounded-xl border p-4">{error}</p>}

      {outcome && (
        <ScanResult kind={outcome.kind} title={outcome.title} onNext={next} nextLabel="Siguiente reserva">
          {outcome.text && <p className="text-center text-lg">{outcome.text}</p>}
          {outcome.reservation && <People r={outcome.reservation} />}
        </ScanResult>
      )}

      {r && found && (
        <section aria-live="polite" className="border-primary bg-card space-y-4 rounded-2xl border-2 p-5">
          <p className="text-primary text-center text-sm font-bold tracking-wide uppercase">Reserva válida · cobra y entrega</p>
          <People r={r} />
          {r.delivered_quantity > 0 && (
            <p className="border-warning bg-warning/15 flex gap-2 rounded-lg border p-3 text-sm font-semibold">
              <TriangleAlert className="size-5 shrink-0" />
              Ya se escaneó antes: recogió {r.delivered_quantity} de {r.quantity}{r.last_pickup_at ? ` el ${formatDateTime(r.last_pickup_at)}` : ''}. Quedan {r.pending_quantity}.
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-2 text-sm font-medium">Entregar
              <NativeSelect value={quantity} onChange={(e) => { setQuantity(Number(e.target.value)); setPaid(false) }} className="h-12 text-lg">
                {Array.from({ length: r.pending_quantity }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
              </NativeSelect>
            </label>
            <label className="grid gap-2 text-sm font-medium">Pago
              <NativeSelect value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className="h-12 text-lg">
                {Object.entries(paymentMethodLabels).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
              </NativeSelect>
            </label>
          </div>
          <p className="text-center">A cobrar: <strong className="text-3xl">{formatPrice(Number(r.unit_price) * quantity)}</strong></p>
          {found.by_code && (
            <label className="border-warning bg-warning/10 flex items-start gap-3 rounded-lg border p-3 text-sm">
              <input type="checkbox" className="mt-1 size-5" checked={identity} onChange={(e) => setIdentity(e.target.checked)} />
              <span>Se ha buscado por código, no por QR: <strong>he comprobado el DNI</strong> y coincide con el titular.</span>
            </label>
          )}
          <label className="flex items-start gap-3 rounded-lg border p-3 text-sm">
            <input type="checkbox" className="mt-1 size-5" checked={paid} onChange={(e) => setPaid(e.target.checked)} />
            <span>He cobrado <strong>{formatPrice(Number(r.unit_price) * quantity)}</strong> ({paymentMethodLabels[method].toLowerCase()}).</span>
          </label>
          <Button className="h-16 w-full text-lg" disabled={pending || !paid || (found.by_code && !identity)} onClick={deliver}>
            {pending ? 'Registrando…' : `ENTREGAR ${quantity} ${itemName(r.item_name).toUpperCase()}`}
          </Button>
          <Button variant="outline" className="h-12 w-full" onClick={next}>Cancelar</Button>
        </section>
      )}
    </div>
  )
}
