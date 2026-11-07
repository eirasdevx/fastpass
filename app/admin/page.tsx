import Link from 'next/link'
import { ArrowRight, CalendarPlus, ClipboardList, History, PackageCheck, ScanLine, Settings2, Users, type LucideIcon } from 'lucide-react'
import { requireAdmin } from '@/lib/auth'
import { DEMO_MODE } from '@/lib/demo/mode'
import { createClient } from '@/lib/supabase/server'
import { staffEvents,eventDashboard,type SearchParams } from '@/lib/admin-data'
import { itemName } from '@/lib/reservations'
import { formatDate, formatTime } from '@/lib/format'
import { EventSelector } from '@/components/admin/event-selector'
import { LiveDashboard } from '@/components/admin/live-dashboard'
import { EmptyState, PageHeader } from '@/components/admin/page-kit'
import { Button } from '@/components/ui/button'
import type { Dashboard } from '@/lib/registrations'
import EventsPage from './eventos/page'
export const metadata={title:'Panel de control'}

function Shortcut({href,title,description,icon:Icon}:{href:string;title:string;description:string;icon:LucideIcon}){
  return <Link href={href} className="group bg-card hover:border-foreground/20 flex gap-4 rounded-2xl border p-5 shadow-xs transition hover:shadow-md">
    <span className="bg-secondary text-foreground flex size-10 shrink-0 items-center justify-center rounded-xl"><Icon className="size-5" aria-hidden/></span>
    <span className="min-w-0 space-y-1"><span className="flex items-center gap-1 font-semibold">{title}<ArrowRight className="size-4 transition group-hover:translate-x-0.5" aria-hidden/></span><span className="text-muted-foreground block text-sm">{description}</span></span>
  </Link>
}

export default async function DashboardPage({searchParams}:{searchParams:Promise<SearchParams>}){
  const admin=await requireAdmin()
  if(DEMO_MODE)return <EventsPage/>
  const params=await searchParams,events=await staffEvents(),event=events.find(e=>e.id===params.evento)??events[0]
  const options=admin.role==='admin'?[{id:'todos',title:'Todos los eventos'},...events]:events
  if(params.evento==='todos'&&admin.role==='admin'){
    const db=await createClient(),{data,error}=await db.rpc('global_dashboard')
    if(error||!data)throw new Error('No se pudieron cargar las estadísticas globales.')
    return <div className="space-y-6"><PageHeader eyebrow="Resumen" title="Estadísticas globales" description="Todos los eventos y organizaciones, incluidos los históricos. Si algún evento no tiene aforo, la ocupación global no se calcula." actions={<Button asChild variant="outline"><Link href="/admin/eventos">Gestionar eventos</Link></Button>}/>
      <EventSelector events={options} selected="todos"/><LiveDashboard key="todos" event="todos" initial={data as unknown as Dashboard}/></div>
  }
  if(!event)return <div className="space-y-6"><PageHeader eyebrow="Resumen" title="Bienvenido a FastPass"/>
    <EmptyState icon={CalendarPlus} title="Tu próximo evento empieza aquí" description="Crea un evento para gestionar reservas, inscripciones, entradas y accesos desde un solo sitio." action={<Button asChild><Link href="/admin/eventos/nuevo"><CalendarPlus/>Crear evento</Link></Button>}/></div>
  const data=await eventDashboard(event.id)
  if(!data)throw new Error('No se pudieron cargar las estadísticas.')
  const pickup=data.mode==='pickup',item=itemName(event.pickup_item_name)
  const links:{href:string;title:string;description:string;icon:LucideIcon}[]=pickup?[
    {href:`/admin/reservas?evento=${event.id}`,title:'Reservas',description:'Busca reservas, añade reservas manuales y exporta el listado.',icon:ClipboardList},
    {href:`/admin/historial?evento=${event.id}`,title:'Historial',description:`Entregas de ${item} y accesos, con quién atendió cada uno.`,icon:History},
    {href:`/admin/eventos/${event.id}`,title:'Configurar evento',description:`Aforo, tipos de ${item}, plazos de reserva y diseño.`,icon:Settings2},
  ]:[
    {href:`/admin/asistentes?evento=${event.id}`,title:'Asistentes',description:'Revisa solicitudes, añade titulares y comparte entradas.',icon:Users},
    {href:`/admin/historial?evento=${event.id}`,title:'Historial',description:'Accesos confirmados e intentos rechazados.',icon:History},
    {href:`/admin/eventos/${event.id}`,title:'Configurar evento',description:'Aforo, tipos de entrada, inscripción y diseño.',icon:Settings2},
  ]
  return <div className="space-y-6">
    <PageHeader eyebrow="Métricas del evento" title="Panel general"
      description={<span className="first-letter:uppercase">{formatDate(event.starts_at)} · {formatTime(event.starts_at)}{event.venue?` · ${event.venue}`:''}</span>}
      actions={<Button asChild variant="accent"><Link href={`/admin/accesos?evento=${event.id}`}>{pickup?<PackageCheck/>:<ScanLine/>}{pickup?'Punto de recogida':'Control de accesos'}</Link></Button>}/>
    <EventSelector events={options} selected={event.id}/>
    <LiveDashboard key={event.id} event={event.id} initial={data}/>
    <section aria-label="Accesos directos" className="space-y-4 rounded-2xl border bg-card p-6"><h2 className="text-xl font-bold">Acciones rápidas</h2><div className="grid gap-3 sm:grid-cols-3">{links.map(l=><Shortcut key={l.href} {...l}/>)}</div></section>
  </div>
}
