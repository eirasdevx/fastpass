import { requireAdmin } from '@/lib/auth'
import { DEMO_MODE } from '@/lib/demo/mode'
import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import { EventForm } from '@/components/admin/event-form'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/admin/page-kit'

export const metadata: Metadata = { title: 'Nuevo evento' }

async function organizationName() {
  if (DEMO_MODE) return ''
  const db = await createClient()
  const { data: org } = await db.rpc('current_organization_id')
  if (!org) return ''
  const { data } = await db.from('organizations').select('name').eq('id', org).maybeSingle()
  return data?.name ?? ''
}

export default async function NewEventPage() {
  const user = await requireAdmin()
  const organization = await organizationName()
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/admin/eventos" className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"><ChevronLeft className="size-4" aria-hidden />Eventos</Link>
      <PageHeader title="Nuevo evento" description="Tres pasos y lo tienes listo para recibir reservas o vender entradas." />
      <ol className="grid gap-3 sm:grid-cols-3">
        {[
          ['Datos', <>Rellena el formulario y pulsa <strong>Crear evento y seguir</strong>.</>],
          ['Tipos', <>Añade los tipos (de entrada, de bonocopas…) con su precio y cupo.</>],
          ['Publicar', <>Con la lista de comprobación en verde, cambia el estado a <strong>Publicado</strong>.</>],
        ].map(([title, text], i) => (
          <li key={i} className="bg-card flex gap-3 rounded-2xl border p-4 text-sm shadow-xs">
            <span className="bg-primary text-primary-foreground grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold">{i + 1}</span>
            <span><span className="block font-semibold">{title}</span><span className="text-muted-foreground">{text}</span></span>
          </li>
        ))}
      </ol>
      <Card>
        <CardHeader>
          <CardTitle>Datos del evento</CardTitle>
        </CardHeader>
        <CardContent>
          <EventForm
            defaultValues={{
              title: '',
              description: '',
              venue: '',
              starts_at: '',
              ends_at: '',
              cover_url: '',
              latitude: null,
              longitude: null,
              published: false,
              status: 'draft',
              registration_enabled: !DEMO_MODE,
              registration_mode: DEMO_MODE ? 'manual' : 'pickup',
              last_name_required: true,
              prevent_duplicates: true,
              phone_required: false,
              privacy_controller: organization,
              privacy_contact: DEMO_MODE ? '' : user.email ?? '',
              retention_days: 90,
              reservations_open_at: '',
              reservations_close_at: '',
              pickup_deadline: '',
              pickup_address: '',
              pickup_instructions: '',
              max_per_person: null,
              reserved_other_channels: 0,
              pickup_item_name: 'bonocopas',
              attendee_details: false,
              require_document: false,
              require_birth_date: false,
              min_age: null,
            }}
          />
        </CardContent>
      </Card>
    </div>
  )
}
