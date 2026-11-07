import type { ReactNode } from 'react'
import { CheckCircle2, SearchX, TriangleAlert, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

export type ScanKind = 'ok' | 'denied' | 'missing' | 'warning'

const KINDS = {
  ok: { icon: CheckCircle2, label: 'Correcto', box: 'border-success bg-success/15', tone: 'text-success' },
  denied: { icon: XCircle, label: 'Denegado', box: 'border-destructive bg-destructive/15', tone: 'text-destructive' },
  missing: { icon: SearchX, label: 'No existe', box: 'border-destructive bg-destructive/10', tone: 'text-destructive' },
  warning: { icon: TriangleAlert, label: 'Alerta', box: 'border-warning bg-warning/20', tone: 'text-amber-700 dark:text-amber-300' },
} as const

/** Resultado de un escaneo en Accesos: se tiene que entender de un vistazo y a distancia. */
export function ScanResult({ kind, title, children, onNext, nextLabel = 'Siguiente' }: {
  kind: ScanKind; title: string; children?: ReactNode; onNext: () => void; nextLabel?: string
}) {
  const k = KINDS[kind], Icon = k.icon
  return (
    <section role="status" aria-live="assertive" className={`space-y-4 rounded-2xl border-4 p-6 text-center ${k.box}`}>
      <Icon className={`mx-auto size-20 ${k.tone}`} strokeWidth={2.5} />
      <div>
        <p className={`text-4xl font-black tracking-wide uppercase ${k.tone}`}>{k.label}</p>
        <h2 className="mt-1 text-xl font-bold">{title}</h2>
      </div>
      {children && <div className="space-y-2 text-left">{children}</div>}
      <Button autoFocus className="h-14 w-full text-lg" onClick={onNext}>{nextLabel}</Button>
    </section>
  )
}
