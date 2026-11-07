import Link from 'next/link'
import { BrandLogo } from '@/components/brand-logo'

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="no-print sticky top-0 z-30 border-b bg-[#0e0e13]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-20 max-w-[1440px] items-center justify-between gap-5 px-5 md:px-12">
          <Link href="/" className="shrink-0">
            <BrandLogo />
          </Link>
          {/* Sin enlace visible al panel: los organizadores entran escribiendo /admin */}
          <nav aria-label="Navegación principal" className="flex items-center gap-2 rounded-full bg-card p-1.5 text-xs font-semibold"><Link href="/" className="rounded-full bg-secondary px-4 py-2 text-primary hover:text-foreground">Descubrir</Link><Link href="/#eventos" className="rounded-full px-4 py-2 text-muted-foreground hover:bg-secondary hover:text-foreground">Eventos</Link></nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="no-print border-t bg-[#0e0e13] text-muted-foreground">
        <div className="mx-auto grid max-w-[1440px] gap-8 px-5 py-12 text-sm sm:grid-cols-[2fr_1fr_1fr] md:px-12">
          <div><Link href="/" className="text-lg font-extrabold text-foreground">FastPass<span className="text-accent"> •</span></Link><p className="mt-3 max-w-sm text-xs leading-relaxed">Tu próxima experiencia empieza aquí. Descubre eventos y consigue tus entradas y reservas en pocos pasos.</p></div>
          <div><p className="mb-3 text-xs font-bold uppercase text-foreground">Explora</p><Link href="/#eventos" className="text-xs hover:text-primary">Próximos eventos</Link></div>
          <div><p className="mb-3 text-xs font-bold uppercase text-foreground">Información</p><Link href="/privacidad" className="text-xs hover:text-primary">Política de privacidad</Link></div>
        </div>
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 border-t px-5 py-6 text-xs md:px-12">
          <span>© {new Date().getFullYear()} FastPass · reservas y entradas para eventos</span>
          <Link className="hover:text-foreground underline-offset-4 hover:underline" href="/privacidad">Privacidad</Link>
        </div>
      </footer>
    </>
  )
}
