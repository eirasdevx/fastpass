'use client'
import { useEffect,useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
export function RefreshHistory(){
  const router=useRouter(),[pending,start]=useTransition()
  // `pending` fuera de las dependencias: si no, el intervalo se reinicia en cada actualización.
  useEffect(()=>{
    const tick=()=>{if(document.visibilityState==='visible')start(()=>router.refresh())}
    const timer=setInterval(tick,15000);document.addEventListener('visibilitychange',tick)
    return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',tick)}
  },[router])
  return <Button type="button" variant="outline" disabled={pending} title="Se actualiza solo cada 15 segundos" onClick={()=>start(()=>router.refresh())}><RefreshCw className={pending?'animate-spin':''} aria-hidden/>{pending?'Actualizando…':'Actualizar'}</Button>
}
