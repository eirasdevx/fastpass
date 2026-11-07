'use client'
import { useState,useTransition } from 'react'
import { Trash2 } from 'lucide-react'
import { deleteOwnAccount } from '@/app/admin/cuenta/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/field'

export function DeleteOwnAccount({email,ownedEvents,lastSuperadmin}:{email:string;ownedEvents:string[];lastSuperadmin:boolean}){
  const [pending,start]=useTransition(),[open,setOpen]=useState(false),[typed,setTyped]=useState(''),[error,setError]=useState('')
  const matches=typed.trim().toLowerCase()===email.toLowerCase()
  return <section className="space-y-4 rounded-2xl border border-destructive/30 p-5 sm:p-6">
    <div><h2 className="text-lg font-semibold text-destructive">Eliminar mi cuenta</h2>
      <p className="text-muted-foreground mt-0.5 text-sm">Se borra tu acceso y tus datos de cuenta. No se puede deshacer.</p></div>
    {lastSuperadmin?<p className="text-sm">Eres el único superadministrador de la plataforma: antes de eliminar tu cuenta, da ese rol a otra persona.</p>
    :!open?<Button type="button" variant="outline" className="text-destructive" onClick={()=>setOpen(true)}><Trash2 className="size-4" aria-hidden/>Eliminar mi cuenta</Button>
    :<form className="space-y-4 text-sm" onSubmit={e=>{e.preventDefault();setError('');start(async()=>{try{const r=await deleteOwnAccount(typed);if(r?.error)setError(r.error)}catch{setError('No se pudo confirmar el borrado. Comprueba la conexión.')}})}}>
      {ownedEvents.length>0?<div><p>Eres la única persona administradora de tu equipo, así que <strong>también se eliminarán tus {ownedEvents.length} eventos</strong> con todas sus entradas, reservas e historial:</p><ul className="mt-1 list-disc pl-5">{ownedEvents.map(t=><li key={t}>{t}</li>)}</ul></div>
        :<p>No se elimina ningún evento: solo pierdes el acceso al panel.</p>}
      <Field label={`Para confirmar, escribe tu correo: ${email}`} htmlFor="confirm-email"><Input id="confirm-email" type="email" autoComplete="off" value={typed} onChange={e=>setTyped(e.target.value)}/></Field>
      {error&&<p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-2"><Button type="submit" variant="destructive" disabled={pending||!matches}>{pending?'Eliminando…':'Sí, eliminar definitivamente'}</Button><Button type="button" variant="outline" disabled={pending} onClick={()=>{setOpen(false);setTyped('');setError('')}}>Cancelar</Button></div>
    </form>}
  </section>
}
