'use client'

import { useState } from 'react'
import { Check, Link2, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function OrderActions() {
  const [copied, setCopied] = useState(false)

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href.split('?')[0])
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Navegador sin permisos de portapapeles: no hacemos nada
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" onClick={() => window.print()}>
        <Printer /> Imprimir / guardar PDF
      </Button>
      <Button type="button" variant="outline" onClick={copyLink}>
        {copied ? <Check /> : <Link2 />} {copied ? 'Enlace copiado' : 'Copiar enlace'}
      </Button>
    </div>
  )
}
