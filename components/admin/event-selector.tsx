'use client'
import { usePathname, useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { CalendarDays, Loader2 } from 'lucide-react'
import { NativeSelect } from '@/components/ui/select'
import { Button } from '@/components/ui/button'

/** Cambia de evento al elegirlo, sin botón extra; sin JavaScript sigue funcionando como formulario. */
export function EventSelector({events,selected}:{events:{id:string;title:string}[];selected?:string}){
  const router=useRouter(),pathname=usePathname(),[pending,start]=useTransition()
  return <form className="bg-card flex flex-wrap items-center gap-3 rounded-2xl border p-3 shadow-xs" onSubmit={e=>e.preventDefault()}>
    <label htmlFor="selected-event" className="text-muted-foreground flex items-center gap-2 pl-1 text-sm font-medium">
      {pending?<Loader2 className="size-4 animate-spin" aria-hidden/>:<CalendarDays className="size-4" aria-hidden/>}Evento
    </label>
    <NativeSelect id="selected-event" name="evento" defaultValue={selected} className="min-w-0 flex-1 font-medium"      onChange={e=>{
        // Al cambiar de evento se vuelve a la primera página y sin los filtros del anterior.
        start(()=>router.push(`${pathname}?${new URLSearchParams({evento:e.target.value})}`))
      }}>
      {events.map(ev=><option key={ev.id} value={ev.id}>{ev.title}</option>)}
    </NativeSelect>
    <noscript><Button type="submit" variant="outline">Ver evento</Button></noscript>
  </form>
}
