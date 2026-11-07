'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { CircleCheck, Clock, Hourglass, Loader2, RefreshCw, Users } from 'lucide-react'
import { queueStatus, type QueueStatus } from '@/app/(public)/eventos/[slug]/reservar/actions'
import { ReservationForm } from '@/components/public/reservation-form'
import { Button } from '@/components/ui/button'
import { formatTime } from '@/lib/format'
import { publicError } from '@/lib/security/errors'

type FormProps = Omit<React.ComponentProps<typeof ReservationForm>, 'pass' | 'onQueueExpired'>

/**
 * Consulta el turno directamente a Supabase (función pública queue_status, con la clave pública):
 * con 1.000 personas esperando, cada consulta por el servidor web sería una función de Netlify.
 * Si falla (red, configuración), se usa la acción de servidor de siempre.
 */
async function fetchQueue(event: string, token: string): Promise<QueueStatus> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (url && key) {
    try {
      const response = await fetch(`${url}/rest/v1/rpc/queue_status`, {
        method: 'POST', cache: 'no-store',
        headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_event: event, ...(/^[a-f0-9]{64}$/.test(token) ? { p_token: token } : {}) }),
      })
      if (response.ok) {
        const r = await response.json() as QueueStatus
        return 'error' in r ? { error: publicError({ message: r.error }) } : r
      }
    } catch { /* se reintenta por el servidor */ }
  }
  return queueStatus(event, token)
}

// El token se guarda en este navegador: al recargar o volver más tarde se conserva el sitio en la cola.
const storageKey = (event: string) => `fastpass-cola-${event}`
const read = (key: string) => { try { return localStorage.getItem(key) ?? '' } catch { return '' } }
const write = (key: string, value: string) => { try { localStorage.setItem(key, value) } catch { /* modo privado: solo se pierde el sitio al recargar */ } }

/** Sala de espera virtual: muestra cuántas personas hay delante y abre el formulario al llegar el turno. */
export function WaitingRoom(props: FormProps) {
  const event = props.eventId
  const [state, setState] = useState<QueueStatus | null>(null)
  const [first, setFirst] = useState<number | null>(null)
  const [updated, setUpdated] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  // La consulta se reprograma a sí misma a través de esta referencia.
  const again = useRef<() => void>(() => {})

  const poll = useCallback(async () => {
    clearTimeout(timer.current)
    let next = 5000
    try {
      const r = await fetchQueue(event, read(storageKey(event)))
      setState(r)
      setUpdated(new Date().toLocaleTimeString('es-ES'))
      if ('token' in r) write(storageKey(event), r.token)
      if ('status' in r && r.status === 'waiting') {
        setFirst((f) => f === null || r.ahead > f ? r.ahead : f)
        // Con mucha gente delante no hace falta preguntar tan a menudo.
        next = r.ahead > 200 ? 15000 : r.ahead > 50 ? 10000 : 5000
      } else if (!('error' in r)) return // abierto o con turno: deja de consultar
    } catch {
      setState({ error: 'Sin conexión. Seguimos intentándolo; no pierdes tu sitio.' })
    }
    timer.current = setTimeout(() => again.current(), next)
  }, [event])

  useEffect(() => {
    again.current = poll
    timer.current = setTimeout(poll, 0) // primera consulta nada más entrar
    const visible = () => { if (document.visibilityState === 'visible') poll() }
    document.addEventListener('visibilitychange', visible)
    return () => { clearTimeout(timer.current); document.removeEventListener('visibilitychange', visible) }
  }, [poll])

  // Reloj para la cuenta atrás del turno.
  const admitted = state && 'status' in state && state.status === 'admitted' ? state : null
  useEffect(() => {
    if (!admitted) return
    document.title = '¡Es tu turno! · Reservar'
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [admitted])

  if (!state) {
    return <div className="bg-card flex items-center justify-center gap-3 rounded-2xl border p-10 text-sm shadow-xs"><Loader2 className="size-5 animate-spin" aria-hidden />Comprobando si hay cola…</div>
  }
  if ('status' in state && state.status === 'open') return <ReservationForm {...props} pass="" />
  if (admitted) {
    const left = Math.max(0, new Date(admitted.expires_at).getTime() - now)
    const minutes = Math.floor(left / 60000), seconds = Math.floor((left % 60000) / 1000)
    return (
      <div className="space-y-5">
        <div role="status" className="border-success/40 bg-success/10 flex flex-wrap items-center gap-3 rounded-2xl border p-4">
          <CircleCheck className="text-success size-6 shrink-0" aria-hidden />
          <p className="min-w-0 flex-1 text-sm"><strong>¡Es tu turno!</strong> Completa la reserva antes de las {formatTime(admitted.expires_at)}.</p>
          <span className={`rounded-lg px-3 py-1 font-mono text-lg font-bold tabular-nums ${minutes < 3 ? 'bg-destructive/15 text-destructive' : 'bg-card'}`}>
            {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
          </span>
        </div>
        <ReservationForm {...props} pass={admitted.token} onQueueExpired={() => { setState(null); setFirst(null); poll() }} />
      </div>
    )
  }

  const waiting = 'status' in state && state.status === 'waiting' ? state : null
  const progress = waiting && first ? Math.round((1 - waiting.ahead / Math.max(first, 1)) * 100) : 0
  return (
    <section aria-live="polite" className="bg-card mx-auto max-w-xl space-y-6 rounded-2xl border p-6 text-center shadow-lg sm:p-8">
      <span className="bg-accent/20 mx-auto flex size-16 items-center justify-center rounded-full"><Hourglass className="size-8 animate-pulse" aria-hidden /></span>
      <div className="space-y-1">
        <h2 className="text-xl font-bold">Estás en la sala de espera</h2>
        <p className="text-muted-foreground text-sm">Hay mucha gente reservando a la vez. Te daremos paso por orden de llegada.</p>
      </div>
      {waiting ? (
        <>
          <div>
            <p className="text-6xl font-bold tracking-tight tabular-nums">{waiting.ahead.toLocaleString('es-ES')}</p>
            <p className="text-muted-foreground mt-1 flex items-center justify-center gap-1.5 text-sm"><Users className="size-4" aria-hidden />{waiting.ahead === 1 ? 'persona delante de ti' : 'personas delante de ti'}</p>
          </div>
          <div className="space-y-2">
            <div className="bg-secondary h-3 overflow-hidden rounded-full" role="progressbar" aria-label="Avance en la cola" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
              <div className="bg-primary h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(progress, 3)}%` }} />
            </div>
            <p className="text-muted-foreground flex items-center justify-center gap-1.5 text-sm">
              <Clock className="size-4" aria-hidden />Tiempo estimado: {waiting.eta_minutes <= 1 ? 'menos de 1 minuto' : `unos ${waiting.eta_minutes} minutos`}
            </p>
          </div>
        </>
      ) : (
        <p role="alert" className="text-destructive text-sm">{'error' in state ? state.error : ''}</p>
      )}
      <ul className="bg-secondary/50 text-muted-foreground space-y-1.5 rounded-xl p-4 text-left text-xs">
        <li>• No hace falta recargar: esta página se actualiza sola.</li>
        <li>• Si la cierras o recargas, mantienes tu sitio en este navegador.</li>
        <li>• Cuando llegue tu turno tendrás 15 minutos para completar la reserva.</li>
      </ul>
      <div className="text-muted-foreground flex items-center justify-center gap-3 text-xs">
        {updated && <span>Actualizado a las {updated}</span>}
        <Button type="button" variant="ghost" size="sm" onClick={() => poll()}><RefreshCw aria-hidden />Actualizar</Button>
      </div>
    </section>
  )
}
