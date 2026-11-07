export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10" aria-busy="true" aria-live="polite">
      <div className="bg-muted h-9 w-64 animate-pulse rounded-md" />
      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-muted aspect-[4/3] animate-pulse rounded-xl" />
        ))}
      </div>
      <span className="sr-only">Cargando…</span>
    </div>
  )
}
