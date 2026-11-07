import { describe, expect, it } from 'vitest'
import { isoToLocalInput, localInputToIso } from '@/lib/format'
import { DEFAULT_DESIGN, parseDesign, renderDescription, type TicketVariables } from '@/lib/tickets/design'
import { formatTicketCode, slugify } from '@/lib/utils'
import { purchaseSchema } from '@/lib/validations/purchase'

describe('fechas en hora de Madrid', () => {
  it('convierte hora de invierno (UTC+1)', () => {
    expect(localInputToIso('2026-01-15T20:00')).toBe('2026-01-15T19:00:00.000Z')
  })
  it('convierte hora de verano (UTC+2)', () => {
    expect(localInputToIso('2026-07-15T20:00')).toBe('2026-07-15T18:00:00.000Z')
  })
  it('ida y vuelta alrededor del cambio de hora de octubre', () => {
    for (const local of ['2026-10-24T21:30', '2026-10-25T12:00', '2026-03-29T10:00']) {
      expect(isoToLocalInput(localInputToIso(local))).toBe(local)
    }
  })
})

describe('plantillas', () => {
  const vars: TicketVariables = {
    evento: 'Concierto',
    fecha: 'sábado',
    hora: '21:00',
    lugar: 'Plaza',
    tipo: 'VIP',
    descripcion_tipo: 'Con consumición',
    precio: '10,00 €',
    asistente: 'Ana',
    codigo: 'AAAA-BBBB',
  }
  it('sustituye variables, con o sin espacios', () => {
    expect(renderDescription('Hola {{asistente}}, {{ tipo }} en {{lugar}}', vars)).toBe('Hola Ana, VIP en Plaza')
  })
  it('deja intactas las variables desconocidas', () => {
    expect(renderDescription('{{inventada}}', vars)).toBe('{{inventada}}')
  })
  it('completa diseños incompletos con los valores por defecto', () => {
    expect(parseDesign({ accentColor: '#FF0000' })).toEqual({ ...DEFAULT_DESIGN, accentColor: '#FF0000' })
    expect(parseDesign(null)).toEqual(DEFAULT_DESIGN)
    expect(parseDesign({ layout: 'no-existe' })).toEqual(DEFAULT_DESIGN)
  })
})

describe('utilidades', () => {
  it('agrupa el código de la entrada', () => {
    expect(formatTicketCode('A1B2C3D4E5F6A7B8')).toBe('A1B2-C3D4-E5F6-A7B8')
  })
  it('genera slugs sin tildes', () => {
    expect(slugify('Fiesta de San Antolín ¡2026!')).toBe('fiesta-de-san-antolin-2026')
  })
})

describe('compra', () => {
  const base = { buyer_name: 'Ana López', buyer_email: 'ana@example.com' }
  const id = '5b1f7f2e-8a0b-4a39-9a55-0f3c1c0f8d11'
  it('exige al menos una entrada', () => {
    expect(purchaseSchema.safeParse({ ...base, items: [{ ticket_type_id: id, quantity: 0 }] }).success).toBe(false)
    expect(purchaseSchema.safeParse({ ...base, items: [{ ticket_type_id: id, quantity: 2 }] }).success).toBe(true)
  })
})
