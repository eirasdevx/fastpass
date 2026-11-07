'use server'
import { getAdmin } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { publicError } from '@/lib/security/errors'
import { siteUrl } from '@/lib/site-url'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { removeCovers } from '@/lib/covers'
const schema=z.object({user:z.uuid(),organization:z.uuid(),role:z.enum(['organizer','controller']),event:z.union([z.literal(''),z.uuid()]),remove:z.boolean()})
export async function assignStaff(input:z.infer<typeof schema>){
  const admin=await getAdmin()
  if(admin?.role!=='admin')return {error:'Solo un superadministrador puede autorizar personal.'}
  const parsed=schema.safeParse(input)
  if(!parsed.success)return {error:'Revisa los identificadores y el rol.'}
  const v=parsed.data,db=await createClient(),{error}=await db.rpc('assign_staff',{p_user:v.user,p_org:v.organization,p_role:v.role,...(v.event?{p_event:v.event}:{}),p_remove:v.remove})
  if(error)return {error:publicError(error)}
  revalidatePath('/admin/configuracion');return {success:true}
}

const invitationSchema=z.object({email:z.email().max(254),role:z.enum(['organizer','controller']),organization:z.union([z.literal(''),z.uuid()]),event:z.union([z.literal(''),z.uuid()])})
export async function createInvitation(input:z.infer<typeof invitationSchema>):Promise<{error?:string;link?:string;expires_at?:string}>{
  if(!(await getAdmin()))return {error:'No autorizado.'}
  const parsed=invitationSchema.safeParse(input)
  if(!parsed.success)return {error:'Revisa el correo electrónico.'}
  const v=parsed.data,db=await createClient()
  const {data,error}=await db.rpc('create_invitation',{p_email:v.email,p_role:v.role,...(v.organization?{p_org:v.organization}:{}),...(v.role==='controller'&&v.event?{p_event:v.event}:{})})
  if(error||!data)return {error:publicError(error??{})}
  const result=data as {token:string;expires_at:string}
  revalidatePath('/admin/configuracion')
  return {link:`${await siteUrl()}/invitacion/${result.token}`,expires_at:result.expires_at}
}

export async function revokeInvitation(id:string){
  if(!(await getAdmin()))return {error:'No autorizado.'}
  if(!z.uuid().safeParse(id).success)return {error:'Datos no válidos.'}
  const db=await createClient(),{error}=await db.rpc('revoke_invitation',{p_invitation:id})
  if(error)return {error:publicError(error)}
  revalidatePath('/admin/configuracion');return {success:true}
}

export async function deleteAccount(user:string):Promise<{error?:string;deleted_events?:number}>{
  if(!(await getAdmin()))return {error:'No autorizado.'}
  if(!z.uuid().safeParse(user).success)return {error:'Datos no válidos.'}
  const db=await createClient(),{data,error}=await db.rpc('delete_account',{p_user:user})
  if(error)return {error:publicError(error)}
  const result=data as {deleted_events:number;covers?:string[]}
  await removeCovers(db,result.covers??[])
  // Puede haber borrado eventos: se refresca todo el panel y las páginas públicas.
  revalidatePath('/','layout')
  return {deleted_events:result.deleted_events}
}
