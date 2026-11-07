import Link from 'next/link'
import { CalendarPlus, CircleCheck, CircleX, History as HistoryIcon, PackageCheck } from 'lucide-react'
import { requireAdmin } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { DEMO_MODE } from '@/lib/demo/mode'
import { staffEvents,attendeeFilters,type SearchParams } from '@/lib/admin-data'
import { accessLabels } from '@/lib/registrations'
import { itemName } from '@/lib/reservations'
import { formatDateTime } from '@/lib/format'
import { EventSelector } from '@/components/admin/event-selector'
import { DatabaseRequired } from '@/components/admin/database-required'
import { RefreshHistory } from '@/components/admin/refresh-history'
import { EmptyState, PageHeader, Pagination, table } from '@/components/admin/page-kit'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
export const metadata={title:'Historial de accesos'}
type HistoryRow={kind:'access'|'pickup';id:number;created_at:string;name:string|null;code:string|null;result:string;quantity:number|null;amount:number|null;payment_method:string|null;staff:string|null}
const methods:Record<string,string>={cash:'efectivo',card:'tarjeta',bizum:'Bizum',other:'otro medio'}
const ok=new Set(['valid','pickup'])
const SIZE=50
export default async function History({searchParams}:{searchParams:Promise<SearchParams>}){
  await requireAdmin();if(DEMO_MODE)return <DatabaseRequired/>
  const params=await searchParams,events=await staffEvents(),event=events.find(e=>e.id===params.evento)??events[0]
  if(!event)return <div className="space-y-6"><PageHeader title="Historial"/><EmptyState icon={CalendarPlus} title="Aún no hay eventos" action={<Button asChild><Link href="/admin/eventos/nuevo">Crear evento</Link></Button>}/></div>
  const page=attendeeFilters(params).p_page,db=await createClient()
  const {data,error}=await db.rpc('event_history',{p_event:event.id,p_page:page,p_size:SIZE})
  if(error)throw new Error('No se pudo cargar el historial. Si acabas de actualizar la aplicación, aplica la migración 0016.')
  const {total,rows}=data as unknown as {total:number;rows:HistoryRow[]},item=itemName(event.pickup_item_name)
  const money=(v:number|null)=>new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR'}).format(Number(v)||0)
  const label=(row:HistoryRow)=>row.kind==='pickup'?`Entrega de ${row.quantity} ${item}`:accessLabels[row.result]??row.result
  const detail=(row:HistoryRow)=>row.kind==='pickup'?`${money(row.amount)} en ${methods[row.payment_method??'']??row.payment_method}`:null
  return <div className="space-y-6">
    <PageHeader title="Historial" description="Accesos con entrada y entregas de reservas confirmados por el servidor, del más reciente al más antiguo. Los registros no se pueden editar." actions={<RefreshHistory/>}/>
    <EventSelector events={events} selected={event.id}/>
    {!rows.length?<EmptyState icon={HistoryIcon} title="Todavía no hay operaciones" description="Cuando se valide una entrada o se entregue una reserva en Accesos, aparecerá aquí."/>:
    <div className={table.wrap}><table className={table.table}><thead className={table.head}><tr>{['Fecha y hora','Operación','Persona','Código','Atendido por'].map(h=><th key={h} className={table.th}>{h}</th>)}</tr></thead><tbody>{rows.map(row=>{
      const good=ok.has(row.result),Icon=row.kind==='pickup'?PackageCheck:good?CircleCheck:CircleX
      return <tr key={`${row.kind}-${row.id}`} className={table.row}>
        <td className={cn(table.td,'text-muted-foreground whitespace-nowrap tabular-nums')}>{formatDateTime(row.created_at)}</td>
        <td className={table.td}><span className="flex items-start gap-2"><Icon className={cn('mt-0.5 size-4 shrink-0',good?'text-success':'text-destructive')} aria-hidden/><span><span className="font-medium">{label(row)}</span>{detail(row)&&<span className="text-muted-foreground block text-xs">{detail(row)}</span>}</span></span></td>
        <td className={table.td}>{row.name??'—'}</td>
        <td className={table.td}>{row.code?<span className="bg-secondary rounded-md px-2 py-1 font-mono text-sm font-semibold tracking-wider">{row.code}</span>:'—'}</td>
        <td className={cn(table.td,'text-muted-foreground')}>{row.staff??'—'}</td>
      </tr>})}</tbody></table></div>}
    <Pagination page={page} total={total} size={SIZE} href={n=>`?evento=${event.id}&pagina=${n}`} label="operaciones"/>
  </div>
}
