'use client'

import { useRef, useState, useTransition } from 'react'
import { checkEntry, type AccessResult } from '@/app/admin/accesos/actions'
import { formatDateTime } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { CodeEntry } from './code-entry'
import { ScanResult, type ScanKind } from './scan-result'

// Cada respuesta de la base de datos en uno de los cuatro avisos de la puerta.
const OUTCOMES: Record<Exclude<AccessResult['result'], 'ready'>, { kind: ScanKind; title: string }> = {
  valid: { kind: 'ok', title: 'Acceso confirmado' },
  already_used: { kind: 'warning', title: 'Ya se ha escaneado antes' },
  not_found: { kind: 'missing', title: 'Entrada no encontrada' },
  cancelled: { kind: 'denied', title: 'Entrada anulada' },
  event_closed: { kind: 'denied', title: 'Evento no disponible para acceso' },
  forbidden: { kind: 'denied', title: 'Sin autorización para este evento' },
  reservation: { kind: 'denied', title: 'Es una reserva, no una entrada' },
  rate_limited: { kind: 'warning', title: 'Demasiados intentos' },
}

export function AccessControl({ event }: { event: string }) {
  const [result, setResult] = useState<AccessResult | null>(null), [error, setError] = useState('')
  const [camera, setCamera] = useState(false), [entryKey, setEntryKey] = useState(0)
  const [pending, start] = useTransition()
  const busy = useRef(false), searched = useRef('')

  function check(value: string, confirm = false) {
    if (busy.current) return
    busy.current = true; setError('')
    start(async () => {
      try {
        const response = await checkEntry(event, value, confirm)
        if (response.error) { setResult(null); setError(response.error); return }
        searched.current = value; setResult(response.data ?? null)
        if (response.data?.result === 'valid' && 'vibrate' in navigator) navigator.vibrate(100)
      } catch {
        setResult(null)
        setError('No se ha podido confirmar el acceso. Recupera la conexión y consulta de nuevo; no permitas el acceso sin confirmación del servidor.')
      } finally { busy.current = false }
    })
  }
  function next() { setResult(null); setError(''); searched.current = ''; setEntryKey((k) => k + 1) }

  const details = result && (
    <div className="bg-card rounded-lg border p-3 text-sm">
      {result.attendee_name && <p className="text-lg font-bold">{result.attendee_name}</p>}
      <p className="text-muted-foreground">{result.type_name}{result.code && <> · <span className="font-mono">{result.code}</span></>}</p>
    </div>
  )

  return (
    <div className="space-y-5">
      {!result && <CodeEntry key={entryKey} what="la entrada" pending={pending} startWithCamera={camera} onCode={(v) => check(v)} onCameraChange={setCamera} />}
      {error && <p role="alert" className="border-destructive bg-destructive/10 rounded-xl border p-4">{error}</p>}

      {result?.result === 'ready' && (
        <section aria-live="polite" className="border-primary bg-card space-y-4 rounded-2xl border-2 p-5">
          <p className="text-primary text-center text-sm font-bold tracking-wide uppercase">Entrada válida · comprueba el titular</p>
          {details}
          <Button className="h-16 w-full text-lg" disabled={pending} onClick={() => check(searched.current, true)}>{pending ? 'Confirmando…' : 'CONFIRMAR ENTRADA'}</Button>
          <Button variant="outline" className="h-12 w-full" onClick={next}>Cancelar</Button>
        </section>
      )}

      {result && result.result !== 'ready' && (
        <ScanResult kind={OUTCOMES[result.result].kind} title={OUTCOMES[result.result].title} onNext={next} nextLabel="Siguiente entrada">
          {result.result === 'already_used' && result.used_at && <p className="text-center text-lg">Entró el {formatDateTime(result.used_at)}. No permitas un segundo acceso.</p>}
          {result.result === 'reservation' && <p className="text-center">El justificante de reserva <strong>no da acceso</strong>. Debe recoger y pagar en el punto de recogida; lo que recoge es su entrada.</p>}
          {result.result === 'not_found' && <p className="text-center">No hay ninguna entrada con este código en este evento. Comprueba que es el evento correcto.</p>}
          {(result.attendee_name || result.type_name) && details}
        </ScanResult>
      )}
    </div>
  )
}
