import { CircleAlert, CircleCheck, CircleX, DoorClosed, DoorOpen } from 'lucide-react'
import type { ReadinessItem } from '@/lib/event-readiness'
import { cn } from '@/lib/utils'

const ICON = {
  ok: <CircleCheck className="text-success size-5 shrink-0" aria-label="Correcto" />,
  error: <CircleX className="text-destructive size-5 shrink-0" aria-label="Falta" />,
  warning: <CircleAlert className="text-warning size-5 shrink-0" aria-label="Aviso" />,
}

export function ReadinessChecklist({ open, items, pickup, children }: {
  open: boolean; items: ReadinessItem[]; pickup: boolean; children?: React.ReactNode
}) {
  const what = pickup ? 'Las reservas' : 'Las inscripciones'
  const done = items.filter((i) => i.level === 'ok').length
  const list = (
    <ul className="grid gap-2 sm:grid-cols-2">
      {items.map((item) => (
        <li key={item.key} className="flex gap-2 text-sm">
          {ICON[item.level]}
          <span>
            <span className={cn(item.level === 'error' && 'font-semibold')}>{item.label}</span>
            {item.fix && <span className="text-muted-foreground block text-xs">{item.fix}</span>}
          </span>
        </li>
      ))}
    </ul>
  )
  const Icon = open ? DoorOpen : DoorClosed
  const header = (action?: React.ReactNode) => (
    <div className="flex flex-1 flex-wrap items-center gap-4">
      <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-full', open ? 'bg-success/15 text-success' : 'bg-warning/20 text-foreground')}>
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="font-semibold">
          {what} están <span className={open ? 'text-success' : ''}>{open ? 'abiertas' : 'cerradas'}</span> al público
        </h2>
        <p className="text-muted-foreground text-sm">
          {open ? `${done} de ${items.length} comprobaciones correctas`
            : items.some((i) => i.level === 'error') ? 'Para abrirlas, completa lo que aparece en rojo.' : 'Se abrirán solas en la fecha de apertura indicada.'}
        </p>
      </div>
      {action}
    </div>
  )
  return (
    <section aria-label="Estado del formulario público"
      className={cn('rounded-2xl border p-5', open ? 'border-success/40 bg-success/5' : 'border-warning bg-warning/5')}>
      {open ? (
        // Con todo en orden basta el resumen; el detalle queda a un clic.
        // El enlace queda fuera del <summary> para que pulsarlo no abra ni cierre el detalle.
        <div className="flex flex-wrap items-start gap-3">
          <details className="group min-w-0 flex-1">
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 [&::-webkit-details-marker]:hidden">
              {header(<span className="text-muted-foreground text-xs underline">
                <span className="group-open:hidden">Ver detalle</span><span className="hidden group-open:inline">Ocultar</span>
              </span>)}
            </summary>
            <div className="mt-4 border-t pt-4">{list}</div>
          </details>
          <div className="pt-3">{children}</div>
        </div>
      ) : (
        <div className="space-y-4">{header(children)}{list}</div>
      )}
    </section>
  )
}
