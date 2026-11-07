import { requireAdmin } from '@/lib/auth'
import type { Metadata } from 'next'
import Link from 'next/link'
import { blankPreset, reservationPreset, ticketPreset } from '@/lib/tickets/blocks'
import { BlockEditor } from '@/components/admin/block-editor'
import { ChevronLeft, ChevronRight, ClipboardList, Ticket } from 'lucide-react'
import { PageHeader } from '@/components/admin/page-kit'

export const metadata: Metadata = { title: 'Nueva plantilla' }

const MODELS = {
  entrada: { title: 'Entrada clásica', text: 'Entrada digital con QR para validar en la puerta.', name: 'Entrada', design: ticketPreset },
  reserva: { title: 'Justificante de reserva', text: 'Para reservas con recogida y pago presencial (bonocopas, pulseras…).', name: 'Justificante de reserva', design: reservationPreset },
  'blanco-entrada': { title: 'Entrada en blanco', text: 'Empieza sin bloques y construye tu entrada.', name: 'Entrada', design: () => blankPreset('ticket') },
  'blanco-reserva': { title: 'Justificante en blanco', text: 'Empieza sin bloques; el aviso obligatorio se añade solo.', name: 'Justificante', design: () => blankPreset('reservation') },
} as const

export default async function NewTemplatePage({ searchParams }: { searchParams: Promise<{ modelo?: string }> }) {
  await requireAdmin()
  const { modelo } = await searchParams
  const model = modelo && modelo in MODELS ? MODELS[modelo as keyof typeof MODELS] : null

  if (!model) {
    return (
      <div className="space-y-6">
        <Link href="/admin/plantillas" className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"><ChevronLeft className="size-4" aria-hidden />Plantillas</Link>
        <PageHeader title="Nueva plantilla" description="Elige desde qué empezar. Después puedes cambiarlo todo." />
        <ul className="grid gap-4 sm:grid-cols-2">
          {Object.entries(MODELS).map(([key, m]) => {
            const Icon = key.includes('reserva') ? ClipboardList : Ticket
            return (
              <li key={key}>
                <Link href={`/admin/plantillas/nueva?modelo=${key}`} className="group bg-card hover:border-foreground/20 flex h-full gap-4 rounded-2xl border p-5 shadow-xs transition hover:shadow-md">
                  <span className="bg-secondary flex size-10 shrink-0 items-center justify-center rounded-xl"><Icon className="size-5" aria-hidden /></span>
                  <span>
                    <span className="flex items-center gap-1 font-semibold">{m.title}<ChevronRight className="size-4 transition group-hover:translate-x-0.5" aria-hidden /></span>
                    <span className="text-muted-foreground mt-1 block text-sm">{m.text}</span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Link href="/admin/plantillas/nueva" className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"><ChevronLeft className="size-4" aria-hidden />Elegir otro modelo</Link>
      <PageHeader title={`Nueva plantilla · ${model.title}`} />
      <BlockEditor initialName={model.name} initialDesign={model.design()} />
    </div>
  )
}
