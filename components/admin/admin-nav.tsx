'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarDays, Palette, ScanLine, LayoutDashboard, Users, History, Settings, ClipboardList, UserRound } from 'lucide-react'
import { cn } from '@/lib/utils'

const GROUPS = [
  { title: 'Gestión', links: [
    { href: '/admin', label: 'Panel general', icon: LayoutDashboard, match: (p: string) => p === '/admin' },
    { href: '/admin/eventos', label: 'Eventos', icon: CalendarDays, match: (p: string) => p.startsWith('/admin/eventos') },
    { href: '/admin/reservas', label: 'Reservas', icon: ClipboardList, match: (p: string) => p.startsWith('/admin/reservas') },
    { href: '/admin/asistentes', label: 'Asistentes', icon: Users, match: (p: string) => p.startsWith('/admin/asistentes') || p.startsWith('/admin/entradas') },
    { href: '/admin/plantillas', label: 'Diseñador de tickets', icon: Palette, match: (p: string) => p.startsWith('/admin/plantillas') },
  ] },
  { title: 'Día del evento', links: [
    { href: '/admin/accesos', label: 'Accesos', icon: ScanLine, match: (p: string) => p.startsWith('/admin/accesos') || p.startsWith('/admin/validar') || p.startsWith('/admin/recogidas') },
    { href: '/admin/historial', label: 'Historial', icon: History, match: (p: string) => p.startsWith('/admin/historial') },
  ] },
  { title: 'Cuenta', links: [
    { href: '/admin/configuracion', label: 'Configuración', icon: Settings, match: (p: string) => p.startsWith('/admin/configuracion') },
    { href: '/admin/cuenta', label: 'Mi cuenta', icon: UserRound, match: (p: string) => p.startsWith('/admin/cuenta') },
  ] },
]

export function AdminNav({ controller = false, vertical = false, demo = false }: { controller?: boolean; vertical?: boolean; demo?: boolean }) {
  const pathname = usePathname()
  // El personal de puerta solo ve Accesos y su cuenta.
  const groups = GROUPS.map((g) => ({ ...g, links: g.links.filter((l) => !controller || l.href === '/admin/accesos' || l.href === '/admin/cuenta') })).filter((g) => g.links.length)
  const item = ({ href, label, icon: Icon, match }: (typeof GROUPS)[number]['links'][number]) => {
    const active = match(pathname)
    return (
      <Link
        key={href}
        href={demo && href === '/admin/accesos' ? '/admin/validar' : href}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex shrink-0 items-center gap-2.5 rounded-lg text-sm font-medium transition-colors',
          vertical ? 'px-4 py-3' : 'px-3 py-1.5',
          active ? 'bg-secondary text-primary shadow-xs' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
        )}
      >
        <Icon className="size-4" aria-hidden />
        {label}
      </Link>
    )
  }
  if (!vertical) {
    return (
      <nav aria-label="Administración" className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-2 [scrollbar-width:none]">
        {groups.flatMap((g) => g.links).map(item)}
      </nav>
    )
  }
  return (
    <nav aria-label="Administración" className="space-y-5">
      {groups.map((g) => (
        <div key={g.title} className="space-y-1">
          <p className="text-muted-foreground/80 px-3 text-[11px] font-semibold tracking-wider uppercase">{g.title}</p>
          {g.links.map(item)}
        </div>
      ))}
    </nav>
  )
}
