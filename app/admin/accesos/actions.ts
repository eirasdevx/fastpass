'use server'
import { getStaff } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { entryCodeSchema } from '@/lib/validations/registration'
import { publicError } from '@/lib/security/errors'
import { z } from 'zod'
export type AccessResult={result:'ready'|'valid'|'already_used'|'cancelled'|'not_found'|'forbidden'|'rate_limited'|'event_closed'|'reservation';code?:string;attendee_name?:string;type_name?:string;used_at?:string|null}
type Db=Awaited<ReturnType<typeof createClient>>
// Un justificante de reserva no es una entrada: si el código o el QR es de una reserva, se avisa para que vaya a Recogidas.
async function reservationHint(db:Db,event:string,credential:string):Promise<AccessResult|null>{
  const {data}=await db.rpc('lookup_reservation',{p_event:event,p_credential:credential})
  const r=(data as {reservation?:{code:string;holder:string;type_name:string}}|null)?.reservation
  return r?{result:'reservation',code:r.code,attendee_name:r.holder,type_name:r.type_name}:null
}
export async function checkEntry(event:string,code:string,confirm=false):Promise<{error?:string;data?:AccessResult}>{
  if(!(await getStaff()))return {error:'Tu sesión ha caducado. Vuelve a iniciar sesión.'}
  if(!z.uuid().safeParse(event).success||typeof confirm!=='boolean')return {error:'Selecciona un evento e introduce un código válido.'}
  const token=typeof code==='string'&&code.length<=300?code.toLowerCase().match(/[a-f0-9]{64}/)?.[0]:undefined
  if(token&&!confirm){
    const db=await createClient(),hint=await reservationHint(db,event,token)
    return {data:hint??{result:'not_found'}}
  }
  const parsed=entryCodeSchema.safeParse(code)
  if(!parsed.success)return {error:'Selecciona un evento e introduce un código válido.'}
  const db=await createClient(),{data,error}=await db.rpc('lookup_entry',{p_event:event,p_code:parsed.data,p_confirm:confirm})
  if(error)return {error:publicError(error)}
  const result=data as unknown as AccessResult
  if(result.result==='not_found'&&!confirm&&parsed.data.length===4)return {data:(await reservationHint(db,event,parsed.data))??result}
  return {data:result}
}
