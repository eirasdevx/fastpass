import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { privateTokenSchema } from '@/lib/validations/registration'
import { statusLabels } from '@/lib/registrations'
import { TemplatedTicket } from '@/components/ticket/ticket-card'
import { OrderActions } from '@/components/ticket/order-actions'
import { formatDateTime } from '@/lib/format'
import type { TicketStatus } from '@/types/database'

export const metadata:Metadata={title:'Tu entrada privada',robots:{index:false,follow:false}}
export const dynamic='force-dynamic'
type Entry={attendee_name:string;status:TicketStatus|'pending';code:string|null;short_code:string|null;used_at:string|null;event_title:string;venue:string;starts_at:string;type_name:string;price:number;design:unknown;description_template:string|null}
export default async function EntryPage({params,searchParams}:{params:Promise<{token:string}>;searchParams:Promise<{nuevo?:string}>}){
  const {token}=await params
  if(!privateTokenSchema.safeParse(token).success) notFound()
  const db=await createClient(),{data,error}=await db.rpc('get_entry',{p_token:token})
  if(error) throw new Error('No se pudo consultar la entrada. Inténtalo de nuevo.')
  if(!data) notFound()
  const entry=data as unknown as Entry,{nuevo}=await searchParams
  return <div className="mx-auto max-w-2xl space-y-6 px-4 py-10">
    {nuevo&&<div role="status" className="rounded-xl border bg-success/10 p-4">Inscripción recibida. Guarda este enlace privado para consultar tu estado; no se envía automáticamente por correo.</div>}
    <h1 className="text-2xl font-bold">{statusLabels[entry.status]}</h1>
    <p className="text-muted-foreground">{entry.status==='pending'?'La organización debe confirmar tu solicitud. Todavía no tienes una entrada válida.':'El acceso se confirmará por el personal autorizado. Conserva este enlace en privado.'}</p>
    <OrderActions/>
    {entry.code&&entry.status!=='pending'?<><TemplatedTicket design={entry.design} descriptionTemplate={entry.description_template??''} data={{eventTitle:entry.event_title,startsAt:entry.starts_at,venue:entry.venue,typeName:entry.type_name,typeDescription:'',price:Number(entry.price),attendeeName:entry.attendee_name,code:entry.code,shortCode:entry.short_code??undefined,status:entry.status}}/>
      {entry.used_at&&<p>Acceso registrado: {formatDateTime(entry.used_at)}</p>}</>:
      <article className="space-y-4 rounded-2xl border bg-card p-8"><h2 className="text-xl font-bold">{entry.event_title}</h2><p>{entry.venue} · {formatDateTime(entry.starts_at)}</p><p>{entry.attendee_name} · {entry.type_name}</p><strong>{statusLabels[entry.status]}</strong></article>}
  </div>
}
