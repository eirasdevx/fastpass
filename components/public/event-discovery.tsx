'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowRight, CalendarDays, MapPin, Search, ShieldCheck, Ticket, Zap } from 'lucide-react'
import { EventCover } from './event-cover'
import { formatDateTime } from '@/lib/format'

type Event = { id: string; slug: string; title: string; venue: string; starts_at: string; cover_url: string | null }

export function EventDiscovery({ events }: { events: Event[] }) {
  const [query, setQuery] = useState('')
  const [venue, setVenue] = useState('')
  const venues = [...new Set(events.map(e => e.venue).filter(Boolean))]
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const filtered = events.filter(e => normalize(`${e.title} ${e.venue}`).includes(normalize(query)) && (!venue || e.venue === venue))
  const featured = events[0]
  return <div className="discovery">
    <section className="discovery-hero">
      <EventCover url={featured?.cover_url || '/design/festival-hd.jpg'} title={featured?.title || 'Música en directo'} className="absolute inset-0" />
      <div className="hero-shade absolute inset-0" />
      <div className="relative mx-auto grid min-h-[520px] max-w-[1440px] items-end gap-10 px-5 pt-20 pb-24 md:grid-cols-[1fr_300px] md:px-12">
        <div>
          <p className="mb-5 inline-flex items-center gap-2 rounded-full bg-accent/15 px-3 py-1.5 text-xs font-semibold text-accent"><span className="size-1.5 rounded-full bg-accent" /> TU PRÓXIMA EXPERIENCIA EN DIRECTO</p>
          <h1 className="max-w-3xl text-4xl leading-[1.05] font-extrabold tracking-tight uppercase sm:text-6xl">{featured?.title || <>Vive la música.<br /><span className="text-primary">Siente el directo.</span></>}</h1>
          <div className="mt-5 flex flex-wrap gap-4 text-sm">
            {featured ? <><span className="flex items-center gap-2"><CalendarDays className="size-4 text-primary" />{formatDateTime(featured.starts_at)}</span>{featured.venue && <span className="flex items-center gap-2"><MapPin className="size-4 text-accent" />{featured.venue}</span>}</> : <p>Descubre eventos y encuentra tu próxima experiencia.</p>}
          </div>
          <Link className="primary-action mt-7 inline-flex items-center gap-3 rounded-full px-6 py-3 text-sm font-bold" href={featured ? `/eventos/${featured.slug}` : '#eventos'}>{featured ? 'Conseguir entradas' : 'Explorar eventos'}<ArrowRight className="size-4" /></Link>
        </div>
        {events.length > 1 && <aside className="hidden space-y-2 md:block"><p className="mb-3 text-[11px] font-bold tracking-widest uppercase">Próximas experiencias</p>{events.slice(1, 4).map(e => <Link href={`/eventos/${e.slug}`} key={e.id} className="flex items-center gap-3 rounded-xl border border-white/5 bg-card/75 p-3 backdrop-blur transition hover:bg-secondary"><EventCover url={e.cover_url} title={e.title} className="size-14 shrink-0 rounded-lg" /><div className="min-w-0"><p className="truncate text-sm font-bold">{e.title}</p><p className="truncate text-xs text-muted-foreground">{e.venue}</p></div><ArrowRight className="ml-auto size-4 shrink-0 text-primary" /></Link>)}</aside>}
      </div>
    </section>
    <div className="relative mx-auto max-w-[1440px] px-5 md:px-12">
      <form onSubmit={e => { e.preventDefault(); document.getElementById('eventos')?.scrollIntoView({ behavior: 'smooth' }) }} className="-mt-10 grid gap-3 rounded-2xl border bg-secondary p-4 shadow-xl sm:grid-cols-[1fr_1fr_auto]">
        <label className="flex items-center gap-3 rounded-xl bg-background/70 px-4 py-3"><Search className="size-5 shrink-0 text-primary" /><span className="w-full"><span className="block text-[10px] font-semibold tracking-widest uppercase">¿Qué buscas?</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Artista, evento o espectáculo…" className="w-full bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary" /></span></label>
        <label className="flex items-center gap-3 rounded-xl bg-background/70 px-4 py-3"><MapPin className="size-5 shrink-0 text-accent" /><span className="w-full"><span className="block text-[10px] font-semibold tracking-widest uppercase">Dónde</span><select value={venue} onChange={e => setVenue(e.target.value)} className="w-full bg-transparent py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"><option value="">Todos los recintos</option>{venues.map(v => <option key={v}>{v}</option>)}</select></span></label>
        <button className="primary-action flex items-center justify-center gap-2 rounded-xl px-7 py-3 text-sm font-bold">Explorar<Search className="size-4" /></button>
      </form>
      <section id="eventos" className="scroll-mt-24 py-14">
        <p className="mb-2 flex items-center gap-2 text-[10px] font-bold tracking-widest uppercase"><span className="size-1.5 rounded-full bg-accent" /> Encuentra tu próximo plan</p>
        <div className="mb-7 flex flex-wrap items-end justify-between gap-3"><h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Eventos destacados en directo</h2><span className="rounded-full bg-secondary px-4 py-2 text-xs text-muted-foreground">{filtered.length} eventos disponibles</span></div>
        {filtered.length ? <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{filtered.map(e => <li key={e.id}><Link href={`/eventos/${e.slug}`} className="group flex h-full flex-col overflow-hidden rounded-2xl bg-card shadow-lg transition hover:-translate-y-1 hover:ring-1 hover:ring-primary/50 focus-visible:outline-2 focus-visible:outline-primary"><div className="relative overflow-hidden"><EventCover url={e.cover_url} title={e.title} className="aspect-[4/3] transition duration-500 group-hover:scale-105" /><div className="absolute inset-0 bg-gradient-to-t from-card to-transparent" /><span className="absolute top-3 left-3 rounded-xl border border-white/10 bg-background/80 px-3 py-2 text-center backdrop-blur"><span className="block text-[10px] uppercase text-primary">{new Date(e.starts_at).toLocaleDateString('es-ES', { month: 'short', timeZone: 'Europe/Madrid' })}</span><strong className="text-xl">{new Date(e.starts_at).toLocaleDateString('es-ES', { day: '2-digit', timeZone: 'Europe/Madrid' })}</strong></span></div><div className="flex flex-1 flex-col gap-3 p-5 pt-1"><span className="text-[10px] font-bold tracking-wide text-primary uppercase">En directo</span><h3 className="text-lg font-bold leading-snug">{e.title}</h3><p className="flex gap-2 text-xs text-muted-foreground"><MapPin className="size-3.5 shrink-0" />{e.venue || 'Ubicación por confirmar'}</p><span className="mt-auto flex items-center justify-between pt-5 text-xs font-semibold">Ver entradas<span className="rounded-full bg-secondary p-2"><ArrowRight className="size-4" /></span></span></div></Link></li>)}</ul> : <div className="rounded-2xl border border-dashed bg-card p-12 text-center"><CalendarDays className="mx-auto mb-4 size-8 text-primary" /><h3 className="font-semibold">{events.length ? 'No hay eventos con estos filtros' : 'Próximamente, nuevas experiencias'}</h3><p className="mt-2 text-sm text-muted-foreground">{events.length ? 'Prueba otro nombre o selecciona todos los recintos.' : 'Los eventos aparecerán aquí en cuanto se publiquen.'}</p>{events.length > 0 && <button onClick={() => { setQuery(''); setVenue('') }} className="mt-4 text-sm text-primary underline">Restablecer filtros</button>}</div>}
      </section>
      <section className="mb-16 grid gap-6 rounded-3xl border bg-gradient-to-br from-card to-primary/10 p-8 md:grid-cols-[1fr_1fr] md:p-10"><div><p className="mb-3 text-xs font-bold uppercase tracking-widest text-success">Tu acceso al directo</p><h2 className="text-3xl font-extrabold tracking-tight">Tus planes.<br />Tus entradas. Todo listo.</h2><p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">Elige tu evento, completa tus datos y guarda tu entrada para presentarla en el acceso.</p></div><div className="grid content-center gap-3">{[{ icon: Ticket, title: 'Entrada digital', text: 'Tu código de acceso, siempre a mano.' }, { icon: Zap, title: 'Sin crear una cuenta', text: 'Consigue tu entrada en pocos pasos.' }, { icon: ShieldCheck, title: 'Acceso verificado', text: 'Validación de tu entrada en la puerta del evento.' }].map(({ icon: Icon, title, text }) => <div key={title} className="flex items-center gap-4 rounded-xl bg-background/40 p-4"><Icon className="size-5 shrink-0 text-primary" /><div><h3 className="text-sm font-semibold">{title}</h3><p className="mt-1 text-xs text-muted-foreground">{text}</p></div></div>)}</div></section>
    </div>
  </div>
}
