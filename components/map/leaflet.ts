import type * as Leaflet from 'leaflet'

export type Coordinates = { latitude: number; longitude: number }

/** Centro de España para cuando todavía no hay punto marcado. */
export const SPAIN = { center: [40.2, -3.7] as [number, number], zoom: 5 }
export const STREET_ZOOM = 16

/** Carga Leaflet solo en el navegador (usa window) y crea un mapa con OpenStreetMap. */
export async function createMap(element: HTMLElement, options: Leaflet.MapOptions) {
  const L = await import('leaflet')
  const map = L.map(element, options)
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    // La web no envía Referer (Referrer-Policy: no-referrer) y OpenStreetMap lo exige para servir los mapas.
    referrerPolicy: 'strict-origin-when-cross-origin',
  }).addTo(map)
  return { L, map }
}

/** Chincheta propia: los iconos por defecto de Leaflet no se encuentran al empaquetar. */
export function pinIcon(L: typeof Leaflet) {
  return L.divIcon({
    className: '',
    html: '<span style="display:block;width:26px;height:26px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#e11d48;border:3px solid #fff;box-shadow:0 2px 6px rgb(0 0 0 / .45)"></span>',
    iconSize: [26, 26],
    iconAnchor: [13, 30],
  })
}

export function directionsUrl({ latitude, longitude }: Coordinates) {
  return `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`
}
