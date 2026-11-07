import { z } from 'zod'

const LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE'

/** Quita espacios, puntos y guiones y pasa a mayúsculas: «12.345.678-z» → «12345678Z». */
export const normalizeDocument = (value: string) => value.replace(/[\s.-]/g, '').toUpperCase()

/** DNI y NIE con su letra de control; otros documentos (pasaporte…) solo con formato básico. Igual que en la base de datos. */
export function validDocument(value: string) {
  const v = normalizeDocument(value)
  if (/^[0-9]{8}[A-Z]$/.test(v)) return LETTERS[Number(v.slice(0, 8)) % 23] === v[8]
  if (/^[XYZ][0-9]{7}[A-Z]$/.test(v)) return LETTERS[Number('XYZ'.indexOf(v[0]) + v.slice(1, 8)) % 23] === v[8]
  return /^[A-Z0-9]{5,20}$/.test(v)
}

export type AttendeeRules = { attendee_details: boolean; require_document: boolean; require_birth_date: boolean; min_age: number | null; last_name_required: boolean }

/** ¿Hay que pedir datos de cada persona? Si se piden DNI o nacimiento, a todas (titular incluido). */
export const needsAttendees = (r: AttendeeRules) => r.attendee_details || r.require_document || r.require_birth_date || r.min_age !== null

export const attendeeSchema = z.object({
  first_name: z.string().trim().min(1, 'Introduce el nombre').max(60),
  last_name: z.string().trim().max(60),
  document_id: z.string().trim().max(30).transform(normalizeDocument).refine((v) => v === '' || validDocument(v), 'Documento no válido: revisa el número y la letra'),
  birth_date: z.union([z.literal(''), z.iso.date('Fecha no válida')]),
})
export type AttendeeInput = z.input<typeof attendeeSchema>
