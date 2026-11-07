// Esqueleto con la forma de una página del panel: cabecera, cifras y listado.
export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="space-y-2">
        <div className="bg-muted h-8 w-56 animate-pulse rounded-lg" />
        <div className="bg-muted h-4 w-80 max-w-full animate-pulse rounded-md" />
      </div>
      <div className="bg-muted h-14 animate-pulse rounded-2xl" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => <div key={i} className="bg-muted h-24 animate-pulse rounded-2xl" />)}
      </div>
      <div className="bg-muted h-72 animate-pulse rounded-2xl" />
      <span className="sr-only">Cargando…</span>
    </div>
  )
}
