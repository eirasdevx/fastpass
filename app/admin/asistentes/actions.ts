'use server'
import { getAdmin } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { publicError } from '@/lib/security/errors'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { registrationSchema, type RegistrationInput } from '@/lib/validations/registration'

export async function manageRegistration(id: string, operation: string) {
  if (!(await getAdmin())) return {error:'No autorizado.'}
  if(!z.uuid().safeParse(id).success || !['approve','cancel','rotate','revoke'].includes(operation)) return {error:'Datos no válidos.'}
  const db=await createClient()
  const {data,error}=await db.rpc('manage_registration',{p_registration:id,p_operation:operation})
  if(error) return {error:publicError(error)}
  revalidatePath('/admin/asistentes'); revalidatePath('/admin')
  return data as {success?:boolean;token?:string;error?:string}
}
export async function ticketLink(id: string, revoke = false) {
  if (!(await getAdmin())) return {error:'No autorizado.'}
  if(!z.uuid().safeParse(id).success) return {error:'Datos no válidos.'}
  const db=await createClient()
  const {data,error}=await db.rpc('ticket_link',{p_ticket:id,p_revoke:revoke})
  return error?{error:publicError(error)}:{token:data ?? undefined,success:true}
}
export async function editAttendee(id: string, input: RegistrationInput) {
  if (!(await getAdmin())) return {error:'No autorizado.'}
  const parsed=registrationSchema.safeParse(input)
  if(!z.uuid().safeParse(id).success || !parsed.success) return {error:'Datos no válidos.'}
  const v=parsed.data, db=await createClient()
  const {error}=await db.rpc('edit_attendee',{p_registration:id,p_first:v.first,p_last:v.last,p_email:v.email,p_phone:v.phone,p_notes:v.notes})
  if(error) return {error:publicError(error)}
  revalidatePath('/admin/asistentes'); return {success:true}
}

export async function redactRegistration(id:string){
  if(!(await getAdmin()))return {error:'No autorizado.'}
  if(!z.uuid().safeParse(id).success)return {error:'Datos no válidos.'}
  const db=await createClient(),{error}=await db.rpc('redact_registration',{p_registration:id})
  if(error)return {error:publicError(error)}
  revalidatePath('/admin/asistentes');return {success:true}
}
