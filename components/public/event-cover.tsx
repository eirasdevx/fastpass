import { cn } from '@/lib/utils'

/** Portada del evento con degradado de respaldo cuando no hay imagen. */
export function EventCover({ url, title, className }: { url: string | null; title: string; className?: string }) {
  return (
    <div
      role="img"
      aria-label={`Imagen de ${title}`}
      className={cn('from-accent/70 to-primary/80 bg-gradient-to-br bg-cover bg-center', className)}
      style={url ? { backgroundImage: `url("${url.replace(/"/g, '%22')}")` } : undefined}
    />
  )
}
