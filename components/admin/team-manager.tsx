'use client'
import { useState,useTransition } from 'react'
import { Check, Copy, Trash2, UserPlus } from 'lucide-react'
import { createInvitation,deleteAccount,revokeInvitation } from '@/app/admin/configuracion/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/field'
import { NativeSelect } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { formatDateTime } from '@/lib/format'

export type TeamMember={user_id:string;email:string;name:string|null;organization_id:string;organization:string;role:'organizer'|'controller';is_self:boolean;events:string[];owned_events:string[]}
export type PendingInvitation={id:string;email:string;role:'organizer'|'controller';organization:string;event_title:string|null;expires_at:string}
type Option={id:string;name:string}
type EventOption={id:string;title:string;organization_id:string|null}
const roleLabels={organizer:'Administrador',controller:'Control de acceso'}

export function InviteForm({organizations,events,superadmin}:{organizations:Option[];events:EventOption[];superadmin:boolean}){
  const [pending,start]=useTransition(),[role,setRole]=useState<'organizer'|'controller'>('controller'),[org,setOrg]=useState(organizations[0]?.id??'')
  const [result,setResult]=useState<{error?:string;link?:string;expires_at?:string}>({}),[copied,setCopied]=useState(false)
  const orgEvents=superadmin?events.filter(e=>e.organization_id===org):events
  return <div className="space-y-4">
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);setCopied(false);start(async()=>{try{setResult(await createInvitation({email:String(f.get('email')),role,organization:superadmin?org:'',event:String(f.get('event')??'')}))}catch{setResult({error:'No se pudo crear la invitación. Comprueba la conexión.'})}})}}>
      <Field label="Correo de la persona" htmlFor="invite-email"><Input id="invite-email" name="email" type="email" required maxLength={254} placeholder="nombre@ejemplo.com"/></Field>
      <Field label="Qué podrá hacer" htmlFor="invite-role"><NativeSelect id="invite-role" name="role" value={role} onChange={e=>setRole(e.target.value==='organizer'?'organizer':'controller')}><option value="controller">Control de acceso (solo la puerta)</option><option value="organizer">Administrador (gestiona todo)</option></NativeSelect></Field>
      {superadmin&&<Field label="Equipo" htmlFor="invite-org"><NativeSelect id="invite-org" name="organization" value={org} onChange={e=>setOrg(e.target.value)}>{organizations.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</NativeSelect></Field>}
      {role==='controller'&&<Field label="Evento en el que trabajará" htmlFor="invite-event"><NativeSelect id="invite-event" name="event"><option value="">Ninguno por ahora</option>{orgEvents.map(ev=><option key={ev.id} value={ev.id}>{ev.title}</option>)}</NativeSelect></Field>}
      <div className="sm:col-span-2"><Button disabled={pending||(superadmin&&!org)}><UserPlus className="size-4" aria-hidden/>{pending?'Creando invitación…':'Crear invitación'}</Button></div>
    </form>
    {result.error&&<p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{result.error}</p>}
    {result.link&&<div role="status" className="space-y-2 rounded-lg border bg-secondary/40 p-4 text-sm">
      <p className="font-medium">Invitación creada. Envíale este enlace (WhatsApp, correo…):</p>
      <div className="flex gap-2"><Input readOnly value={result.link} onFocus={e=>e.currentTarget.select()} className="font-mono text-xs"/><Button type="button" variant="outline" onClick={async()=>{try{await navigator.clipboard.writeText(result.link!);setCopied(true)}catch{setCopied(false)}}}>{copied?<Check className="size-4" aria-hidden/>:<Copy className="size-4" aria-hidden/>}{copied?'Copiado':'Copiar'}</Button></div>
      <p className="text-muted-foreground">Es personal: solo sirve para ese correo y caduca el {result.expires_at?formatDateTime(result.expires_at):'en 7 días'}. Si lo pierdes, crea otra invitación y la anterior dejará de valer.</p>
    </div>}
  </div>
}

export function PendingInvitations({invitations}:{invitations:PendingInvitation[]}){
  const [pending,start]=useTransition(),[message,setMessage]=useState('')
  if(!invitations.length)return null
  return <div className="space-y-2"><h3 className="font-medium">Invitaciones pendientes</h3>
    <ul className="divide-y rounded-lg border">{invitations.map(i=><li key={i.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
      <div><p className="font-medium">{i.email}</p><p className="text-muted-foreground">{roleLabels[i.role]}{i.event_title?` · ${i.event_title}`:''} · {i.organization} · caduca el {formatDateTime(i.expires_at)}</p></div>
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={()=>{if(!confirm(`¿Anular la invitación de ${i.email}? El enlace dejará de funcionar.`))return;start(async()=>{const r=await revokeInvitation(i.id);setMessage(r.error??'')})}}>Anular</Button>
    </li>)}</ul>{message&&<p role="alert" className="text-sm text-destructive">{message}</p>}
  </div>
}

export function TeamTable({members,superadmin}:{members:TeamMember[];superadmin:boolean}){
  const [pending,start]=useTransition(),[confirming,setConfirming]=useState(''),[message,setMessage]=useState('')
  if(!members.length)return <p className="text-sm text-muted-foreground">Todavía no hay nadie en el equipo.</p>
  return <div className="space-y-2">
    <ul className="divide-y rounded-lg border">{members.map(m=><li key={m.user_id} className="space-y-3 p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0"><p className="font-medium">{m.name??m.email}{m.is_self&&<span className="text-muted-foreground"> (tú)</span>}</p><p className="truncate text-muted-foreground">{m.name?m.email:''}{superadmin?`${m.name?' · ':''}${m.organization}`:''}</p>{m.role==='controller'&&m.events.length>0&&<p className="text-muted-foreground">Eventos: {m.events.join(', ')}</p>}</div>
        <div className="flex items-center gap-2"><Badge variant={m.role==='organizer'?'default':'secondary'}>{roleLabels[m.role]}</Badge>
          {!m.is_self&&<Button type="button" variant="outline" size="sm" className="text-destructive" disabled={pending} onClick={()=>{setMessage('');setConfirming(confirming===m.user_id?'':m.user_id)}}><Trash2 className="size-4" aria-hidden/>Eliminar cuenta</Button>}</div>
      </div>
      {confirming===m.user_id&&<div role="alert" className="space-y-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4">
        <p className="font-medium text-destructive">¿Eliminar la cuenta de {m.email}? No se puede deshacer.</p>
        {m.owned_events.length>0?<div><p>Es la única persona administradora de su equipo, así que <strong>también se eliminarán sus {m.owned_events.length} eventos</strong> con todas sus entradas, reservas e historial:</p><ul className="mt-1 list-disc pl-5">{m.owned_events.map(t=><li key={t}>{t}</li>)}</ul></div>:<p>No se elimina ningún evento: solo pierde el acceso al panel.</p>}
        <div className="flex flex-wrap gap-2"><Button type="button" variant="destructive" disabled={pending} onClick={()=>start(async()=>{try{const r=await deleteAccount(m.user_id);setConfirming('');setMessage(r.error??`Cuenta eliminada${r.deleted_events?` junto con ${r.deleted_events} evento(s)`:''}.`)}catch{setMessage('No se pudo confirmar el borrado. Comprueba la conexión.')}})}>{pending?'Eliminando…':'Sí, eliminar definitivamente'}</Button><Button type="button" variant="outline" disabled={pending} onClick={()=>setConfirming('')}>Cancelar</Button></div>
      </div>}
    </li>)}</ul>
    {message&&<p role="status" className="text-sm">{message}</p>}
  </div>
}
