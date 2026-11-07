import Link from 'next/link'
import { ChevronLeft, ChevronRight, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Piezas comunes del panel: así todas las pantallas comparten cabecera, cifras, vacíos y paginación. */

export function PageHeader({ title, description, eyebrow, actions, className }: {
  title: React.ReactNode; description?: React.ReactNode; eyebrow?: React.ReactNode; actions?: React.ReactNode; className?: string
}) {
  return (
    <header className={cn('flex flex-wrap items-end justify-between gap-4', className)}>
      <div className="min-w-0 space-y-1.5">
        {eyebrow && <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">{eyebrow}</p>}
        <h1 className="text-3xl font-extrabold tracking-tight text-balance sm:text-4xl">{title}</h1>
        {description && <p className="text-muted-foreground max-w-2xl text-sm sm:text-base">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

export const TONES = {
  neutral: 'bg-secondary text-muted-foreground',
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/20 text-foreground',
  accent: 'bg-accent/20 text-foreground',
  danger: 'bg-destructive/10 text-destructive',
} as const
export type Tone = keyof typeof TONES

export function StatCard({ label, value, hint, icon: Icon, tone = 'neutral' }: {
  label: string; value: React.ReactNode; hint?: React.ReactNode; icon?: LucideIcon; tone?: Tone
}) {
  return (
    <div className="bg-card relative flex min-h-36 flex-col items-start gap-4 rounded-2xl border p-5 shadow-xs">
      {Icon && <span className={cn('absolute top-4 right-4 flex size-8 shrink-0 items-center justify-center rounded-lg', TONES[tone])}><Icon className="size-5" aria-hidden /></span>}
      <div className="min-w-0">
        <dt className="text-muted-foreground pr-8 text-[11px] font-medium uppercase tracking-wide">{label}</dt>
        <dd className="mt-3 text-3xl font-bold tracking-tight tabular-nums">{value}</dd>
        {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
      </div>
    </div>
  )
}

export function StatGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <dl className={cn('grid grid-cols-2 gap-3 lg:grid-cols-4', className)}>{children}</dl>
}

export function EmptyState({ icon: Icon, title, description, action }: {
  icon?: LucideIcon; title: string; description?: React.ReactNode; action?: React.ReactNode
}) {
  return (
    <div className="bg-card/50 flex flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-12 text-center">
      {Icon && <span className="bg-secondary text-muted-foreground flex size-12 items-center justify-center rounded-full"><Icon className="size-6" aria-hidden /></span>}
      <div className="space-y-1">
        <p className="font-semibold">{title}</p>
        {description && <p className="text-muted-foreground mx-auto max-w-md text-sm">{description}</p>}
      </div>
      {action}
    </div>
  )
}

/** Estilos de tabla compartidos: cabecera discreta, filas con separación y hover. */
export const table = {
  wrap: 'bg-card overflow-x-auto rounded-2xl border shadow-xs',
  table: 'w-full text-left text-sm',
  head: 'text-muted-foreground border-b text-xs font-medium',
  th: 'px-4 py-3 font-medium whitespace-nowrap',
  row: 'hover:bg-secondary/30 border-b transition-colors last:border-0',
  td: 'px-4 py-3 align-middle',
}

export function Pagination({ page, total, size, href, label = 'resultados' }: {
  page: number; total: number; size: number; href: (page: number) => string; label?: string
}) {
  const pages = Math.max(1, Math.ceil(total / size))
  const link = 'inline-flex h-9 items-center gap-1 rounded-md border bg-background px-3 text-sm font-medium shadow-xs transition hover:bg-secondary'
  const off = 'pointer-events-none opacity-40'
  return (
    <nav aria-label="Paginación" className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-muted-foreground text-sm">{total} {label} · página {Math.min(page, pages)} de {pages}</p>
      <div className="flex gap-2">
        <Link href={href(page - 1)} aria-disabled={page <= 1} tabIndex={page <= 1 ? -1 : undefined} className={cn(link, page <= 1 && off)}><ChevronLeft className="size-4" aria-hidden />Anterior</Link>
        <Link href={href(page + 1)} aria-disabled={page >= pages} tabIndex={page >= pages ? -1 : undefined} className={cn(link, page >= pages && off)}>Siguiente<ChevronRight className="size-4" aria-hidden /></Link>
      </div>
    </nav>
  )
}
