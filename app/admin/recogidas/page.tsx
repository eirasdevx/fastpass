import { redirect } from 'next/navigation'
import { z } from 'zod'
import type { SearchParams } from '@/lib/admin-data'

// La recogida forma parte de Accesos; se mantiene la dirección antigua.
export default async function PickupRedirect({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { evento } = await searchParams
  redirect(z.uuid().safeParse(evento).success ? `/admin/accesos?evento=${evento}` : '/admin/accesos')
}
