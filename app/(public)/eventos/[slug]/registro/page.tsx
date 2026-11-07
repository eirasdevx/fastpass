import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { CalendarDays, ChevronLeft, Info, MapPin } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { RegistrationForm } from '@/components/registration-form'
import { EventCover } from '@/components/public/event-cover'
import { DEMO_MODE } from '@/lib/demo/mode'
import { formatDateTime } from '@/lib/format'

const NOTES: Record<string, string> = {
  automatic: 'Al enviar el formulario recibirás al momento tu entrada privada con QR.',
  payment: 'Tu solicitud quedará pendiente. No se cobra ni se emiten entradas de pago desde esta plataforma.',
}

export default async function RegisterPage({params}:{params:Promise<{slug:string}>}) {
  if(DEMO_MODE) return <div className="mx-auto max-w-xl p-8">El registro individual requiere configurar Supabase. La demo local conserva el flujo de pedidos de ejemplo.</div>
  const {slug}=await params, db=await createClient()
  const {data:event,error}=await db.from('events').select('*').eq('slug',slug).eq('published',true).maybeSingle()
  if(error) throw new Error('No se pudo cargar el evento.')
  if(!event) notFound()
  if(event.registration_mode==='pickup') redirect(`/eventos/${slug}/reservar`)
  const {data:types,error:typeError}=await db.from('ticket_types').select('id,name,price').eq('event_id',event.id).eq('sales_open',true).order('price')
  if(typeError) throw new Error('No se pudieron cargar las entradas.')
  const available=event.registration_enabled&&['published','live'].includes(event.status??'')&&new Date(event.ends_at??event.starts_at)>new Date()&&event.privacy_controller&&event.privacy_contact
  return <div className="mx-auto max-w-2xl space-y-6 px-4 py-8 sm:px-6 sm:py-10">
    <Link className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm" href={`/eventos/${slug}`}><ChevronLeft className="size-4" aria-hidden/>Volver al evento</Link>
    <header className="flex items-center gap-4">
      <EventCover url={event.cover_url} title={event.title} className="hidden size-20 shrink-0 rounded-2xl sm:block"/>
      <div className="min-w-0 space-y-1">
        <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">Inscripción</p>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{event.title}</h1>
        <p className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <span className="inline-flex items-center gap-1.5"><CalendarDays className="size-4" aria-hidden/>{formatDateTime(event.starts_at)}</span>
          {event.venue&&<span className="inline-flex items-center gap-1.5"><MapPin className="size-4" aria-hidden/>{event.venue}</span>}
        </p>
      </div>
    </header>
    {available?<>
      <p className="bg-accent/10 flex gap-3 rounded-xl p-4 text-sm"><Info className="mt-0.5 size-4 shrink-0" aria-hidden/>{NOTES[event.registration_mode??'']??'La organización revisará tu solicitud. Hasta que la apruebe, no permite acceder al evento.'}</p>
      <RegistrationForm eventId={event.id} types={(types??[]).map(t=>({...t,price:Number(t.price)}))} lastRequired={event.last_name_required} phoneRequired={event.phone_required}/>
    </>:<p role="status" className="bg-card rounded-2xl border p-6">Las inscripciones no están disponibles en este momento.</p>}
  </div>
}
