// Toda la app trabaja en la zona horaria del organizador. Usar una zona fija
// evita diferencias entre el render del servidor (UTC) y el del navegador.
export const APP_TIME_ZONE = 'Europe/Madrid'
const LOCALE = 'es-ES'

export function formatDate(iso: string) {
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: APP_TIME_ZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(iso))
}

export function formatShortDate(iso: string) {
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: APP_TIME_ZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso))
}

export function formatTime(iso: string) {
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: APP_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

export function formatDateTime(iso: string) {
  return `${formatShortDate(iso)} · ${formatTime(iso)}`
}

export function formatPrice(value: number) {
  if (value === 0) return 'Gratis'
  return new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'EUR' }).format(value)
}

// --- Conversión para <input type="datetime-local"> --------------------------

function zoneOffsetMs(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return asUtc - date.getTime()
}

/** "2026-10-03T21:30" (hora de Madrid) → ISO UTC */
export function localInputToIso(local: string, timeZone = APP_TIME_ZONE) {
  const [datePart, timePart] = local.split('T')
  const [y, m, d] = datePart.split('-').map(Number)
  const [h, min] = timePart.split(':').map(Number)
  const guess = Date.UTC(y, m - 1, d, h, min)
  let ts = guess - zoneOffsetMs(new Date(guess), timeZone)
  // Reajuste por si el cambio de hora cae entre medias
  const second = guess - zoneOffsetMs(new Date(ts), timeZone)
  if (second !== ts) ts = second
  return new Date(ts).toISOString()
}

/** ISO UTC → "2026-10-03T21:30" en hora de Madrid */
export function isoToLocalInput(iso: string, timeZone = APP_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(iso))
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00'
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`
}

// --- Comparaciones con "ahora" (solo en servidor, fuera del render) ------------

/** ISO de hace `hours` horas. */
export function isoHoursAgo(hours: number) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
}

export function isPast(iso: string) {
  return new Date(iso).getTime() < Date.now()
}
