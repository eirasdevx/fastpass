import { requireAdmin } from '@/lib/auth'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Palette, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { parseDesign, LAYOUTS } from '@/lib/tickets/design'
import { parseBlockDesign } from '@/lib/tickets/blocks'
import { formatShortDate } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState, PageHeader } from '@/components/admin/page-kit'

export const metadata: Metadata = { title: 'Plantillas' }

export default async function TemplatesPage() {
  await requireAdmin()
  const supabase = await createClient()
  const { data: templates, error } = await supabase
    .from('ticket_templates')
    .select('id, name, design, updated_at, ticket_types(count)')
    .order('name')
  if (error) throw new Error('No se pudo cargar la información.')

  return (
    <div className="space-y-6">
      <PageHeader title="Plantillas" description="Diseña cómo se ven las entradas y los justificantes de reserva, en pantalla e impresos."
        actions={<Button asChild><Link href="/admin/plantillas/nueva"><Plus /> Nueva plantilla</Link></Button>} />

      {templates.length === 0 ? (
        <EmptyState icon={Palette} title="Todavía no hay plantillas" description="Sin plantilla se usa un diseño por defecto. Crea una para darle tu imagen."
          action={<Button asChild><Link href="/admin/plantillas/nueva"><Plus /> Crear plantilla</Link></Button>} />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => {
            const blocks = parseBlockDesign(template.design)
            const legacy = parseDesign(template.design)
            const colors = blocks ? blocks.theme : legacy
            const reservation = blocks?.kind === 'reservation'
            const headline = blocks ? (reservation ? 'JUSTIFICANTE' : 'ENTRADA') : legacy.headline || 'ENTRADA'
            const uses = template.ticket_types[0]?.count ?? 0
            return (
              <li key={template.id}>
                <Link
                  href={`/admin/plantillas/${template.id}`}
                  className="group bg-card focus-visible:ring-ring/50 block overflow-hidden rounded-2xl border shadow-xs transition hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-[3px] focus-visible:outline-none"
                >
                  {/* Miniatura: los colores reales de la plantilla con la silueta de una entrada. */}
                  <div className="relative flex h-32 flex-col justify-between p-4" style={{ backgroundColor: colors.backgroundColor, color: colors.textColor }}>
                    <span className="text-[10px] font-semibold tracking-[0.25em]" style={{ color: colors.accentColor }}>{headline}</span>
                    <div className="space-y-1.5 opacity-80">
                      <div className="h-2.5 w-2/3 rounded-full" style={{ backgroundColor: colors.textColor, opacity: 0.85 }} />
                      <div className="h-2 w-1/3 rounded-full" style={{ backgroundColor: colors.textColor, opacity: 0.4 }} />
                    </div>
                    <div className="absolute top-4 right-4 size-10 rounded-md border-2 border-dashed opacity-40" style={{ borderColor: colors.textColor }} />
                  </div>
                  <div className="space-y-2 p-4">
                    <p className="truncate font-medium group-hover:underline">{template.name}</p>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <Badge variant={reservation ? 'warning' : 'secondary'}>{blocks ? (reservation ? 'Justificante' : 'Entrada') : `Entrada · ${LAYOUTS[legacy.layout]}`}</Badge>
                      <span className="text-muted-foreground">{uses} {uses === 1 ? 'tipo la usa' : 'tipos la usan'} · {formatShortDate(template.updated_at)}</span>
                    </div>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
