import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-accent font-mono text-sm">404</p>
      <h1 className="text-2xl font-bold">No encontramos esta página</h1>
      <p className="text-muted-foreground">Puede que el enlace esté mal copiado o que el evento ya no exista.</p>
      <Button asChild variant="outline">
        <Link href="/">Ver eventos</Link>
      </Button>
    </main>
  )
}
