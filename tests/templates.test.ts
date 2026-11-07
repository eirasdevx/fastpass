import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  RESERVATION_NOTICE, blankPreset, blockDesignSchema, fillVariables, fromLegacy, parseBlockDesign, reservationPreset, ticketPreset,
} from '@/lib/tickets/blocks'
import { DEFAULT_DESIGN } from '@/lib/tickets/design'
import { reservationVariables, SAMPLE_RESERVATION } from '@/lib/tickets/template-data'
import { templateSchema } from '@/lib/validations/template'
import { validDocument } from '@/lib/validations/document'
import { BlockCard } from '@/components/ticket/block-card'

describe('plantillas por bloques', () => {
  it('los modelos de partida y la conversión de plantillas antiguas son válidos', () => {
    for (const design of [ticketPreset(), reservationPreset(), blankPreset('ticket'), blankPreset('reservation'), fromLegacy(DEFAULT_DESIGN, '{{tipo}}')]) {
      expect(blockDesignSchema.safeParse(design).success).toBe(true)
      expect(templateSchema.safeParse({ name: 'X', description_template: '', design }).success).toBe(true)
    }
    expect(templateSchema.safeParse({ name: 'X', description_template: '', design: DEFAULT_DESIGN }).success).toBe(true)
  })
  it('rechaza imágenes con esquemas peligrosos, columnas anidadas y formato desconocido', () => {
    const bad = (blocks: unknown[]) => blockDesignSchema.safeParse({ ...blankPreset('ticket'), blocks }).success
    expect(bad([{ id: 'i', type: 'image', url: 'javascript:alert(1)', height: 40, align: 'left' }])).toBe(false)
    const columns = { id: 'c', type: 'columns', ratio: '1:1', valign: 'top', left: [], right: [] }
    expect(bad([{ ...columns, left: [columns] }])).toBe(false)
    expect(bad([{ id: 'x', type: 'script', text: 'hola' }])).toBe(false)
    expect(parseBlockDesign({ version: 1 })).toBeNull()
  })
  it('sustituye variables y deja visibles las desconocidas', () => {
    expect(fillVariables('{{ titular }} · {{nada}}', { titular: 'Ana' })).toBe('Ana · {{nada}}')
  })
  it('el justificante lleva siempre el aviso, aunque la plantilla esté vacía, y solo usa estilos en línea', () => {
    const html = renderToStaticMarkup(createElement(BlockCard, {
      design: blankPreset('reservation'), vars: reservationVariables(SAMPLE_RESERVATION), qrValue: null, shortCode: 'B8X8',
    }))
    expect(html).toContain(RESERVATION_NOTICE)
    expect(html).not.toMatch(/class="/)
    expect(html).toContain('print-color-adjust:exact')
  })
  it('pinta los datos de la reserva; sin QR cuando no está activa', () => {
    const html = renderToStaticMarkup(createElement(BlockCard, {
      design: reservationPreset(), vars: reservationVariables(SAMPLE_RESERVATION), qrValue: null, shortCode: 'B8X8', stamp: 'Cancelada',
    }))
    expect(html).toContain('Lucía Martín')
    expect(html).toContain('2. Hugo Pérez · •••••567L')
    expect(html).toContain('B8X8')
    expect(html).toContain('Cancelada')
    expect(html).not.toContain('<svg')
  })
  it('con la reserva activa dibuja el QR en SVG y escapa los textos', () => {
    const html = renderToStaticMarkup(createElement(BlockCard, {
      design: reservationPreset(), vars: { ...reservationVariables(SAMPLE_RESERVATION), titular: '<img src=x onerror=alert(1)>' }, qrValue: 'https://x/reserva/abc', shortCode: 'B8X8',
    }))
    expect(html).toMatch(/<svg[^>]*viewBox="0 0 \d+ \d+"/)
    expect(html).not.toContain('<img src=x')
    expect(html).not.toMatch(/class="/)
  })
})

describe('documentos de identidad', () => {
  it('comprueba la letra de DNI y NIE y acepta pasaportes', () => {
    expect(validDocument('12345678Z')).toBe(true)
    expect(validDocument('12.345.678-z')).toBe(true)
    expect(validDocument('12345678A')).toBe(false)
    expect(validDocument('X1234567L')).toBe(true)
    expect(validDocument('Y1234567X')).toBe(true)
    expect(validDocument('X1234567A')).toBe(false)
    expect(validDocument('PAA123456')).toBe(true)
    expect(validDocument('A1')).toBe(false)
  })
})
