'use client'
import { useState,useTransition } from 'react'
import { assignStaff } from '@/app/admin/configuracion/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/field'
import { NativeSelect } from '@/components/ui/select'
export function StaffForm({organizations,events}:{organizations:{id:string;name:string}[];events:{id:string;title:string}[]}){
  const [pending,start]=useTransition(),[message,setMessage]=useState('')
  return <form className="grid max-w-xl gap-4" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget),remove=f.get('remove')==='on';if(!confirm(remove?'¿Retirar la autorización del personal indicado?':'¿Autorizar a esta identidad con el rol indicado?'))return;start(async()=>{try{const r=await assignStaff({user:String(f.get('user')),organization:String(f.get('organization')),role:f.get('role')==='organizer'?'organizer':'controller',event:String(f.get('event')??''),remove});setMessage(r.error??'Autorización actualizada.')}catch{setMessage('No se pudo confirmar el cambio. Comprueba la conexión.')}})}}>
    <Field label="Identificador del usuario de Supabase Auth" htmlFor="staff-user"><Input id="staff-user" name="user" required placeholder="UUID de la identidad verificada"/></Field>
    <Field label="Organización" htmlFor="staff-org"><NativeSelect id="staff-org" name="organization" required>{organizations.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</NativeSelect></Field>
    <Field label="Rol" htmlFor="staff-role"><NativeSelect id="staff-role" name="role"><option value="controller">Control de acceso</option><option value="organizer">Administrador de organización</option></NativeSelect></Field>
    <Field label="Evento asignado (personal de puerta)" htmlFor="staff-event"><NativeSelect id="staff-event" name="event"><option value="">Sin asignación específica</option>{events.map(ev=><option key={ev.id} value={ev.id}>{ev.title}</option>)}</NativeSelect></Field>
    <label className="flex gap-3 text-sm"><input type="checkbox" name="remove"/>Retirar autorización (sin evento, retira la membresía de la organización)</label>
    <Button disabled={pending}>{pending?'Guardando…':'Actualizar autorización'}</Button>{message&&<p role="status">{message}</p>}
  </form>
}
