'use client'

import 'leaflet/dist/leaflet.css'
import { useEffect, useRef, useState, useTransition } from 'react'
import type * as Leaflet from 'leaflet'
import { MapPin, Search, X } from 'lucide-react'
import { searchPlace, type Place } from '@/app/admin/eventos/media-actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createMap, pinIcon, SPAIN, STREET_ZOOM, type Coordinates } from '@/components/map/leaflet'

/** Mapa para marcar el punto exacto del evento: buscando la dirección o pulsando en el mapa. */
export function LocationPicker({ value, onChange, venue }: { value: Coordinates | null; onChange: (value: Coordinates | null) => void; venue: string }) {
  const element = useRef<HTMLDivElement>(null)
  const leaflet = useRef<{ L: typeof Leaflet; map: Leaflet.Map; marker?: Leaflet.Marker } | null>(null)
  const change = useRef(onChange)
  const initial = useRef(value)
  const [ready, setReady] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{ error?: string; places?: Place[] }>({})
  const [searching, startSearch] = useTransition()
  useEffect(() => { change.current = onChange }, [onChange])

  useEffect(() => {
    let cancelled = false
    const start = initial.current
    createMap(element.current!, start ? { center: [start.latitude, start.longitude], zoom: STREET_ZOOM } : SPAIN).then((created) => {
      if (cancelled) { created.map.remove(); return }
      leaflet.current = created
      created.map.on('click', (e: Leaflet.LeafletMouseEvent) => change.current({ latitude: e.latlng.lat, longitude: e.latlng.lng }))
      setReady(true)
    })
    return () => { cancelled = true; leaflet.current?.map.remove(); leaflet.current = null }
  }, [])

  // La chincheta sigue al valor del formulario (y arrastrarla lo cambia).
  useEffect(() => {
    const current = leaflet.current
    if (!ready || !current) return
    if (!value) { current.marker?.remove(); current.marker = undefined; return }
    const point: [number, number] = [value.latitude, value.longitude]
    if (current.marker) current.marker.setLatLng(point)
    else {
      const marker = current.L.marker(point, { icon: pinIcon(current.L), draggable: true, autoPan: true, keyboard: false }).addTo(current.map)
      marker.on('dragend', () => {
        const at = marker.getLatLng()
        change.current({ latitude: at.lat, longitude: at.lng })
      })
      current.marker = marker
    }
  }, [ready, value])

  const search = () => {
    const text = query.trim() || venue.trim()
    if (!text) { setResults({ error: 'Escribe una dirección o el nombre del sitio.' }); return }
    setQuery(text)
    startSearch(async () => {
      try { setResults(await searchPlace(text)) } catch { setResults({ error: 'No se pudo buscar. Comprueba la conexión.' }) }
    })
  }
  const choose = (place: Place) => {
    onChange({ latitude: place.latitude, longitude: place.longitude })
    leaflet.current?.map.setView([place.latitude, place.longitude], STREET_ZOOM)
    setResults({})
  }

  return (
    <div className="grid gap-3">
      <div className="flex gap-2">
        <Input aria-label="Buscar dirección" placeholder={venue || 'Calle, número y localidad'} value={query} onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); search() } }} />
        <Button type="button" variant="outline" disabled={searching} onClick={search}><Search className="size-4" aria-hidden />{searching ? 'Buscando…' : 'Buscar'}</Button>
      </div>
      {results.error && <p role="alert" className="text-destructive text-sm">{results.error}</p>}
      {results.places && (results.places.length ? (
        <ul className="divide-y rounded-lg border text-sm">
          {results.places.map((p) => (
            <li key={`${p.latitude},${p.longitude}`}>
              <button type="button" className="hover:bg-secondary flex w-full gap-2 px-3 py-2 text-left" onClick={() => choose(p)}>
                <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />{p.label}
              </button>
            </li>
          ))}
        </ul>
      ) : <p className="text-muted-foreground text-sm">No se ha encontrado esa dirección. Prueba con menos palabras o marca el punto en el mapa.</p>)}
      <div ref={element} className="z-0 h-72 overflow-hidden rounded-lg border" role="application" aria-label="Mapa: pulsa para marcar el lugar del evento" />
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="text-muted-foreground">{value ? 'Arrastra la chincheta o pulsa en otro sitio para afinar.' : 'Pulsa en el mapa para marcar el lugar exacto.'}</p>
        {value && <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}><X className="size-4" aria-hidden />Quitar ubicación</Button>}
      </div>
    </div>
  )
}
