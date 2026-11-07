import * as React from 'react'
import { cn } from '@/lib/utils'

/** Select nativo con el estilo de los inputs (accesible y sin JS extra). */
function NativeSelect({ className, ...props }: React.ComponentProps<'select'>) {
  return (
    <select
      data-slot="select"
      className={cn(
        'border-input hover:border-foreground/25 bg-card flex h-10 w-full cursor-pointer rounded-lg border px-3 py-1 text-base shadow-xs transition-[border-color,box-shadow] outline-none md:text-sm',
        'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
        'aria-invalid:border-destructive disabled:opacity-50 [&>option]:bg-card',
        className
      )}
      {...props}
    />
  )
}

export { NativeSelect }
