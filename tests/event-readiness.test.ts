import { describe, expect, it } from 'vitest'
import { formReadiness, publicClosedReason } from '@/lib/event-readiness'

const DAY = 24 * 60 * 60 * 1000
const inDays = (n: number) => new Date(Date.now() + n * DAY).toISOString()
const ready = {
  status: 'published', registration_enabled: true, registration_mode: 'pickup', privacy_controller: 'Cuadrilla',
  privacy_contact: 'privacidad@example.invalid', pickup_address: 'Boulevard Café', capacity: 500,
  starts_at: inDays(60), ends_at: null, reservations_open_at: null, reservations_close_at: null, pickup_deadline: inDays(50),
}
const errors = (r: ReturnType<typeof formReadiness>) => r.items.filter((i) => i.level === 'error').map((i) => i.key)

describe('lista de comprobación del formulario público', () => {
  it('con todo configurado, las reservas están abiertas', () => {
    const r = formReadiness(ready, 1)
    expect(r.open).toBe(true)
    expect(errors(r)).toEqual([])
    expect(publicClosedReason(r)).toBeNull()
  })
  it('señala exactamente lo que falta (el caso del borrador recién creado)', () => {
    const r = formReadiness({ ...ready, status: 'draft', privacy_contact: '', pickup_address: ' ' }, 0)
    expect(r.open).toBe(false)
    expect(errors(r)).toEqual(['published', 'privacy', 'types', 'address'])
    expect(r.items.find((i) => i.key === 'published')?.fix).toMatch(/Publicado/)
    expect(publicClosedReason(r)).toBe('Las reservas no están disponibles en este momento.')
  })
  it('apertura futura: cerradas sin errores y con la fecha para el público', () => {
    const r = formReadiness({ ...ready, reservations_open_at: inDays(2) }, 1)
    expect(r.open).toBe(false)
    expect(errors(r)).toEqual([])
    expect(publicClosedReason(r, inDays(2))).toMatch(/^Las reservas se abren el /)
  })
  it('plazos vencidos: el público ve que el plazo terminó', () => {
    const r = formReadiness({ ...ready, pickup_deadline: inDays(-1) }, 1)
    expect(errors(r)).toEqual(['deadline'])
    expect(publicClosedReason(r)).toBe('El plazo de reservas ha terminado.')
  })
  it('sin aforo total es un aviso, no impide abrir; otras modalidades no piden punto de recogida', () => {
    const r = formReadiness({ ...ready, capacity: null, registration_mode: 'manual', pickup_address: '' }, 1)
    expect(r.open).toBe(true)
    expect(r.items.find((i) => i.key === 'capacity')?.level).toBe('warning')
    expect(r.items.some((i) => i.key === 'address')).toBe(false)
  })
})
