import Link from 'next/link'
import { DEMO_ORDER_TOKEN } from '@/lib/demo/mode'

/** Aviso fijo de la versión beta: datos de ejemplo, sin base de datos. */
export function DemoBanner() {
  return (
    <div role="note" className="no-print bg-primary text-primary-foreground px-4 py-2 text-center text-xs sm:text-sm">
      <span className="bg-accent text-accent-foreground mr-2 rounded px-1.5 py-0.5 text-[0.7rem] font-bold tracking-wide uppercase">
        Beta
      </span>
      Estás viendo datos de ejemplo. Los cambios se borran al reiniciar el servidor.{' '}
      <Link href={`/entradas/${DEMO_ORDER_TOKEN}`} className="font-medium whitespace-nowrap underline underline-offset-2">
        Ver entradas de ejemplo
      </Link>{' '}
      ·{' '}
      <Link href="/admin" className="font-medium whitespace-nowrap underline underline-offset-2">
        Panel de organizador
      </Link>
    </div>
  )
}
