'use client'
import { useId, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2, ShieldCheck } from 'lucide-react'
import { registerAttendee } from '@/app/registro/actions'
import { editAttendee } from '@/app/admin/asistentes/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/select'
import { Field } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import { FormStep, OptionCard } from '@/components/public/form-step'
import { formatPrice } from '@/lib/format'
import type { RegistrationRow } from '@/lib/registrations'

export function RegistrationForm({eventId,types,manual=false,lastRequired=true,phoneRequired=false,existing,onDone}:{eventId:string;types:{id:string;name:string;price?:number}[];manual?:boolean;lastRequired?:boolean;phoneRequired?:boolean;existing?:RegistrationRow;onDone?:()=>void}) {
  const router=useRouter(), prefix=useId(), errorRef=useRef<HTMLParagraphElement>(null)
  const [pending,start]=useTransition(), [error,setError]=useState(''), [link,setLink]=useState('')
  const [typeId,setTypeId]=useState(types.length===1?types[0].id:'')
  // Versión pública: por pasos y con las entradas como tarjetas. El panel mantiene el formulario compacto.
  const guided=!manual&&!existing
  const fail=(text:string)=>{setError(text);requestAnimationFrame(()=>errorRef.current?.scrollIntoView({behavior:'smooth',block:'center'}))}
  const personal=<>
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Nombre" htmlFor={`${prefix}-first`}><Input id={`${prefix}-first`} name="first" required maxLength={60} autoComplete="given-name" defaultValue={existing?.first_name}/></Field>
      <Field label={`Apellidos${lastRequired?'':' (opcional)'}`} htmlFor={`${prefix}-last`}><Input id={`${prefix}-last`} name="last" required={lastRequired} maxLength={60} autoComplete="family-name" defaultValue={existing?.last_name}/></Field>
    </div>
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Correo electrónico" htmlFor={`${prefix}-email`} hint={guided?'Para identificar tu inscripción.':undefined}><Input id={`${prefix}-email`} name="email" type="email" required maxLength={254} autoComplete="email" inputMode="email" placeholder={guided?'nombre@correo.com':undefined} defaultValue={existing?.email}/></Field>
      <Field label={`Teléfono${phoneRequired?'':' (opcional)'}`} htmlFor={`${prefix}-phone`}><Input id={`${prefix}-phone`} name="phone" type="tel" required={phoneRequired} maxLength={30} autoComplete="tel" inputMode="tel" defaultValue={existing?.phone}/></Field>
    </div>
  </>
  const honeypot=<div className="hidden" aria-hidden="true"><label htmlFor={`${prefix}-website`}>Sitio web</label><input id={`${prefix}-website`} name="website" tabIndex={-1} autoComplete="off"/></div>
  const errorBox=error&&<p ref={errorRef} role="alert" className="border-destructive/30 bg-destructive/10 text-destructive rounded-xl border p-3 text-sm">{error}</p>
  return <form className={guided?'space-y-5':'grid gap-4'} onSubmit={e=>{
    e.preventDefault();const f=new FormData(e.currentTarget);setError('')
    const type=guided?typeId:String(f.get('type')??existing?.type_id??'')
    if(guided&&!type){fail('Elige un tipo de entrada.');return}
    const input={event:eventId,type,first:String(f.get('first')??''),last:String(f.get('last')??''),email:String(f.get('email')??''),phone:String(f.get('phone')??''),consent:f.get('consent')==='on',website:String(f.get('website')??''),notes:String(f.get('notes')??''),approve:f.get('approve')==='on'}
    start(async()=>{try {
      if(existing?.registration_id){const r=await editAttendee(existing.registration_id,input);if(r.error)fail(r.error);else{router.refresh();onDone?.()}return}
      const r=await registerAttendee(input,manual)
      if(r.error){fail(r.error);return}
      if(r.token){if(manual){setLink(`${location.origin}/entrada/${r.token}`);router.refresh()}else router.push(`/entrada/${r.token}?nuevo=1`)}
    }catch{fail('No se pudo confirmar la operación. Comprueba la conexión y el listado antes de repetir el alta.')}})
  }}>
    {guided?<>
      <FormStep step={1} title="Elige tu entrada">
        <div className="grid gap-3" role="radiogroup" aria-label="Tipo de entrada">
          {types.map(t=><OptionCard key={t.id} name="type" value={t.id} checked={typeId===t.id} title={t.name} aside={t.price!==undefined?formatPrice(Number(t.price)):undefined} onChange={()=>setTypeId(t.id)}/>)}
        </div>
      </FormStep>
      <FormStep step={2} title="Tus datos" description="La entrada irá a tu nombre.">{personal}</FormStep>
      {honeypot}
      <div className="bg-card space-y-4 rounded-2xl border p-5 shadow-xs sm:p-6">
        <label className="flex items-start gap-3 text-sm"><input name="consent" type="checkbox" required className="accent-primary mt-0.5 size-4 shrink-0"/><span>He leído y acepto la <Link className="font-medium underline" href={`/privacidad?evento=${eventId}`} target="_blank" rel="noreferrer">política de privacidad del evento</Link>.</span></label>
        {errorBox}
        <Button type="submit" size="lg" className="w-full" disabled={pending||types.length===0}>{pending?<><Loader2 className="animate-spin" aria-hidden/> Enviando…</>:'Enviar inscripción'}</Button>
        <p className="text-muted-foreground flex items-center justify-center gap-1.5 text-xs"><ShieldCheck className="size-3.5" aria-hidden/>Tus datos solo los ve la organización del evento.</p>
      </div>
    </>:<>
      {personal}
      {!existing && <Field label="Tipo de entrada" htmlFor={`${prefix}-type`}><NativeSelect id={`${prefix}-type`} name="type" required><option value="">Selecciona una entrada</option>{types.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</NativeSelect></Field>}
      {honeypot}
      <Field label="Observaciones internas" htmlFor={`${prefix}-notes`}><Textarea id={`${prefix}-notes`} name="notes" maxLength={2000} defaultValue={existing?.notes}/></Field>
      {!existing&&<label className="flex gap-3 text-sm"><input name="approve" type="checkbox"/>Aprobar y emitir entrada al guardar (solo entradas gratuitas)</label>}
      {errorBox}
      {link ? <div role="status" className="space-y-3 rounded-lg border p-4"><p>Asistente guardado. Guarda este enlace privado; solo se muestra al crearlo.</p><Input aria-label="Enlace privado" readOnly value={link} onFocus={e=>e.target.select()}/><Button type="button" onClick={()=>navigator.clipboard.writeText(link).catch(()=>setError('Selecciona y copia el enlace manualmente.'))}>Copiar enlace</Button><Button type="button" variant="outline" onClick={()=>onDone?.()}>Cerrar</Button></div>:
      <Button type="submit" disabled={pending||(!existing&&types.length===0)}>{pending?'Guardando…':existing?'Guardar cambios':'Guardar asistente'}</Button>}
    </>}
  </form>
}
