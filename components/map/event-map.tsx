'use client'

import 'leaflet/dist/leaflet.css'
import { useEffect, useRef } from 'react'
import { Navigation } from 'lucide-react'
import { createMap, directionsUrl, pinIcon, STREET_ZOOM, type Coordinates } from '@/components/map/leaflet'

/** Mapa de solo lectura de la página pública, con enlace para llegar en Google Maps. */
export function EventMap({ latitude, longitude, label }: Coordinates & { label: string }) {
  const element = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let map: { remove(): void } | undefined
    let cancelled = false
    createMap(element.current!, { center: [latitude, longitude], zoom: STREET_ZOOM, scrollWheelZoom: false }).then(({ L, map: created }) => {
      if (cancelled) { created.remove(); return }
      map = created
      L.marker([latitude, longitude], { icon: pinIcon(L), keyboard: false, title: label }).addTo(created)
    })
    return () => { cancelled = true; map?.remove() }
  }, [latitude, longitude, label])

  return (
    <div className="grid gap-3">
      <div ref={element} className="z-0 h-64 overflow-hidden rounded-2xl border sm:h-80" role="img" aria-label={`Mapa con la ubicación de ${label}`} />
      <a href={directionsUrl({ latitude, longitude })} target="_blank" rel="noopener noreferrer"
        className="text-primary inline-flex w-fit items-center gap-2 text-sm font-semibold hover:underline">
        <Navigation className="size-4" aria-hidden />Cómo llegar (abre Google Maps)
      </a>
    </div>
  )
}
