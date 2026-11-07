'use client'

import '@/lib/security/qr-decoder'
import { useId, useState } from 'react'
import { Scanner } from '@yudiel/react-qr-scanner'
import { Camera, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/** Leer un QR con la cámara o escribir el código corto. Se usa en las dos pantallas de Accesos. */
export function CodeEntry({ what, pending, startWithCamera, onCode, onCameraChange }: {
  /** «la entrada» o «el justificante». */
  what: string
  pending: boolean
  startWithCamera: boolean
  onCode: (value: string) => void
  onCameraChange: (on: boolean) => void
}) {
  const id = useId()
  const [code, setCode] = useState(''), [camera, setCamera] = useState(startWithCamera), [cameraError, setCameraError] = useState('')
  const toggle = (on: boolean) => { setCamera(on); onCameraChange(on); setCameraError('') }

  return (
    <div className="bg-card space-y-4 rounded-2xl border p-5">
      {camera ? (
        <div className="space-y-3">
          <div className="overflow-hidden rounded-xl border">
            <Scanner formats={['qr_code']} constraints={{ facingMode: 'environment' }} paused={pending} sound={false}
              onScan={(values) => { const value = values[0]?.rawValue; if (value && !pending) onCode(value) }}
              onError={() => { toggle(false); setCameraError('No se pudo abrir la cámara. Revisa los permisos del navegador o escribe el código.') }} />
          </div>
          <p className="text-muted-foreground text-center text-sm">Apunta al QR de {what}.</p>
          <Button variant="outline" className="h-12 w-full" onClick={() => toggle(false)}>Escribir el código a mano</Button>
        </div>
      ) : (
        <>
          <Button className="h-14 w-full text-lg" disabled={pending} onClick={() => toggle(true)}><Camera /> Escanear QR</Button>
          {cameraError && <p role="alert" className="text-destructive text-sm">{cameraError}</p>}
          <div className="text-muted-foreground flex items-center gap-3 text-xs uppercase"><span className="h-px flex-1 bg-current opacity-30" />o escribe el código<span className="h-px flex-1 bg-current opacity-30" /></div>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (code.trim()) onCode(code) }}>
            <label htmlFor={id} className="sr-only">Código de 4 caracteres</label>
            <Input id={id} value={code} disabled={pending} onChange={(e) => setCode(e.target.value)} maxLength={300}
              placeholder="Ej.: K7P2" autoComplete="off" autoCapitalize="characters" spellCheck={false}
              className="h-14 flex-1 text-center font-mono text-2xl font-bold tracking-[0.3em] uppercase placeholder:font-sans placeholder:text-base placeholder:font-normal placeholder:tracking-normal placeholder:normal-case" />
            <Button type="submit" className="h-14 px-5" disabled={pending || !code.trim()} aria-label="Buscar"><Search />{pending ? '…' : 'Buscar'}</Button>
          </form>
        </>
      )}
    </div>
  )
}
