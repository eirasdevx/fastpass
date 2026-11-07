'use client'

import { Button } from '@/components/ui/button'

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-bold">Algo ha fallado</h1>
      <p className="text-muted-foreground text-sm">
        {error.digest ? `Referencia: ${error.digest}` : 'Inténtalo de nuevo en unos segundos.'}
      </p>
      <Button onClick={reset}>Reintentar</Button>
    </main>
  )
}
