import Link from 'next/link'
import { LogOut, Plus, Store } from 'lucide-react'
import { BrandLogo } from '@/components/brand-logo'
import { requireStaff } from '@/lib/auth'
import { logout } from '@/app/(public)/login/actions'
import { AdminNav } from '@/components/admin/admin-nav'
import { Button } from '@/components/ui/button'
import { DEMO_MODE } from '@/lib/demo/mode'

const ROLES = { admin: 'Superadministrador', organizer: 'Administrador', controller: 'Control de acceso' }

function Brand() {
  return (
    <Link href="/admin" className="inline-flex shrink-0">
      <BrandLogo />
    </Link>
  )
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff()
  const controller = user.role === 'controller'
  const name = [user.user_metadata?.first_name, user.user_metadata?.last_name].filter(Boolean).join(' ')
  const initial = (name || user.email || '?').trim().charAt(0).toUpperCase()

  return (
    <div className="admin-shell flex flex-1">
      {/* Escritorio: barra lateral fija con la cuenta abajo. */}
      <aside className="bg-[#0e0e13] sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r md:flex">
        <div className="flex h-20 items-center px-5"><Brand /></div>
        <div className="flex-1 overflow-y-auto px-3 py-4"><AdminNav controller={controller} demo={DEMO_MODE} vertical /></div>
        <div className="flex items-center gap-3 border-t p-4">
          <span className="bg-secondary grid size-9 shrink-0 place-items-center rounded-full text-sm font-semibold">{initial}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{name || user.email}</p>
            <p className="text-muted-foreground truncate text-xs">{ROLES[user.role as keyof typeof ROLES] ?? user.role}</p>
          </div>
          <form action={logout}>
            <Button type="submit" variant="ghost" size="icon" aria-label="Cerrar sesión" title="Cerrar sesión"><LogOut /></Button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Móvil: cabecera con el menú desplazable y con texto. */}
        <header className="bg-card/90 sticky top-0 z-30 border-b px-4 pt-3 backdrop-blur md:hidden">
          <div className="flex items-center justify-between pb-3">
            <Brand />
            <form action={logout}>
              <Button type="submit" variant="ghost" size="sm"><LogOut /> Salir</Button>
            </form>
          </div>
          <AdminNav controller={controller} demo={DEMO_MODE} />
        </header>
        <div className="hidden h-20 items-center justify-between gap-4 px-8 md:flex">
          <span className="rounded-xl bg-card px-4 py-2 text-xs font-semibold text-primary">FastPass <span className="ml-2 text-muted-foreground">PRO</span></span>
          <div className="flex items-center gap-5">
            <Link href="/" className="flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-primary"><Store className="size-4" />Ver tienda pública</Link>
            {!controller && <Button asChild className="rounded-full"><Link href="/admin/eventos/nuevo"><Plus />Crear evento</Link></Button>}
          </div>
        </div>
        <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  )
}
