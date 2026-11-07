'use client'
import { useState,useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RegistrationForm } from '@/components/registration-form'
import { manageRegistration,ticketLink,redactRegistration } from '@/app/admin/asistentes/actions'
import { setTicketStatus } from '@/app/admin/eventos/actions'
import type { RegistrationRow } from '@/lib/registrations'

export function AddAttendee({event,types,phoneRequired,lastRequired}:{event:string;types:{id:string;name:string}[];phoneRequired?:boolean;lastRequired?:boolean}){
  const [open,setOpen]=useState(false)
  return <section>{!open&&<Button onClick={()=>setOpen(true)}><Plus/> Añadir asistente</Button>}{open&&<div className="bg-card max-w-2xl rounded-2xl border p-5 shadow-sm sm:p-6"><div className="mb-5 flex items-start justify-between gap-3"><h2 className="text-lg font-semibold">Nuevo asistente</h2><Button type="button" variant="ghost" size="icon" aria-label="Cerrar" onClick={()=>setOpen(false)}><X/></Button></div><RegistrationForm eventId={event} types={types} manual phoneRequired={phoneRequired} lastRequired={lastRequired} onDone={()=>setOpen(false)}/></div>}</section>
}
export function AttendeeControls({row,event,phoneRequired,lastRequired}:{row:RegistrationRow;event:string;phoneRequired?:boolean;lastRequired?:boolean}){
  const [pending,start]=useTransition(),[message,setMessage]=useState(''),[link,setLink]=useState(''),[edit,setEdit]=useState(false)
  const router=useRouter()
  function run(op:string){
    if(op==='redact'&&!confirm('¿Suprimir los datos personales de esta inscripción? Se anulará su entrada y se revocarán sus enlaces. Esta acción no se puede deshacer. Confirma que has verificado la solicitud y las obligaciones de conservación.'))return
    if(['cancel','rotate','revoke'].includes(op)&&!confirm(op==='cancel'?'¿Anular la inscripción y su entrada?':op==='rotate'?'¿Crear un nuevo enlace? El enlace individual anterior dejará de funcionar.':'¿Revocar el enlace individual?'))return
    start(async()=>{try{
      setMessage('')
      const result=op==='redact'&&row.registration_id?await redactRegistration(row.registration_id):row.registration_id?await manageRegistration(row.registration_id,op):op==='cancel'?await setTicketStatus(event,row.ticket_id!,'cancelled'):await ticketLink(row.ticket_id!,op==='revoke')
      if(result.error){setMessage(result.error);return}
      if('token'in result&&result.token)setLink(`${location.origin}/entrada/${result.token}`)
      else setMessage('Cambios guardados.')
      router.refresh()
    }catch{setMessage('No se pudo confirmar la operación. Comprueba la conexión y actualiza el listado.')}})
  }
  return <div className="space-y-3"><div className="flex flex-wrap gap-2">
    {row.status==='pending'&&<Button size="sm" disabled={pending} onClick={()=>run('approve')}>Aprobar</Button>}
    {row.registration_id&&<Button size="sm" variant="outline" onClick={()=>setEdit(!edit)}>Editar</Button>}
    {row.status!=='cancelled'&&<Button size="sm" variant="outline" disabled={pending} onClick={()=>run('cancel')}>Anular</Button>}
    <Button size="sm" variant="outline" disabled={pending} onClick={()=>run('rotate')}>Generar enlace</Button>
    <Button size="sm" variant="ghost" disabled={pending} onClick={()=>run('revoke')}>Revocar enlace</Button>
    {row.registration_id&&<Button size="sm" variant="ghost" disabled={pending} onClick={()=>run('redact')}>Suprimir datos</Button>}
  </div>{message&&<p role="status" className="text-sm">{message}</p>}
    {link&&<div className="space-y-2"><Input aria-label="Nuevo enlace privado" value={link} readOnly onFocus={e=>e.target.select()}/><Button size="sm" onClick={()=>navigator.clipboard.writeText(link).then(()=>setMessage('Enlace copiado.')).catch(()=>setMessage('Selecciona y copia el enlace manualmente.'))}>Copiar enlace</Button><p className="text-xs text-muted-foreground">Guárdalo ahora. Solo conservamos su hash.</p></div>}
    {edit&&<RegistrationForm eventId={event} types={[]} manual existing={row} phoneRequired={phoneRequired} lastRequired={lastRequired} onDone={()=>setEdit(false)}/>}
  </div>
}
