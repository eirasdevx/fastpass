'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Ban, CircleCheck, ClipboardList, Clock, DoorOpen, Hourglass, Inbox, PackageCheck, RefreshCw, Ticket, Users, Wallet, XCircle } from 'lucide-react'
import type { Dashboard } from '@/lib/registrations'
import { itemName } from '@/lib/reservations'
import { Button } from '@/components/ui/button'
import { StatCard, StatGrid } from '@/components/admin/page-kit'
import { cn } from '@/lib/utils'
const money=(v:number)=>new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR'}).format(Number(v)||0)
export function LiveDashboard({event,initial}:{event:string;initial:Dashboard}){
  const [data,setData]=useState(initial),[error,setError]=useState(''),[updated,setUpdated]=useState(''),[loading,setLoading]=useState(false)
  const busy=useRef(false)
  const refresh=useCallback(async(signal?:AbortSignal)=>{
    if(busy.current)return
    busy.current=true;setLoading(true)
    try{
      const response=await fetch(`/admin/estadisticas?evento=${event}&t=${Date.now()}`,{cache:'no-store',signal})
      if(!response.ok)throw new Error('request')
      setData(await response.json());setError('');setUpdated(new Date().toLocaleTimeString('es-ES'))
    }catch{if(!signal?.aborted)setError('Sin actualización. Se muestran los últimos datos confirmados. Comprueba la conexión o inicia sesión de nuevo.')}
    finally{busy.current=false;setLoading(false)}
  },[event])
  useEffect(()=>{
    const controller=new AbortController()
    const tick=()=>{if(document.visibilityState==='visible')refresh(controller.signal)}
    const timer=setInterval(tick,10000)
    // Al volver a la pestaña se actualiza al momento, sin esperar al siguiente ciclo.
    document.addEventListener('visibilitychange',tick)
    return()=>{controller.abort();clearInterval(timer);document.removeEventListener('visibilitychange',tick)}
  },[refresh])
  const r=data.reservations,pickup=data.mode==='pickup'&&!!r,name=itemName(data.item_name),item=name[0].toUpperCase()+name.slice(1)
  const committed=r?.committed??data.valid+data.used+data.pending
  // Con entradas, ocupación = quien ya ha entrado; con reservas, lo reservado o entregado.
  const occupied=pickup?committed:data.used
  const percent=data.capacity?Math.min(100,Math.round(occupied/data.capacity*100)):null
  const free=data.capacity===null?'Sin límite':Math.max(0,data.capacity-committed)
  const reservations=r&&<StatGrid>
    <StatCard icon={Clock} tone="warning" label={`${item} por recoger`} value={r.reserved_pending} hint={`${r.reservations_active} reservas activas`}/>
    <StatCard icon={PackageCheck} tone="success" label={`${item} entregados`} value={r.delivered} hint={`${r.reservations_completed} reservas completas`}/>
    <StatCard icon={Wallet} tone="accent" label="Cobrado" value={money(r.amount_collected)} hint="En las recogidas"/>
    <StatCard icon={Users} tone="primary" label="Plazas libres" value={free} hint={data.capacity?`De un aforo de ${data.capacity}`:undefined}/>
  </StatGrid>
  return <div className="space-y-4">
    {pickup?reservations:<>
      <StatGrid>
        <StatCard icon={Ticket} tone="primary" label="Entradas emitidas" value={data.issued}/>
        <StatCard icon={DoorOpen} tone="success" label="Han entrado" value={data.used}/>
        <StatCard icon={Hourglass} tone="warning" label="Pendientes de acceso" value={data.valid}/>
        <StatCard icon={Users} tone="accent" label="Plazas libres" value={free} hint={data.capacity?`De un aforo de ${data.capacity}`:undefined}/>
      </StatGrid>
      {(data.pending>0||data.cancelled>0)&&<StatGrid>
        <StatCard icon={Inbox} label="Solicitudes pendientes" value={data.pending}/>
        <StatCard icon={Ban} tone="danger" label="Anuladas" value={data.cancelled}/>
      </StatGrid>}
      {r&&<><h2 className="flex items-center gap-2 pt-2 font-semibold"><ClipboardList className="size-4" aria-hidden/>Reservas con recogida</h2>{reservations}</>}
    </>}
    {!pickup && <section className="rounded-2xl border bg-card p-6" aria-label="Distribución de entradas">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold">Actividad del evento</h2><p className="mt-1 text-xs text-muted-foreground">Estado actual de las entradas y los accesos</p></div><span className="flex items-center gap-2 rounded-full bg-success/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-success"><span className="size-1.5 rounded-full bg-success" />En directo</span></div>
      <div className="space-y-5">{[
        { label: 'Accesos confirmados', value: data.used, color: 'bg-success' },
        { label: 'Pendientes de acceso', value: data.valid, color: 'bg-primary' },
        { label: 'Solicitudes pendientes', value: data.pending, color: 'bg-accent' },
        { label: 'Entradas anuladas', value: data.cancelled, color: 'bg-destructive' },
      ].map(row => <div key={row.label}><div className="mb-2 flex justify-between text-xs"><span className="text-muted-foreground">{row.label}</span><strong className="tabular-nums">{row.value}</strong></div><div className="h-2.5 overflow-hidden rounded-full bg-secondary"><div className={`h-full rounded-full ${row.color}`} style={{ width: `${Math.min(100, row.value / Math.max(1, data.used + data.valid + data.pending + data.cancelled) * 100)}%` }} /></div></div>)}</div>
    </section>}
    {percent!==null&&<section aria-label="Aforo" className="bg-card space-y-3 rounded-2xl border p-6 shadow-xs">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{pickup?'Aforo comprometido':'Ocupación'}</span>
        <span className="text-muted-foreground tabular-nums"><strong className="text-foreground">{occupied}</strong> de {data.capacity} · {percent}%</span>
      </div>
      <div className="bg-secondary h-2.5 overflow-hidden rounded-full" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
        <div className={cn('h-full rounded-full transition-all duration-500',percent>=90?'bg-destructive':percent>=70?'bg-warning':'bg-success')} style={{width:`${percent}%`}}/>
      </div>
      {pickup&&r&&<p className="text-muted-foreground text-xs">{r.reservations_completed} completas · {r.reservations_cancelled} canceladas · {r.reservations_expired} caducadas</p>}
    </section>}
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p role="status" className={cn('flex items-center gap-2 text-xs',error?'text-destructive':'text-muted-foreground')}>
        {error?<XCircle className="size-4" aria-hidden/>:<CircleCheck className="text-success size-4" aria-hidden/>}
        {error||`En directo · se actualiza cada 10 segundos${updated?` · última: ${updated}`:''}`}
      </p>
      <Button type="button" variant="outline" size="sm" disabled={loading} onClick={()=>refresh()}><RefreshCw className={loading?'animate-spin':''} aria-hidden/>Actualizar ahora</Button>
    </div>
  </div>
}
