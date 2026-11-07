'use server'
import { createClient } from '@/lib/supabase/server'
import { getAdmin } from '@/lib/auth'
import { DEMO_MODE } from '@/lib/demo/mode'
import { registrationSchema, type RegistrationInput } from '@/lib/validations/registration'
import { publicError } from '@/lib/security/errors'
import { revalidatePath } from 'next/cache'

export async function registerAttendee(input: RegistrationInput, manual = false): Promise<{ error?: string; token?: string; status?: string }> {
  if (DEMO_MODE) return {error:'El registro requiere Supabase. Configura la base de datos para utilizar esta función.'}
  if (manual && !(await getAdmin())) return {error:'No autorizado.'}
  const parsed=registrationSchema.safeParse(input)
  if(!parsed.success) return {error:parsed.error.issues[0]?.message ?? 'Datos no válidos'}
  const v=parsed.data
  if (!manual && (!v.consent || v.approve || v.notes)) return {error:'Acepta la política de privacidad.'}
  const db=await createClient()
  const {data,error}=await db.rpc('register_attendee',{p_event:v.event,p_type:v.type,p_first:v.first,p_last:v.last,p_email:v.email,p_phone:v.phone,p_consent:v.consent,p_manual:manual,p_approve:manual && v.approve,p_notes:manual?v.notes:''})
  if(error) return {error:publicError(error)}
  const result=data as {error?:string;token?:string;status?:string}
  if(result.error) return {error:publicError({message:result.error})}
  revalidatePath('/admin/asistentes')
  revalidatePath('/admin')
  return result
}
