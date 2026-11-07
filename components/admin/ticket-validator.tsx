'use client'

import '@/lib/security/qr-decoder'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Scanner, type IDetectedBarcode, type IScannerError } from '@yudiel/react-qr-scanner'
import { CheckCircle2, CircleSlash, Clock3, SearchX, TriangleAlert, Camera, CameraOff } from 'lucide-react'
import { validateTicket, type ValidationResult } from '@/app/admin/validar/actions'
import { formatDateTime } from '@/lib/format'
import { cn, formatTicketCode } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/select'
import { Label } from '@/components/ui/label'

type EventOption = { id: string; title: string; starts_at: string }

const RESULT_UI: Record<
  ValidationResult['result'],
  { title: string; className: string; icon: typeof CheckCircle2 }
> = {
  valid: { title: 'Entrada válida', className: 'bg-success text-white', icon: CheckCircle2 },
  already_used: { title: 'Entrada ya utilizada', className: 'bg-warning text-black', icon: Clock3 },
  not_found: { title: 'No existe', className: 'bg-destructive text-white', icon: SearchX },
  cancelled: { title: 'Entrada anulada', className: 'bg-destructive text-white', icon: CircleSlash },
  wrong_event: { title: 'Es de otro evento', className: 'bg-destructive text-white', icon: TriangleAlert },
}

const RESUME_AFTER_MS = 3500

const CAMERA_ERRORS: Partial<Record<IScannerError['kind'], string>> = {
  'permission-denied': 'no has dado permiso de cámara',
  'no-camera': 'no se encuentra ninguna cámara',
  'in-use': 'otra aplicación está usando la cámara',
  'insecure-context': 'la cámara solo funciona en HTTPS o en localhost',
  unsupported: 'este navegador no permite usar la cámara',
}

function vibrate(pattern: number | number[]) {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(pattern)
}

export function TicketValidator({ events, initialEventId }: { events: EventOption[]; initialEventId: string | null }) {
  const router = useRouter()
  const [eventId, setEventId] = useState<string | null>(initialEventId)
  const [cameraOn, setCameraOn] = useState(true)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [result, setResult] = useState<ValidationResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [manualCode, setManualCode] = useState('')
  const [pending, startTransition] = useTransition()
  const busy = useRef(false)
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (resumeTimer.current) clearTimeout(resumeTimer.current)
  }, [])

  const reset = useCallback(() => {
    if (resumeTimer.current) clearTimeout(resumeTimer.current)
    busy.current = false
    setResult(null)
    setError(null)
  }, [])

  const check = useCallback(
    (code: string) => {
      if (busy.current) return
      busy.current = true
      setError(null)
      startTransition(async () => {
        const res = await validateTicket(code, eventId)
        if (res.error || !res.data) {
          setError(res.error ?? 'Error desconocido')
          busy.current = false
          return
        }
        setResult(res.data)
        vibrate(res.data.result === 'valid' ? 120 : [80, 60, 80, 60, 80])
        resumeTimer.current = setTimeout(reset, RESUME_AFTER_MS)
      })
    },
    [eventId, reset]
  )

  const onScan = (codes: IDetectedBarcode[]) => {
    const value = codes[0]?.rawValue
    if (value) check(value)
  }

  const onEventChange = (value: string) => {
    const id = value || null
    setEventId(id)
    reset()
    router.replace(id ? `/admin/validar?evento=${id}` : '/admin/validar', { scroll: false })
  }

  const ui = result ? RESULT_UI[result.result] : null

  return (
    <div className="mx-auto grid max-w-xl gap-6">
      <div className="grid gap-2">
        <Label htmlFor="event">Evento</Label>
        <NativeSelect id="event" value={eventId ?? ''} onChange={(e) => onEventChange(e.target.value)}>
          <option value="">Cualquier evento</option>
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>
              {ev.title} · {formatDateTime(ev.starts_at)}
            </option>
          ))}
        </NativeSelect>
        <p className="text-muted-foreground text-xs">
          Si eliges un evento, las entradas de otros eventos se rechazarán.
        </p>
      </div>

      {/* ---------------- Cámara + resultado ---------------- */}
      <div className="relative aspect-square overflow-hidden rounded-2xl border bg-black">
        {cameraOn && !cameraError ? (
          <Scanner
            onScan={onScan}
            onError={(err) => setCameraError(CAMERA_ERRORS[err.kind] ?? err.message)}
            paused={!!result || pending}
            formats={['qr_code']}
            constraints={{ facingMode: 'environment' }}
            sound={false}
            styles={{ container: { width: '100%', height: '100%' }, video: { objectFit: 'cover' } }}
          />
        ) : (
          <div className="grid h-full place-items-center p-6 text-center text-sm text-white/80">
            {cameraError ? (
              <p>
                No se pudo acceder a la cámara ({cameraError}).
                <br />
                Revisa los permisos del navegador o introduce el código a mano.
              </p>
            ) : (
              <p>Cámara apagada</p>
            )}
          </div>
        )}

        {ui && result && (
          <button
            type="button"
            onClick={reset}
            aria-live="assertive"
            className={cn('absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 p-6 text-center', ui.className)}
          >
            <ui.icon className="size-20" strokeWidth={1.5} />
            <p className="text-3xl font-black tracking-tight">{ui.title}</p>
            {result.result !== 'not_found' && (
              <div className="space-y-1 text-base">
                <p className="font-semibold">{result.attendee_name}</p>
                <p className="opacity-90">
                  {result.type_name} · {result.event_title}
                </p>
                {result.result === 'already_used' && result.used_at && (
                  <p className="font-medium">Entró el {formatDateTime(result.used_at)}</p>
                )}
              </div>
            )}
            <p className="font-mono text-sm opacity-80">{formatTicketCode(result.code)}</p>
            <p className="mt-2 text-xs underline opacity-80">Toca para escanear la siguiente</p>
          </button>
        )}

        {pending && !result && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-black/50 text-white">Comprobando…</div>
        )}
      </div>

      <div className="flex justify-center">
        <Button type="button" variant="outline" size="sm" onClick={() => { setCameraError(null); setCameraOn((v) => !v) }}>
          {cameraOn ? <CameraOff /> : <Camera />} {cameraOn ? 'Apagar cámara' : 'Encender cámara'}
        </Button>
      </div>

      {error && (
        <p role="alert" className="bg-destructive/10 text-destructive rounded-md p-3 text-sm">
          {error}
        </p>
      )}

      {/* ---------------- Entrada manual ---------------- */}
      <form
        className="grid gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!manualCode.trim()) return
          reset()
          check(manualCode)
          setManualCode('')
        }}
      >
        <Label htmlFor="manual">Introducir código a mano</Label>
        <div className="flex gap-2">
          <Input
            id="manual"
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            placeholder="A1B2-C3D4-E5F6-A7B8"
            autoComplete="off"
            autoCapitalize="characters"
            className="font-mono uppercase"
          />
          <Button type="submit" disabled={pending || !manualCode.trim()}>
            Validar
          </Button>
        </div>
      </form>
    </div>
  )
}
