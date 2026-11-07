import Link from 'next/link'
import { CalendarPlus, Download, Search, Users } from 'lucide-react'
import { requireAdmin } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { DEMO_MODE } from '@/lib/demo/mode'
import { DatabaseRequired } from '@/components/admin/database-required'
import { EventSelector } from '@/components/admin/event-selector'
import { AddAttendee,AttendeeControls } from '@/components/admin/attendee-controls'
import { EmptyState, PageHeader, Pagination, table } from '@/components/admin/page-kit'
import { attendeePage,staffEvents,attendeeFilters,reservationFilters,type SearchParams } from '@/lib/admin-data'
import { statusLabels, statusVariant } from '@/lib/registrations'
import { formatDateTime } from '@/lib/format'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ReservationPeople } from '@/components/admin/reservation-people'
export const metadata={title:'Asistentes'}
export default async function Attendees({searchParams}:{searchParams:Promise<SearchParams>}){
  await requireAdmin()
  if(DEMO_MODE)return <DatabaseRequired/>
  const params=await searchParams,events=await staffEvents(),event=events.find(e=>e.id===params.evento)??events[0]
  if(!event)return <div className="space-y-6"><PageHeader title="Asistentes"/><EmptyState icon={CalendarPlus} title="Aún no hay eventos" description="Crea un evento para gestionar sus asistentes." action={<Button asChild><Link href="/admin/eventos/nuevo">Crear evento</Link></Button>}/></div>
  // Evento con reserva y recogida: los asistentes son las personas de cada reserva.
  if(event.registration_mode==='pickup'){
    const {data:pickupTypes,error:typesError}=await createClient().then(db=>db.from('ticket_types').select('id,name').eq('event_id',event.id))
    if(typesError)throw new Error('No se pudieron cargar los tipos.')
    // La exportación respeta los filtros aplicados.
    const f=reservationFilters(params),q=new URLSearchParams({evento:event.id,q:f.p_query,estado:f.p_status,tipo:f.p_type??'',orden:f.p_ascending?'asc':'desc'})
    return <div className="space-y-6"><PageHeader title="Asistentes" description="Personas que ya tienen su entrada física." actions={<Button asChild variant="outline"><a href={`/admin/asistentes/exportar?${q}`}><Download/> Exportar CSV</a></Button>}/>
      <EventSelector events={events} selected={event.id}/><ReservationPeople event={event.id} itemName={event.pickup_item_name} types={pickupTypes??[]} params={params}/></div>
  }
  const filters=attendeeFilters(params),db=await createClient()
  const [page,{data:types,error}]=await Promise.all([attendeePage(event.id,params),db.from('ticket_types').select('id,name').eq('event_id',event.id)])
  if(error)throw new Error('No se pudieron cargar los tipos de entrada.')
  const query=new URLSearchParams({evento:event.id,q:filters.p_query,estado:filters.p_status,tipo:filters.p_type??'',orden:filters.p_ascending?'asc':'desc'})
  const href=(n:number)=>`/admin/asistentes?${query}&pagina=${n}`
  const filtered=!!(filters.p_query||filters.p_status||filters.p_type)
  return <div className="space-y-6">
    <PageHeader title="Asistentes y entradas" description="Solicitudes, titulares y estado de acceso en un único listado." actions={<Button asChild variant="outline"><a href={`/admin/asistentes/exportar?${query}`}><Download/> Exportar CSV</a></Button>}/>
    <EventSelector events={events} selected={event.id}/>
    <AddAttendee event={event.id} types={types??[]} phoneRequired={event.phone_required} lastRequired={event.last_name_required}/>
    <form className="bg-card grid items-end gap-3 rounded-2xl border p-4 shadow-xs sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto]"><input type="hidden" name="evento" value={event.id}/>
      <label className="grid gap-1.5 text-xs font-medium">Buscar<span className="relative"><Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" aria-hidden/><Input name="q" defaultValue={filters.p_query} maxLength={120} placeholder="Nombre o código" className="pl-9"/></span></label>
      <label className="grid gap-1.5 text-xs font-medium">Estado<NativeSelect name="estado" defaultValue={filters.p_status}><option value="">Todos</option>{Object.entries(statusLabels).map(([v,label])=><option key={v} value={v}>{label}</option>)}</NativeSelect></label>
      <label className="grid gap-1.5 text-xs font-medium">Tipo<NativeSelect name="tipo" defaultValue={filters.p_type??''}><option value="">Todos</option>{types?.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</NativeSelect></label>
      <label className="grid gap-1.5 text-xs font-medium">Orden<NativeSelect name="orden" defaultValue={filters.p_ascending?'asc':'desc'}><option value="desc">Más recientes</option><option value="asc">Más antiguos</option></NativeSelect></label>
      <div className="flex gap-2"><Button type="submit"><Search/> Buscar</Button>{filtered&&<Button asChild variant="ghost"><Link href={`/admin/asistentes?evento=${event.id}`}>Limpiar</Link></Button>}</div>
    </form>
    {page.rows.length===0?<EmptyState icon={Users} title={filtered?'Nadie coincide con estos filtros':'Todavía no hay asistentes'} description={filtered?'Prueba con otra búsqueda o limpia los filtros.':'Las inscripciones y entradas de este evento aparecerán aquí.'}/>:
    <div className={table.wrap}><table className={table.table}><thead className={table.head}><tr>{['Nombre','Código','Tipo','Estado',''].map(h=><th key={h} className={table.th}>{h}</th>)}</tr></thead><tbody>
      {page.rows.map(row=><tr key={row.registration_id??row.ticket_id} className={table.row}>
        <td className={table.td}><p className="font-medium">{row.name}</p><p className="text-muted-foreground text-xs">{row.email}</p></td>
        <td className={table.td}>{row.code?<span className="bg-secondary rounded-md px-2 py-1 font-mono text-sm font-semibold tracking-wider">{row.code}</span>:'—'}</td>
        <td className={table.td}>{row.type_name}</td>
        <td className={table.td}><Badge variant={statusVariant[row.status]}>{statusLabels[row.status]}</Badge></td>
        <td className={table.td}><details className="group"><summary className="text-muted-foreground hover:text-foreground cursor-pointer list-none text-sm font-medium underline-offset-4 hover:underline [&::-webkit-details-marker]:hidden">Gestionar</summary><div className="mt-3 min-w-64 space-y-3"><p className="text-muted-foreground text-xs">Alta: {formatDateTime(row.created_at)}{row.used_at&&` · Acceso: ${formatDateTime(row.used_at)}`}</p>{row.phone&&<p>Teléfono: {row.phone}</p>}{row.notes&&<p className="whitespace-pre-wrap">Notas: {row.notes}</p>}<AttendeeControls row={row} event={event.id} phoneRequired={event.phone_required} lastRequired={event.last_name_required}/></div></details></td>
      </tr>)}
    </tbody></table></div>}
    <Pagination page={filters.p_page} total={page.total} size={25} href={href} label="asistentes"/>
  </div>
}
