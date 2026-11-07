'use client'

import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/field'
import { needsAttendees, validDocument, type AttendeeInput, type AttendeeRules } from '@/lib/validations/document'

/**
 * Un bloque por persona de la reserva. La persona 1 es el titular: su nombre se toma de los
 * campos principales del formulario y aquí solo se piden su documento y su fecha de nacimiento.
 */
/** Personas que necesitan bloque propio en el formulario (vacío si el evento no pide nada). */
export function attendeeBlocks(count: number, rules: AttendeeRules) {
  if (!needsAttendees(rules)) return []
  const birth = rules.require_birth_date || rules.min_age !== null
  // Sin DNI ni nacimiento, el titular no necesita bloque propio.
  return Array.from({ length: count }, (_, i) => i + 1).filter((n) => n > 1 || rules.require_document || birth)
}

/** `embedded`: dentro de un paso que ya tiene título y explica la edad mínima. */
export function AttendeeFields({ count, rules, prefix, embedded = false }: { count: number; rules: AttendeeRules; prefix: string; embedded?: boolean }) {
  const birth = rules.require_birth_date || rules.min_age !== null
  const people = attendeeBlocks(count, rules)
  if (people.length === 0) return null

  return (
    <fieldset className="grid gap-3">
      <legend className={embedded ? 'sr-only' : 'mb-2 text-sm font-medium'}>Datos de cada persona</legend>
      {!embedded && rules.min_age !== null && <p className="text-muted-foreground -mt-1 text-xs">Todas las personas deben tener al menos {rules.min_age} años el día del evento.</p>}
      {people.map((n) => (
        <div key={n} className="bg-secondary/30 grid gap-3 rounded-xl border p-4">
          <p className="flex items-center gap-2 text-sm font-medium">
            <span className="bg-card grid size-6 place-items-center rounded-full border text-xs font-semibold">{n}</span>
            {n === 1 ? 'Tú (titular)' : `Persona ${n}`}
          </p>
          {n > 1 && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nombre" htmlFor={`${prefix}-p${n}-first`}><Input id={`${prefix}-p${n}-first`} name={`p${n}_first`} required maxLength={60} autoComplete="off" /></Field>
              <Field label={`Apellidos${rules.last_name_required ? '' : ' (opcional)'}`} htmlFor={`${prefix}-p${n}-last`}><Input id={`${prefix}-p${n}-last`} name={`p${n}_last`} required={rules.last_name_required} maxLength={60} autoComplete="off" /></Field>
            </div>
          )}
          {(rules.require_document || birth) && (
            <div className="grid gap-3 sm:grid-cols-2">
              {rules.require_document && (
                <Field label="DNI, NIE o pasaporte" htmlFor={`${prefix}-p${n}-doc`}>
                  <Input id={`${prefix}-p${n}-doc`} name={`p${n}_doc`} required maxLength={30} autoComplete="off" autoCapitalize="characters" placeholder="12345678Z" />
                </Field>
              )}
              {birth && (
                <Field label="Fecha de nacimiento" htmlFor={`${prefix}-p${n}-birth`}>
                  <Input id={`${prefix}-p${n}-birth`} name={`p${n}_birth`} type="date" required />
                </Field>
              )}
            </div>
          )}
        </div>
      ))}
    </fieldset>
  )
}

/** Lee del formulario las personas (la 1 con el nombre del titular). Devuelve [] si el evento no las pide. */
export function readAttendees(form: FormData, count: number, rules: AttendeeRules, titular: { first: string; last: string }): AttendeeInput[] {
  if (!needsAttendees(rules)) return []
  return Array.from({ length: count }, (_, i) => {
    const n = i + 1, get = (field: string) => String(form.get(`p${n}_${field}`) ?? '')
    return {
      first_name: n === 1 ? titular.first : get('first'),
      last_name: n === 1 ? titular.last : get('last'),
      document_id: get('doc'),
      birth_date: get('birth'),
    }
  })
}

/** Primer error que se puede detectar ya en el navegador (el servidor lo vuelve a comprobar todo). */
export function attendeeError(people: AttendeeInput[]) {
  const bad = people.findIndex((p) => p.document_id && !validDocument(p.document_id))
  return bad >= 0 ? `El documento de la persona ${bad + 1} no es válido: revisa el número y la letra.` : ''
}
