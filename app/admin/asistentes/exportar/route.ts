import { getAdmin,canManageEvent } from '@/lib/auth'
import { attendeePage,reservationPeoplePage } from '@/lib/admin-data'
import { reservationStatusLabels } from '@/lib/reservations'
import { createClient } from '@/lib/supabase/server'
import { csvCell } from '@/lib/csv'
import { z } from 'zod'
export async function GET(request:Request){
  if(!(await getAdmin()))return new Response('No autorizado',{status:401})
  const params=Object.fromEntries(new URL(request.url).searchParams),event=params.evento
  if(!z.uuid().safeParse(event).success)return new Response('Evento no válido',{status:400})
  if(!(await canManageEvent(event)))return new Response('No autorizado',{status:403})
  const db=await createClient(),{data:ev}=await db.from('events').select('registration_mode').eq('id',event).maybeSingle()
  if(ev?.registration_mode==='pickup')return exportPeople(event,params)
  // Fetch the first page before returning download headers so failures are visible.
  const first=await attendeePage(event,{...params,pagina:'1'},500)
  const encoder=new TextEncoder();let index=1,cancelled=false
  const stream=new ReadableStream({async start(controller){try{
    controller.enqueue(encoder.encode('﻿Nombre,Correo,Teléfono,Código,Tipo,Estado,Registro,Acceso\r\n'))
    let page=first
    while(!cancelled){
      for(const r of page.rows)controller.enqueue(encoder.encode([r.name,r.email,r.phone,r.code,r.type_name,r.status,r.created_at,r.used_at].map(csvCell).join(',')+'\r\n'))
      if(index*500>=page.total)break
      page=await attendeePage(event,{...params,pagina:String(++index)},500)
    }
    if(!cancelled)controller.close()
  }catch(error){if(!cancelled)controller.error(error)}},cancel(){cancelled=true}})
  return new Response(stream,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="asistentes.csv"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}})
}

// Evento con reserva y recogida: una fila por persona de cada reserva.
async function exportPeople(event:string,params:Record<string,string>){
  const first=await reservationPeoplePage(event,{...params,pagina:'1'},500)
  const encoder=new TextEncoder();let index=1,cancelled=false
  const stream=new ReadableStream({async start(controller){try{
    controller.enqueue(encoder.encode('﻿Nombre,Documento,Nacimiento,Plazas,Titular,Correo,Teléfono,Reserva,Tipo,Entregados,Reservados,Estado,Alta\r\n'))
    let page=first
    while(!cancelled){
      for(const r of page.rows)controller.enqueue(encoder.encode([r.name,r.document_id??'',r.birth_date??'',r.places,r.position===1?'Sí':'No',r.email,r.phone,r.code,r.type_name,r.delivered_quantity,r.quantity,reservationStatusLabels[r.status],r.created_at].map(csvCell).join(',')+'\r\n'))
      if(index*500>=page.total)break
      page=await reservationPeoplePage(event,{...params,pagina:String(++index)},500)
    }
    if(!cancelled)controller.close()
  }catch(error){if(!cancelled)controller.error(error)}},cancel(){cancelled=true}})
  return new Response(stream,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="asistentes.csv"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}})
}
