import { getAdmin } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { eventDashboard } from '@/lib/admin-data'
import { z } from 'zod'
export async function GET(request:Request){
  const admin=await getAdmin()
  if(!admin)return Response.json({error:'No autorizado'},{status:401})
  const id=new URL(request.url).searchParams.get('evento')
  if(id==='todos'){
    if(admin.role!=='admin')return Response.json({error:'No autorizado'},{status:403})
    const db=await createClient(),{data,error}=await db.rpc('global_dashboard')
    return error||!data?Response.json({error:'No disponible'},{status:503}):Response.json(data,{headers:{'Cache-Control':'private, no-store'}})
  }
  if(!z.uuid().safeParse(id).success)return Response.json({error:'Evento no válido'},{status:400})
  const data=await eventDashboard(id!)
  if(!data)return Response.json({error:'No disponible'},{status:403})
  return Response.json(data,{headers:{'Cache-Control':'private, no-store'}})
}
