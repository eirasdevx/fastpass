import { cn } from '@/lib/utils'

/** Bloque numerado de un formulario público: guía a la persona paso a paso. */
export function FormStep({ step, title, description, children, className }: {
  step: number; title: string; description?: React.ReactNode; children: React.ReactNode; className?: string
}) {
  return (
    <section className={cn('bg-card space-y-5 rounded-2xl border p-5 shadow-xs sm:p-6', className)} aria-labelledby={`step-${step}`}>
      <div className="flex items-start gap-3">
        <span className="bg-primary text-primary-foreground grid size-7 shrink-0 place-items-center rounded-full text-sm font-bold">{step}</span>
        <div>
          <h2 id={`step-${step}`} className="font-semibold">{title}</h2>
          {description && <p className="text-muted-foreground text-sm">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  )
}

/** Opción seleccionable en forma de tarjeta (radio nativo, accesible con teclado). */
export function OptionCard({ name, value, checked, onChange, title, detail, aside, disabled }: {
  name: string; value: string; checked: boolean; onChange: () => void; title: string; detail?: string; aside?: React.ReactNode; disabled?: boolean
}) {
  return (
    <label className={cn('flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition',
      'has-[:focus-visible]:ring-ring/50 has-[:focus-visible]:ring-[3px]',
      checked ? 'border-primary bg-primary/5 ring-primary ring-1' : 'hover:border-foreground/25 hover:bg-secondary/40',
      disabled && 'cursor-not-allowed opacity-50')}>
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} disabled={disabled} required className="accent-primary mt-1 size-4" />
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{title}</span>
        {detail && <span className="text-muted-foreground mt-0.5 block text-sm">{detail}</span>}
      </span>
      {aside && <span className="shrink-0 font-semibold tabular-nums">{aside}</span>}
    </label>
  )
}
