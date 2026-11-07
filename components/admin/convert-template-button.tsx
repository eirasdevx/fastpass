'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Blocks } from 'lucide-react'
import { saveTemplate } from '@/app/admin/plantillas/actions'
import { fromLegacy } from '@/lib/tickets/blocks'
import type { TicketDesign } from '@/lib/tickets/design'
import { Button } from '@/components/ui/button'

/** Pasa una plantilla antigua (diseños fijos) al constructor por bloques. */
export function ConvertTemplateButton({ id, name, design, descriptionTemplate }: { id: string; name: string; design: TicketDesign; descriptionTemplate: string }) {
  const router = useRouter()
  const [pending, start] = useTransition(), [error, setError] = useState('')
  return (
    <div className="bg-secondary/40 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 text-sm">
      <p>Esta plantilla usa el formato antiguo de diseños fijos. Pásala al <strong>constructor por bloques</strong> para personalizarla del todo.</p>
      <Button type="button" disabled={pending} onClick={() => {
        if (!confirm('¿Pasar esta plantilla al constructor por bloques? Se mantienen colores y textos; las entradas que la usan se verán con el nuevo formato.')) return
        start(async () => {
          const result = await saveTemplate(id, { name, description_template: '', design: fromLegacy(design, descriptionTemplate) })
          if (result.error) setError(result.error)
          else router.refresh()
        })
      }}><Blocks /> {pending ? 'Convirtiendo…' : 'Pasar a bloques'}</Button>
      {error && <p role="alert" className="text-destructive w-full">{error}</p>}
    </div>
  )
}
